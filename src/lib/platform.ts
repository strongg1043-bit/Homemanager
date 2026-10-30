// Detects when the web app is running inside the Google Play (Trusted Web Activity) build.
//
// A TWA launch sets document.referrer to "android-app://<package-name>". The referrer is
// only reliable for the first document, so the result is remembered in sessionStorage.
// sessionStorage (not localStorage) on purpose: a TWA shares storage with Chrome for the
// same origin, and a persistent flag would wrongly mark ordinary Chrome visits as the app.

const ANDROID_APP_REFERRER = 'android-app://';
const SESSION_KEY = 'ha_android_app';

export function isAndroidApp(): boolean {
  const fromReferrer = document.referrer.startsWith(ANDROID_APP_REFERRER);
  try {
    if (fromReferrer) sessionStorage.setItem(SESSION_KEY, '1');
    return fromReferrer || sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return fromReferrer; // storage blocked — fall back to the referrer alone
  }
}

/**
 * Kill switch for in-app purchases in the Play Store build.
 *
 * Google Play generally requires Google Play Billing for digital subscriptions sold inside an
 * app it distributes. While VITE_HIDE_BILLING_IN_ANDROID_APP is unset or not "true" (the
 * default) nothing changes. Set it to "true" at build time and redeploy hosting to hide every
 * price and checkout entry point when the app is opened from the Android app; the website and
 * the installed PWA are unaffected.
 */
export function billingHidden(): boolean {
  return import.meta.env.VITE_HIDE_BILLING_IN_ANDROID_APP === 'true' && isAndroidApp();
}
