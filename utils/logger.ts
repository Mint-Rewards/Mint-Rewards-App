import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

// ============================================================================
// CONFIG
// ============================================================================

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://mint-rewards-mern-next-js.vercel.app";
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

async function sendLog(payload: LogPayload): Promise<void> {
  try {
    await fetch(`${API_URL}/api/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
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
  event: "LOGIN" | "REGISTER" | "LOGOUT" | "PASSWORD_RESET" | "OTP_VERIFY",
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