import Constants from "expo-constants";

/**
 * The single source of environment truth for the app.
 *
 * This is the ONLY module allowed to read `Constants.expoConfig.extra` or
 * `process.env`. Everything else imports from here.
 *
 * Values arrive via `extra` in app.config.js, which reads them from the
 * process environment at config-resolution time (local `.env`, or EAS
 * environment variables during a build).
 *
 * Validation runs at import time and throws. A silently-undefined API base URL
 * — the app quietly talking to the wrong backend, or to `undefined/api/...` —
 * is the failure this is here to prevent. Every missing key is reported in one
 * error rather than one per run.
 */

type AppVariant = "development" | "production";

interface RawExtra {
  appVariant?: unknown;
  apiUrl?: unknown;
  googleIosClientId?: unknown;
  googleWebClientId?: unknown;
  googleAndroidClientId?: unknown;
}

const extra = (Constants.expoConfig?.extra ?? {}) as RawExtra;

const problems: string[] = [];

function requireString(key: keyof RawExtra, envVarName: string): string {
  const value = extra[key];
  if (typeof value !== "string" || value.trim() === "") {
    problems.push(`${envVarName} (extra.${String(key)}) is missing or empty`);
    return "";
  }
  return value.trim();
}

function optionalString(key: keyof RawExtra): string | null {
  const value = extra[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

const rawAppVariant = requireString("appVariant", "APP_VARIANT");
if (rawAppVariant && rawAppVariant !== "development" && rawAppVariant !== "production") {
  problems.push(
    `APP_VARIANT (extra.appVariant) must be "development" or "production", got "${rawAppVariant}"`
  );
}

// Trailing slash stripped once, here, for everyone. utils/logger.ts used to
// skip this and post to `//api/logs`.
const rawApiUrl = requireString("apiUrl", "EXPO_PUBLIC_API_URL").replace(/\/+$/, "");
if (rawApiUrl && !/^https?:\/\/[^/\s]+/.test(rawApiUrl)) {
  problems.push(
    `EXPO_PUBLIC_API_URL (extra.apiUrl) must be an absolute http(s) URL, got "${rawApiUrl}"`
  );
}

const googleIosClientId = requireString("googleIosClientId", "GOOGLE_IOS_CLIENT_ID");
const googleWebClientId = requireString("googleWebClientId", "GOOGLE_WEB_CLIENT_ID");

// Optional by design: Android Google Sign-In authenticates against
// google-services.json plus the SHA-1 registered in Firebase. There is no
// androidClientId in GoogleSignin.configure(), so requiring it would block
// startup over a value the app never uses.
const googleAndroidClientId = optionalString("googleAndroidClientId");

if (problems.length > 0) {
  throw new Error(
    [
      "[config/env] App configuration is invalid. Fix the following:",
      ...problems.map((problem) => `  - ${problem}`),
      "",
      "Copy .env.example to .env and fill in the values, then restart Metro",
      "with `npx expo start --clear`. For EAS builds, set these as environment",
      "variables on the build profile.",
    ].join("\n")
  );
}

function hostOf(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/.exec(url);
  return match ? match[1] : url;
}

export interface AppEnv {
  readonly appVariant: AppVariant;
  readonly apiUrl: string;
  readonly apiHost: string;
  readonly googleIosClientId: string;
  readonly googleWebClientId: string;
  readonly googleAndroidClientId: string | null;
  /** Build identity, previously read from expo-constants inside utils/logger.ts. */
  readonly appVersion: string;
  readonly buildNumber: string;
  readonly installationId: string;
}

export const ENV: AppEnv = Object.freeze({
  appVariant: rawAppVariant as AppVariant,
  apiUrl: rawApiUrl,
  apiHost: hostOf(rawApiUrl),
  googleIosClientId,
  googleWebClientId,
  googleAndroidClientId,
  appVersion: Constants.expoConfig?.version ?? "unknown",
  buildNumber:
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    "unknown",
  // Unique per install; used as a stable anonymous device identifier.
  installationId: Constants.installationId ?? "unknown",
});

/**
 * True when this build was configured as the development variant.
 *
 * Deliberately NOT `__DEV__`. `__DEV__` describes how the JS bundle is being
 * served (Metro vs. minified), which is a different axis: a
 * production-profile build run locally is still `__DEV__ === true`, and a
 * development-variant release build is `__DEV__ === false`. Environment
 * separation must follow the variant, not the bundler mode.
 */
export const IS_DEV: boolean = ENV.appVariant === "development";

export const API_BASE_URL = ENV.apiUrl;
