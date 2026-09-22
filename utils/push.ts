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
import { Platform } from "react-native";
import { API_BASE_URL, ENV } from "@/config/env";

/**
 * Loaded lazily, the same way utils/googleAuth.ts loads Google Sign-In.
 *
 * A static import pulls the native module in whenever anything that reaches
 * this file is loaded — including store/store.ts, which signOut imports from.
 * That crashes at module-evaluation time wherever the native binary is absent:
 * Expo Go, and every Jest suite that touches the store.
 */
type Messaging = typeof import("@react-native-firebase/messaging").default;

let cached: Messaging | null = null;

function messagingModule(): Messaging | null {
  if (cached) return cached;
  try {
    cached = require("@react-native-firebase/messaging").default as Messaging;
  } catch {
    console.warn("[push] Firebase messaging native module not found — push is unavailable");
    cached = null;
  }
  return cached;
}

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

  const fcm = messagingModule();
  if (!fcm) return { permission: "unsupported", token: null };

  try {
    const status = await fcm().requestPermission();
    const { AuthorizationStatus } = fcm;

    if (status === AuthorizationStatus.DENIED) return { permission: "denied", token: null };

    const permission: PushPermission =
      status === AuthorizationStatus.PROVISIONAL ? "provisional" : "granted";

    // The APNs token has to exist before FCM can mint one against it. RNFirebase
    // registers automatically, but on a cold first launch getToken() can win the
    // race and throw "No APNS token specified".
    if (!fcm().isDeviceRegisteredForRemoteMessages) {
      await fcm().registerDeviceForRemoteMessages();
    }

    return { permission, token: await fcm().getToken() };
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
  const fcm = messagingModule();
  if (!pushIsSupported() || !fcm) return () => {};
  return fcm().onTokenRefresh(handler);
}

// ------------------------------------------------------- server registration

/**
 * Hands the token to the backend, which forwards it to the notification
 * service with a service credential the app is not allowed to hold.
 *
 * Returns a boolean rather than throwing: a device that cannot be registered
 * means a missed notification later, which must never be allowed to fail a
 * sign-in or block the UI.
 */
export async function registerDeviceToken(
  token: string,
  authToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/devices`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The stored token ALREADY carries its scheme: the backend issues it
        // as `Bearer <jwt>` (see /api/users/login and /api/auth/google), and
        // every other call in this app sends it verbatim. Adding a prefix here
        // produced "Bearer Bearer <jwt>", which checkAuth splits on the space
        // and then fails to verify — a 401 that looks nothing like its cause.
        authorization: authToken,
      },
      body: JSON.stringify({
        token,
        platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
        appVersion: ENV.appVersion,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Releases the token on sign-out.
 *
 * Without this the next person to sign in on this handset keeps receiving the
 * previous user's notifications until they happen to register — a privacy
 * problem, not an inconvenience.
 */
export async function unregisterDeviceToken(authToken: string): Promise<void> {
  const fcm = messagingModule();
  if (!pushIsSupported() || !fcm) return;
  try {
    const token = await fcm().getToken();
    await fetch(`${API_BASE_URL}/api/devices`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        // The stored token ALREADY carries its scheme: the backend issues it
        // as `Bearer <jwt>` (see /api/users/login and /api/auth/google), and
        // every other call in this app sends it verbatim. Adding a prefix here
        // produced "Bearer Bearer <jwt>", which checkAuth splits on the space
        // and then fails to verify — a 401 that looks nothing like its cause.
        authorization: authToken,
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Signing out must not depend on the network.
  }
}

// ----------------------------------------------------------- opening a push

export interface OpenedNotification {
  /** The `event` the sender set, e.g. "pickup.invited". Null if absent. */
  event: string | null;
  collectionId: string | null;
  stopId: string | null;
}

function readPayload(message: { data?: Record<string, unknown> } | null): OpenedNotification {
  const data = message?.data ?? {};
  const str = (value: unknown) => (typeof value === "string" && value ? value : null);
  return {
    event: str(data.event),
    collectionId: str(data.collectionId),
    stopId: str(data.stopId),
  };
}

/**
 * Fires when a notification is TAPPED, from either state it can be tapped in.
 *
 * Two separate mechanisms, which is the part that is easy to get half right:
 * `onNotificationOpenedApp` covers a backgrounded app being brought forward,
 * and `getInitialNotification` covers an app that was not running at all and
 * was launched by the tap. Wiring only the first means every tap from a
 * quit app silently opens the home screen, which is exactly the case a user
 * hits first thing in the morning.
 *
 * `getInitialNotification` reports the launching notification once and then
 * returns null, so it is safe to call on every mount.
 */
export function onNotificationOpened(
  handler: (notification: OpenedNotification) => void,
): () => void {
  const fcm = messagingModule();
  if (!pushIsSupported() || !fcm) return () => {};

  let alive = true;
  fcm()
    .getInitialNotification()
    .then((message) => {
      if (alive && message) handler(readPayload(message));
    })
    .catch(() => {
      // A cold start with no launching notification is the normal case.
    });

  const unsubscribe = fcm().onNotificationOpenedApp((message) => {
    if (alive) handler(readPayload(message));
  });

  return () => {
    alive = false;
    unsubscribe();
  };
}
