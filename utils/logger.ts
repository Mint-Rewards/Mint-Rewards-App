import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

// ============================================================================
// CONFIG
// ============================================================================

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://mint-rewards-backend.vercel.app";
// const API_URL =
//   process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.18.82:3000";

const APP_VERSION = Constants.expoConfig?.version ?? "unknown";
const BUILD_NUMBER =
  Constants.expoConfig?.ios?.buildNumber ??
  Constants.expoConfig?.android?.versionCode?.toString() ??
  "unknown";

// Stable device ID: Expo's installationId is unique per install.
// On physical devices expo-device can also provide modelName etc.
const DEVICE_ID = Constants.installationId ?? "unknown";

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = "info" | "warn" | "error";

export type LogEventType =
  // Auth
  | "LOGIN"
  | "REGISTER"
  | "LOGOUT"
  | "PASSWORD_RESET"
  | "OTP_VERIFY"
  | "EMAIL_VERIFIED"
  | "EMAIL_VERIFY_RESEND"
  // Navigation
  | "SCREEN_VIEW"
  // Actions
  | "PROFILE_UPDATE"
  | "REFERRAL_SENT"
  | "DISCOUNT_VIEWED"
  | "BRAND_VIEWED"
  | "ACCOUNT_DELETED"
  // Errors
  | "API_ERROR"
  | "APP_ERROR";

/**
 * Behavioral events go to Firebase Analytics under these names.
 * Firebase requires snake_case, alphanumeric + underscore, <= 40 chars.
 *
 * API_ERROR and APP_ERROR are deliberately absent: Firebase caps string
 * params at 100 chars, which destroys stack traces. Absence from this map
 * is what routes an event to the backend instead.
 */
const FIREBASE_EVENT_MAP: Partial<Record<LogEventType, string>> = {
  LOGIN: "login",
  REGISTER: "sign_up",
  LOGOUT: "logout",
  PASSWORD_RESET: "password_reset",
  OTP_VERIFY: "otp_verify",
  EMAIL_VERIFIED: "email_verified",
  EMAIL_VERIFY_RESEND: "email_verify_resend",
  SCREEN_VIEW: "screen_view",
  PROFILE_UPDATE: "profile_update",
  REFERRAL_SENT: "referral_sent",
  DISCOUNT_VIEWED: "discount_viewed",
  BRAND_VIEWED: "brand_viewed",
  ACCOUNT_DELETED: "account_deleted",
};

export interface LogPayload {
  event: LogEventType;
  level?: LogLevel;

  // User context
  userId?: string;
  userEmail?: string;

  // Navigation context
  route?: string;
  previousRoute?: string;

  // Device / app context
  deviceId: string;
  deviceModel: string;
  platform: string;
  appVersion: string;
  buildNumber: string;

  // Timing
  timestamp: string;

  // Arbitrary extra data
  extra?: Record<string, unknown>;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function buildBasePayload(
  event: LogEventType,
  level: LogLevel = "info"
): LogPayload {
  return {
    event,
    level,
    deviceId: DEVICE_ID,
    deviceModel: Device.modelName ?? "unknown",
    platform: Platform.OS,
    appVersion: APP_VERSION,
    buildNumber: BUILD_NUMBER,
    timestamp: new Date().toISOString(),
  };
}

async function sendToBackend(payload: LogPayload): Promise<void> {
  await fetch(`${API_URL}/api/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Loaded on first use, not at import: the native module is absent in Expo Go
// and a top-level import would crash the app before it renders.
type AnalyticsModule = {
  getAnalytics: () => unknown;
  logEvent: (
    analytics: unknown,
    eventName: string,
    params?: Record<string, unknown>
  ) => Promise<void>;
  logScreenView: (
    analytics: unknown,
    params: { screen_name: string; screen_class: string }
  ) => Promise<void>;
  setUserId: (analytics: unknown, userId: string) => Promise<void>;
};

let analyticsModule: AnalyticsModule | null = null;

function getAnalyticsModule() {
  if (!analyticsModule) {
    analyticsModule = require("@react-native-firebase/analytics");
  }
  return analyticsModule!;
}

const MAX_PARAM_LENGTH = 100;

/**
 * Firebase params must be scalars, and Google's terms prohibit sending PII.
 * Anything email-shaped is dropped rather than truncated — a truncated email
 * is still PII.
 */
function sanitizeParams(extra?: Record<string, unknown>) {
  const params: Record<string, string | number | boolean> = {};
  if (!extra) return params;

  for (const [key, value] of Object.entries(extra)) {
    if (/email|mail/i.test(key)) continue;
    if (value === null || value === undefined) continue;

    if (typeof value === "number" || typeof value === "boolean") {
      params[key] = value;
    } else {
      const asString = typeof value === "string" ? value : JSON.stringify(value);
      if (/@/.test(asString)) continue;
      params[key] = asString.slice(0, MAX_PARAM_LENGTH);
    }
  }
  return params;
}

async function sendToFirebase(
  eventName: string,
  payload: LogPayload
): Promise<void> {
  const { getAnalytics, logEvent, logScreenView, setUserId } =
    getAnalyticsModule();
  const analytics = getAnalytics();

  // userId is a Firebase-sanctioned identifier; userEmail is never sent.
  if (payload.userId) {
    await setUserId(analytics, payload.userId);
  }

  if (eventName === "screen_view" && payload.route) {
    await logScreenView(analytics, {
      screen_name: payload.route,
      screen_class: payload.route,
    });
    return;
  }

  const params = sanitizeParams(payload.extra);
  if (payload.route) params.route = payload.route.slice(0, MAX_PARAM_LENGTH);

  await logEvent(analytics, eventName, params);
}

async function sendLog(payload: LogPayload): Promise<void> {
  try {
    const firebaseEvent = FIREBASE_EVENT_MAP[payload.event];
    if (firebaseEvent) {
      await sendToFirebase(firebaseEvent, payload);
    } else {
      await sendToBackend(payload);
    }
  } catch (err) {
    // Never let logging break the app
    console.warn("[Logger] Failed to send log:", err);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Log an authentication event (login, register, logout, etc.)
 */
export const logAuthEvent = async (
  event:
    | "LOGIN"
    | "REGISTER"
    | "LOGOUT"
    | "PASSWORD_RESET"
    | "OTP_VERIFY"
    | "EMAIL_VERIFIED",
  userId: string,
  extra?: Record<string, unknown>
): Promise<void> => {
  const payload: LogPayload = {
    ...buildBasePayload(event),
    userId,
    extra,
  };
  await sendLog(payload);
};

/**
 * Log a screen/route view — call this from your navigation container
 * via the `onStateChange` callback.
 *
 * Example (App.tsx):
 *   <NavigationContainer onStateChange={(state) => {
 *     const route = getActiveRouteName(state);
 *     logScreenView(route, previousRoute, user?.mintId, user?.email);
 *   }}>
 */
export const logScreenView = async (
  route: string,
  previousRoute?: string,
  userId?: string,
  userEmail?: string,
  extra?: Record<string, unknown>
): Promise<void> => {
  const payload: LogPayload = {
    ...buildBasePayload("SCREEN_VIEW"),
    route,
    previousRoute,
    userId,
    userEmail,
    extra,
  };
  await sendLog(payload);
};

/**
 * Log any generic app event with full context.
 */
export const logEvent = async (
  event: LogEventType,
  options?: {
    level?: LogLevel;
    userId?: string;
    userEmail?: string;
    route?: string;
    extra?: Record<string, unknown>;
  }
): Promise<void> => {
  const payload: LogPayload = {
    ...buildBasePayload(event, options?.level ?? "info"),
    userId: options?.userId,
    userEmail: options?.userEmail,
    route: options?.route,
    extra: options?.extra,
  };
  await sendLog(payload);
};

/**
 * Log an error (API failure, caught exception, etc.)
 */
export const logError = async (
  message: string,
  options?: {
    userId?: string;
    route?: string;
    error?: unknown;
  }
): Promise<void> => {
  const payload: LogPayload = {
    ...buildBasePayload("APP_ERROR", "error"),
    userId: options?.userId,
    route: options?.route,
    extra: {
      message,
      errorMessage:
        options?.error instanceof Error
          ? options.error.message
          : String(options?.error ?? ""),
      stack:
        options?.error instanceof Error ? options.error.stack : undefined,
    },
  };
  await sendLog(payload);
};