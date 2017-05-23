import Postmam from '../../Postmam';
import { MessengerMessageEvent } from '../../models/MessengerMessageEvent';
import Database from "../../services/Database";
import Event from "../../Event";
import EventHelper from "../../helpers/EventHelper";
import { timeoutPromise, unsubscribeFromPush } from "../../utils";
import TimeoutError from '../../errors/TimeoutError';
import { ProxyFrameInitOptions } from '../../models/ProxyFrameInitOptions';
import { Uuid } from '../../models/Uuid';
import ServiceWorkerHelper from "../../helpers/ServiceWorkerHelper";
import * as objectAssign from 'object-assign';
import SdkEnvironment from '../../managers/SdkEnvironment';
import { InvalidStateReason } from "../../errors/InvalidStateError";
import HttpHelper from "../../helpers/HttpHelper";
import TestHelper from "../../helpers/TestHelper";
import InitHelper from "../../helpers/InitHelper";
import MainHelper from "../../helpers/MainHelper";
import SubscriptionHelper from '../../helpers/SubscriptionHelper';

export default class RemoteFrame implements Disposable {
  protected messenger: Postmam;
  protected options: ProxyFrameInitOptions;

  constructor(initOptions: any) {
    this.options = {
      appId: new Uuid(initOptions.appId),
      subdomain: initOptions.subdomainName,
      originUrl: new URL(initOptions.origin)
    };
  }

  /**
   * Loads the messenger on the iFrame to communicate with the host page and
   * assigns init options to an iFrame-only initialization of OneSignal.
   *
   * Our main host page will wait for all iFrame scripts to complete since the
   * host page uses the iFrame onload event to begin sending handshake messages
   * to the iFrame.
   *
   * There is no load timeout here; the iFrame initializes it scripts and waits
   * forever for the first handshake message.
   */
  initialize(): void {
    ServiceWorkerHelper.applyServiceWorkerEnvPrefixes();

    const creator = window.opener || window.parent;
    if (creator == window) {
      document.write(`<span style='font-size: 14px; color: red; font-family: sans-serif;'>OneSignal: This page cannot be directly opened, and must be opened as a result of a subscription call.</span>`);
      return;
    }

    // The rest of our SDK isn't refactored enough yet to accept typed objects
    // Within this class, we can use them, but when we assign them to
    // OneSignal.config, assign the simple string versions
    const rasterizedOptions = objectAssign(this.options);
    rasterizedOptions.appId = rasterizedOptions.appId.value;
    rasterizedOptions.origin = rasterizedOptions.origin.origin;
    OneSignal.config = rasterizedOptions || {};
    OneSignal.initialized = true;

    this.establishCrossOriginMessaging();
  }

  establishCrossOriginMessaging(): void {

  }

  dispose(): void {
    // Removes all events
    this.messenger.destroy();
  }

  async subscribe() {
    // Do not register OneSignalSDKUpdaterWorker.js for HTTP popup sites; the file does not exist
    const isPushEnabled = await OneSignal.isPushNotificationsEnabled();
    if (!isPushEnabled) {
      try {
        const workerRegistration = await navigator.serviceWorker.register(OneSignal.SERVICE_WORKER_PATH, OneSignal.SERVICE_WORKER_PARAM)
        SubscriptionHelper.enableNotifications(workerRegistration);
      } catch (e) {
        log.error('Failed to register service worker in the popup/modal:', e);
      }
    } else {
      window.close();
    }
  }

  /**
   * Shortcut method to messenger.message().
   */
  public message(...args) {
    this.messenger.message.apply(this.messenger, arguments);
  }
}
