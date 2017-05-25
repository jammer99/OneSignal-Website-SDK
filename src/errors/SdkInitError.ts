import OneSignalError from "./OneSignalError";


export enum SdkInitErrorKind {
  AppNotConfiguredForWebPush,
  MissingSubdomain,
  MultipleInitialization,
  MissingSafariWebId
}

export class SdkInitError extends OneSignalError {
  reason: string;

  constructor(reason: SdkInitErrorKind) {
    switch (reason) {
      case SdkInitErrorKind.AppNotConfiguredForWebPush:
        super('OneSignal: This app ID does not have any web platforms enabled. Double check your app ID, or see step 1 on our setup guide (https://goo.gl/01h7fZ).');
        break;
      case SdkInitErrorKind.MissingSubdomain:
        super('OneSignal: Non-HTTPS pages require a subdomain of OneSignal to be chosen on your dashboard. See step 1.4 on our setup guide (https://goo.gl/xip6JB).');
        break;
      case SdkInitErrorKind.MultipleInitialization:
        super('OneSignal: The OneSignal web SDK can only be initialized once. Extra initializations are ignored. Please remove calls initializing the SDK more than once.');
        break;
      case SdkInitErrorKind.MissingSafariWebId:
        super('OneSignal: Safari browser support on Mac OS X requires the Safari web platform to be enabled. Please see the Safari Support steps in our web setup guide.');
        break;
    }
    this.reason = SdkInitErrorKind[reason];
  }
}
