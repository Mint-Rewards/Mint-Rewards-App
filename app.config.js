// Dynamic Expo config. Replaces the former app.json.
//
// Variant selection is driven by APP_VARIANT:
//   APP_VARIANT=development -> dev variant (separate bundle ID / package /
//                              scheme, so it can sit next to prod on a device)
//   anything else           -> production variant
//
// Everything not listed in the `isDev ? ... : ...` branches below is a verbatim
// port of the original app.json and is shared by both variants.

const fs = require("fs");
const path = require("path");

const isDev = process.env.APP_VARIANT === "development";
const appVariant = isDev ? "development" : "production";

// ---------------------------------------------------------------------------
// Environment input
// ---------------------------------------------------------------------------
// These are read here, at config-resolution time, and forwarded into `extra`.
// config/env.ts is the only place the app reads them back out. Nothing is
// hardcoded: a missing value fails the config build rather than silently
// falling back to a production URL (the previous behaviour in
// utils/constants.ts, which shipped prod as the default).

// eas-cli evaluates this file with EXPO_NO_DOTENV=1 for metadata-only reads
// (env:set, project info, credentials, and critically: the *local* fingerprint
// precomputation it does before every `eas build`, local or cloud, to embed a
// runtime version in the job). That last one DOES reach a build: with
// `runtimeVersion: { policy: "fingerprint" }` below, whatever this file
// resolves to gets hashed into the build's expected runtime version. If we
// let EXPO_NO_DOTENV skip .env here, that precomputed hash is based on the
// UNSET placeholders while the real build (EAS_BUILD="true", real env
// injected) hashes the real config — guaranteed runtime-version mismatch on
// every single build.
//
// Fix: load .env ourselves via @expo/env, bypassing the EXPO_NO_DOTENV skip,
// so this file resolves identically whether or not eas-cli decided to skip
// its own dotenv loading. Every layer of @expo/env's public API — load(),
// loadProjectEnv(), getEnvFiles(), even the "raw" parseEnvFiles() — checks
// EXPO_NO_DOTENV internally and no-ops when it's set (that's the whole
// problem), so there's no way to opt back in through the API. Instead,
// unset the flag for the duration of this call only, then restore it — this
// affects nothing except which files @expo/env decides to read here.
// loadEnvFiles() never overwrites a var already present in process.env, so
// real EAS-injected build-time values (which take priority) are untouched —
// this only fills the gap for local/precompute reads that would otherwise
// see nothing. `force: true` is required too: expo-cli itself calls into
// @expo/env before evaluating this file, and even under EXPO_NO_DOTENV=1 that
// call marks env-loading as already done (it "loads" zero files, but still
// sets the done marker) — without `force`, our call below would silently
// no-op as "already loaded".
{
  const { loadEnvFiles } = require("@expo/env");
  const hadNoDotenv = "EXPO_NO_DOTENV" in process.env;
  const previousNoDotenv = process.env.EXPO_NO_DOTENV;
  delete process.env.EXPO_NO_DOTENV;
  try {
    const mode = process.env.NODE_ENV;
    const envFiles = [
      mode && `.env.${mode}.local`,
      mode !== "test" && ".env.local",
      mode && `.env.${mode}`,
      ".env",
    ].filter(Boolean);
    loadEnvFiles(envFiles.map((file) => path.join(__dirname, file)), {
      silent: true,
      force: true,
    });
  } finally {
    if (hadNoDotenv) process.env.EXPO_NO_DOTENV = previousNoDotenv;
  }
}

// True only when a value is still missing after the load above — e.g. CI
// running `eas env:list` with no .env file on disk. Throwing there breaks
// those commands for no benefit: nothing is built from that config. On a real
// EAS build EAS_BUILD is "true" and the env vars are present, so validation
// runs normally.
//
// This only relaxes the *build-time* check. config/env.ts still validates
// unconditionally at app startup, so a bundle can never boot with a missing or
// placeholder API URL.
const isMetadataOnlyRead =
  process.env.EXPO_NO_DOTENV === "1" && process.env.EAS_BUILD !== "true";

// Obviously-fake stand-ins used only in the metadata-only path above, so the
// config still resolves. They never reach a build.
const UNSET = {
  apiUrl: "https://unset.invalid",
  clientId: "000000000000-unset.apps.googleusercontent.com",
  mapsKey: "unset",
};

const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
  googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
  // Optional: Android Google Sign-In resolves through google-services.json plus
  // the SHA-1 registered in Firebase, not through a JS client ID. Exposed for
  // completeness / future use only.
  googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID ?? null,
  androidGoogleMapsApiKey: process.env.ANDROID_GOOGLE_MAPS_API_KEY,
};

const REQUIRED = {
  EXPO_PUBLIC_API_URL: env.apiUrl,
  GOOGLE_IOS_CLIENT_ID: env.googleIosClientId,
  GOOGLE_WEB_CLIENT_ID: env.googleWebClientId,
  ANDROID_GOOGLE_MAPS_API_KEY: env.androidGoogleMapsApiKey,
};

const problems = Object.entries(REQUIRED)
  .filter(([, value]) => !value || String(value).trim() === "")
  .map(([key]) => `${key} is missing or empty`);

// Google OAuth client IDs have a fixed shape: <numeric project>-<id>.apps.
// googleusercontent.com. Checking it here matters more than it looks: the iOS
// client ID is also the source of the native callback URL scheme below, so a
// typo would otherwise produce a silently wrong iosUrlScheme and a Google
// Sign-In that fails only at runtime, on device.
const GOOGLE_CLIENT_ID_SHAPE = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

for (const [key, value] of [
  ["GOOGLE_IOS_CLIENT_ID", env.googleIosClientId],
  ["GOOGLE_WEB_CLIENT_ID", env.googleWebClientId],
]) {
  if (value && !GOOGLE_CLIENT_ID_SHAPE.test(value.trim())) {
    problems.push(
      `${key} is malformed: "${value}"\n` +
        `      expected <digits>-<lowercase alphanumeric>.apps.googleusercontent.com`
    );
  }
}

if (problems.length > 0 && isMetadataOnlyRead) {
  console.warn(
    `[app.config.js] Resolving config without .env (metadata-only read). ` +
      `Using placeholder values for: ${problems.length} unset/invalid key(s). ` +
      `This is expected for eas-cli commands and never reaches a build.`
  );
  env.apiUrl = env.apiUrl || UNSET.apiUrl;
  env.googleIosClientId = GOOGLE_CLIENT_ID_SHAPE.test(env.googleIosClientId ?? "")
    ? env.googleIosClientId
    : UNSET.clientId;
  env.googleWebClientId = GOOGLE_CLIENT_ID_SHAPE.test(env.googleWebClientId ?? "")
    ? env.googleWebClientId
    : UNSET.clientId;
  env.androidGoogleMapsApiKey = env.androidGoogleMapsApiKey || UNSET.mapsKey;
} else if (problems.length > 0) {
  throw new Error(
    [
      `[app.config.js] Invalid environment for APP_VARIANT=${appVariant}:`,
      ...problems.map((problem) => `  - ${problem}`),
      "",
      "Copy .env.example to .env and fill these in, or set them as EAS",
      "environment variables for the build profile you are running.",
    ].join("\n")
  );
}

// The native Google Sign-In callback needs the reversed iOS client ID as a URL
// scheme. Deriving it from the client ID keeps the two from drifting apart and
// avoids a fifth env var.
//   490896222696-abc.apps.googleusercontent.com
//     -> com.googleusercontent.apps.490896222696-abc
const iosUrlScheme = `com.googleusercontent.apps.${env.googleIosClientId.replace(
  /\.apps\.googleusercontent\.com$/,
  ""
)}`;

// ---------------------------------------------------------------------------
// Firebase config files
// ---------------------------------------------------------------------------
// The dev variant needs its own Firebase apps registered against
// com.mintrewards.app.dev / com.mintrewards.appp.dev. Until those config files
// are downloaded into firebase/, fall back to the production ones so that
// `expo config` and Expo Go still resolve — a dev *build* with the prod files
// will fail Firebase init, which is the loud failure we want.

const easProjectId = "7a49df03-9e0f-4272-acfc-5bcb7fd8e30a";

function firebaseConfigFile(devFile, prodFile) {
  if (!isDev) return prodFile;
  const absolute = path.join(__dirname, devFile);
  if (fs.existsSync(absolute)) return devFile;
  console.warn(
    `[app.config.js] ${devFile} not found — falling back to ${prodFile}. ` +
      "Download the dev variant's config from the Firebase console before building."
  );
  return prodFile;
}

module.exports = () => ({
  expo: {
    name: isDev ? "Mint Rewards (Dev)" : "Mint Rewards",
    // Deliberately identical across variants: both builds live under one EAS
    // project.
    slug: "mint-rewards",
    version: "2.1.9",
    orientation: "portrait",
    icon: isDev
      ? "./assets/images/icon-dev.png"
      : "./assets/images/logo-fixed.png",
    scheme: isDev ? "mint-rewards-dev" : "mint-rewards",
    userInterfaceStyle: "automatic",
    // Runtime version gates which builds an OTA update is allowed to land on.
    // Declared here rather than per-profile in eas.json — EAS rejects
    // `runtimeVersion` inside a build profile — which also makes it uniform
    // across development/preview/production by construction.
    //
    // "fingerprint" hashes the actual native dependency graph, so an update
    // physically cannot reach a build whose native code differs. The
    // alternative, "appVersion", would depend on someone remembering to bump
    // `version` after every native change; with appVersionSource: "remote" the
    // version isn't even edited locally, making that easy to forget.
    // runtimeVersion: {
    //   policy: "fingerprint",
    // },
    ios: {
      supportsTablet: true,
      bundleIdentifier: isDev
        ? "com.mintrewards.app.dev"
        : "com.mintrewards.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSAppTransportSecurity: {
          NSExceptionDomains: {
            localhost: {
              NSExceptionAllowsInsecureHTTPLoads: true,
            },
          },
        },
        NSLocationWhenInUseUsageDescription:
          "Mint Rewards uses your location to let you pin your exact address for waste collection pickups.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "Mint Rewards uses your location to let you pin your exact address for waste collection pickups.",
      },
      googleServicesFile: firebaseConfigFile(
        "./firebase/GoogleService-Info.dev.plist",
        "./firebase/GoogleService-Info.plist"
      ),
    },
    android: {
      adaptiveIcon: {
        foregroundImage: isDev
          ? "./assets/images/adaptive-icon-dev.png"
          : "./assets/images/logo-fixed.png",
        backgroundColor: "#ffffff",
      },
      package: isDev ? "com.mintrewards.appp.dev" : "com.mintrewards.appp",
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
      ],
      config: {
        googleMaps: {
          apiKey: env.androidGoogleMapsApiKey,
        },
      },
      googleServicesFile: firebaseConfigFile(
        "./firebase/google-services.dev.json",
        "./firebase/google-services.json"
      ),
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "@react-native-firebase/app",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/logo-fixed.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
        },
      ],
      "expo-secure-store",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Mint Rewards uses your location to let you pin your exact address for waste collection pickups.",
        },
      ],
      "expo-web-browser",
      "expo-apple-authentication",
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme,
        },
      ],
      [
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
            extraPods: [
              { name: "GoogleUtilities", modular_headers: true },
              { name: "RecaptchaInterop", modular_headers: true },
            ],
          },
          android: {
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            buildToolsVersion: "36.0.0",
          },
        },
      ],
      "expo-font",
      "expo-image",
      "expo-sharing",
      "expo-status-bar",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    updates: {
      url: `https://u.expo.dev/${easProjectId}`,
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    extra: {
      router: {},
      eas: {
        projectId: easProjectId,
      },
      // Read exclusively by config/env.ts.
      appVariant,
      apiUrl: env.apiUrl,
      googleIosClientId: env.googleIosClientId,
      googleWebClientId: env.googleWebClientId,
      // Spread rather than assigned: Expo serialises a null `extra` value as
      // `{}`, which config/env.ts would then have to special-case. Omitting the
      // key entirely keeps "absent" unambiguous.
      ...(env.googleAndroidClientId
        ? { googleAndroidClientId: env.googleAndroidClientId }
        : {}),
      posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
      posthogHost: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    },
    owner: "mint-rewards",
  },
});
