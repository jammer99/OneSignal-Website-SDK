import { isPushNotificationsSupported, isBrowserSafari, isSupportedFireFox, isBrowserFirefox, getFirefoxVersion, isSupportedSafari, getConsoleStyle, addCssClass, removeCssClass, once, nothing } from '../utils.js';
import log from 'loglevel';
import Event from '../events.js';
import AnimatedElement from './AnimatedElement.js';
import ActiveAnimatedElement from './ActiveAnimatedElement.js';


export default class Launcher extends ActiveAnimatedElement {

  constructor(bell) {
    super('.onesignal-bell-launcher', 'onesignal-bell-launcher-active', null, null, 'onesignal-bell-launcher-inactive', 'hidden', 'active');

    this.bell = bell;
    this.wasInactive = false;
  }

  resize(size) {
    removeCssClass(this.element, 'onesignal-bell-launcher-sm');
    removeCssClass(this.element, 'onesignal-bell-launcher-md');
    removeCssClass(this.element, 'onesignal-bell-launcher-lg');
    if (size === 'small') {
      addCssClass(this.element, 'onesignal-bell-launcher-sm')
    }
    else if (size === 'medium') {
      addCssClass(this.element, 'onesignal-bell-launcher-md')
    }
    else if (size === 'large') {
      addCssClass(this.element, 'onesignal-bell-launcher-lg')
    }
    else {
      throw new Error('Invalid OneSignal bell size ' + size);
    }
    if (!this.shown) {
      return Promise.resolve(this);
    }
    else {
      return new Promise((resolve) => {
        // Once the launcher has finished shrinking down
        once(this.element, 'transitionend', (event, destroyListenerFn) => {
          if (event.target === this.element &&
            event.propertyName === this.targetTransitionEvent) {
            // Uninstall the event listener for transitionend
            destroyListenerFn();
            return resolve(this);
          }
        }, true);
      });
    }
  }

  activateIfInactive() {
    if (this.inactive) {
      this.wasInactive = true;
      return this.activate();
    }
    else return nothing();
  }

  inactivateIfWasInactive() {
    if (this.wasInactive) {
      this.wasInactive = false;
      return this.inactivate();
    }
    else return nothing();
  }

  clearIfWasInactive() {
    this.wasInactive = false;
  }

  inactivate() {
    return this.bell.message.hide()
      .then(() => {
        if (this.bell.badge.content.length > 0) {
          return this.bell.badge.hide()
            .then(() => Promise.all([super.inactivate(), this.resize('small')]))
            .then(() => this.bell.badge.show())
            .catch((e) => log.error(e))
        }
        else {
          return Promise.all([super.inactivate(), this.resize('small')]);
        }
      });
  }

  activate() {
    if (this.bell.badge.content.length > 0) {
      return this.bell.badge.hide()
        .then(() => Promise.all([super.activate(), this.resize(this.bell.options.size)]))
        .then(() => this.bell.badge.show())
        .catch((e) => log.error(e))
    }
    else {
      return Promise.all([super.activate(), this.resize(this.bell.options.size)]);
    }
  }
}