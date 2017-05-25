import Postmam from '../../Postmam';
import { MessengerMessageEvent } from '../../models/MessengerMessageEvent';
import Database from "../../services/Database";
import Event from "../../Event";
import EventHelper from "../../helpers/EventHelper";
import { timeoutPromise } from "../../utils";
import TimeoutError from '../../errors/TimeoutError';
import * as log from 'loglevel';

/**
 * Manager for an instance of the OneSignal proxy frame, for use from the main
 * page (not the iFrame itself).
 *
 * This is loaded as subdomain.onesignal.com/webPushIFrame or
 * subdomain.os.tc/webPushIFrame. *
 */
export default class ProxyFrameHost implements Disposable {

  public url: URL;
  private element: HTMLIFrameElement;
  private messenger: Postmam;

  // Promise to track whether the frame has finished loading
  private loadPromise: {
    promise: Promise<void>,
    resolver: Function,
    rejector: Function
  }

  /**
   * How long to wait to load the proxy frame before timing out.
   */
  static get LOAD_TIMEOUT_MS() {
    return 15000;
  }

  /**
   *
   * @param origin The URL object describing the origin to load.
   */
  constructor(origin: URL) {
    this.url = origin;
    this.url.pathname = 'webPushIframe';
  }

  /**
   * Creates and loads an iFrame on the DOM, replacing any existing iFrame of
   * the same URL.
   *
   * Rejects with a TimeoutError if the frame doesn't load within a specified time.
   */
  async load(): Promise<void> {
    /*
      This class removes existing iFrames with the same URL. This prevents
      multiple iFrames to the same origin, which can cause issues with
      cross-origin messaging.
    */
    log.debug('Opening an iFrame to', this.url.toString());
    this.removeFrame();

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = this.url.toString();
    (iframe as any).sandbox = 'allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation';
    (this as any).loadPromise = {};
    (this as any).loadPromise.promise = new Promise((resolve, reject) => {
        this.loadPromise.resolver = resolve;
        this.loadPromise.rejector = reject;
    });
    document.body.appendChild(iframe);
    iframe.onload = this.onFrameLoad.bind(this);

    this.element = iframe;
    // Display a timeout warning if frame doesn't load in time, but don't prevent it from loading if the network is just slow
    timeoutPromise(this.loadPromise.promise, ProxyFrameHost.LOAD_TIMEOUT_MS).catch(e => {
      if (window === window.top) {
        log.warn(`OneSignal: Loading the required iFrame ${this.url.toString()} timed out. Check that the Site URL onesignal.com dashboard web config is ${location.origin}. Only the Site URL specified there is allowed to use load the iFrame.`);
      }
    });
    return this.loadPromise.promise;
  }

  removeFrame() {
    const existingInstance = document.querySelector(`iFrame[src='${this.url.toString()}'`);
    if (existingInstance) {
      existingInstance.remove();
    }
  }

  onFrameLoad(e: UIEvent): void {
    this.establishCrossOriginMessaging();
  }

  establishCrossOriginMessaging() {
    if (this.messenger) {
      // Remove all previous events; window message events should not go to any previous listeners
      this.messenger.destroy();
    }
    this.messenger = new Postmam(this.element.contentWindow, this.url.toString(), this.url.toString());
    this.messenger.on(OneSignal.POSTMAM_COMMANDS.CONNECTED, this.onMessengerConnect.bind(this));
    this.messenger.on(OneSignal.POSTMAM_COMMANDS.REMOTE_RETRIGGER_EVENT, this.onRemoteRetriggerEvent.bind(this));
    this.messenger.on(OneSignal.POSTMAM_COMMANDS.REMOTE_NOTIFICATION_PERMISSION_CHANGED, this.onRemoteNotificationPermissionChanged.bind(this));
    this.messenger.on(OneSignal.POSTMAM_COMMANDS.REQUEST_HOST_URL, this.onRequestHostUrl.bind(this));
    this.messenger.on(OneSignal.POSTMAM_COMMANDS.SERVICEWORKER_COMMAND_REDIRECT, this.onServiceWorkerCommandRedirect.bind(this));
    this.messenger.on(OneSignal.POSTMAM_COMMANDS.HTTP_PERMISSION_REQUEST_RESUBSCRIBE, this.onHttpPermissionRequestResubscribe.bind(this));
    this.messenger.connect();
  }

  dispose() {
    // Removes all events
    this.messenger.destroy();
    this.removeFrame();
  }

  async onMessengerConnect(e: MessengerMessageEvent) {
    log.debug(`Successfully established cross-origin communication for iFrame at ${this.url.toString()}`);

    let defaultUrl = await Database.get<string>('Options', 'defaultUrl');
    let defaultTitle = await Database.get<string>('Options', 'defaultTitle');

    defaultUrl = defaultUrl ? defaultUrl : location.href;
    defaultTitle = defaultTitle ? defaultTitle : document.title;

    this.messenger.message(OneSignal.POSTMAM_COMMANDS.IFRAME_POPUP_INITIALIZE, {
      hostInitOptions: JSON.parse(JSON.stringify(OneSignal.config)), // Removes functions and unmessageable objects
      defaultUrl: defaultUrl,
      pageUrl: window.location.href,
      pageTitle: defaultTitle,
    }, reply => {
      if (reply.data === OneSignal.POSTMAM_COMMANDS.REMOTE_OPERATION_COMPLETE) {
        this.loadPromise.resolver();
        // This needs to be initialized so that isSubscribed() can be called to
        // determine whethe rthe user is subscribed to Frame A or B
        //Event.trigger(OneSignal.EVENTS.SDK_INITIALIZED);
      }
      return false;
    });
  }

  onRemoteRetriggerEvent(message: MessengerMessageEvent) {
    // e.g. { eventName: 'subscriptionChange', eventData: true}
    let {eventName, eventData} = (message.data as any);
    Event.trigger(eventName, eventData, message.source);
    return false;
  }

  onRemoteNotificationPermissionChanged(message: MessengerMessageEvent) {
    let {forceUpdatePermission} = (message.data as any);
    EventHelper.triggerNotificationPermissionChanged(forceUpdatePermission);
    return false;
  }

  onRequestHostUrl(message: MessengerMessageEvent) {
    message.reply(location.href);
    return false;
  }

  onServiceWorkerCommandRedirect(message: MessengerMessageEvent) {
    window.location.href = (message.data as any);
    return false;
  }

  onHttpPermissionRequestResubscribe(message: MessengerMessageEvent) {
    log.debug('(Reposted from iFrame -> Host) User unsubscribed but permission granted. Re-prompting the user for push.');
    OneSignal.showHttpPrompt({ __sdkCall: true, __useHttpPermissionRequestStyle: true }).catch(e => {
      log.debug('[Resubscribe Prompt Error]', e);
    });
    return false;
  }

  isSubscribed(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.messenger.message(OneSignal.POSTMAM_COMMANDS.IS_SUBSCRIBED, null, reply => {
        resolve(reply.data);
      });
    });
  }

  /**
   * Shortcut method to messenger.message().
   */
  message(...args) {
    this.messenger.message.apply(this.messenger, arguments);
  }
}
