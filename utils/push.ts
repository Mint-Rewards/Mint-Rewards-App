/**
 * Push registration.
 *
 * The app has never asked for a push token before, so everything here is new
 * ground: permission, the APNs handshake, and the FCM registration token that
 * a message is finally addressed to.
 *
 * Firebase messaging rather than expo-notifications because the server side is
 * FCM — the notification service's provider speaks FCM, and the Firebase
 * project already has both iOS apps registered (com.mintrewards.app and
 * com.mintrewards.app.dev). Going through Expo's push service would put a
 * second broker in the path that the backend does not talk to.
 */
import messaging from "@react-native-firebase/messaging";
import { Platform } from "react-native";

export type PushPermission = "granted" | "denied" | "provisional" | "unsupported";

export interface PushRegistration {
  permission: PushPermission;
  /** The FCM registration token, or null when permission was refused. */
  token: string | null;
  /** Set when the handshake failed rather than being declined. */
  error?: string;
}

/**
 * iOS only for now.
 *
 * Android 13+ needs POST_NOTIFICATIONS in the manifest and its own runtime
 * prompt, and neither is in this build. Returning "unsupported" is honest;
 * pretending to register would hand back a token that never receives anything.
 */
export function pushIsSupported(): boolean {
  return Platform.OS === "ios";
}

/**
 * Asks for permission and returns the token to address this device by.
 *
 * Safe to call more than once. iOS answers from its stored decision after the
 * first prompt, so this does not re-prompt someone who already refused.
 */
export async function registerForPush(): Promise<PushRegistration> {
  if (!pushIsSupported()) return { permission: "unsupported", token: null };

  try {
    const status = await messaging().requestPermission();
    const { AuthorizationStatus } = messaging;

    if (status === AuthorizationStatus.DENIED) return { permission: "denied", token: null };

    const permission: PushPermission =
      status === AuthorizationStatus.PROVISIONAL ? "provisional" : "granted";

    // The APNs token has to exist before FCM can mint one against it. RNFirebase
    // registers automatically, but on a cold first launch getToken() can win the
    // race and throw "No APNS token specified".
    if (!messaging().isDeviceRegisteredForRemoteMessages) {
      await messaging().registerDeviceForRemoteMessages();
    }

    return { permission, token: await messaging().getToken() };
  } catch (err) {
    return {
      permission: "granted",
      token: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fires when FCM reissues the token.
 *
 * It happens on reinstall, restore-to-new-device, and occasionally on its own.
 * A stored token that is never refreshed goes quietly dead, which looks exactly
 * like a broken notification pipeline, so the caller has to be able to hear it.
 */
export function onPushTokenRefresh(handler: (token: string) => void): () => void {
  if (!pushIsSupported()) return () => {};
  return messaging().onTokenRefresh(handler);
}
