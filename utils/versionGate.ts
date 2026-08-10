import semver from "semver";

/**
 * Pure decision logic for the force-update gate.
 *
 * Deliberately free of React, fetch, expo-application and expo-updates so the
 * rules that decide whether to hard-block a user are testable without a device
 * or a mocked native module. components/UpdateGate.tsx supplies the I/O.
 *
 * Every function here fails OPEN: anything unparseable, absent or nonsensical
 * resolves to "do not block". A false positive locks a user out of the app
 * with no client-side recovery path, since the blocked app is the very thing
 * that would have to fetch the correction.
 */

export interface AppConfig {
  minSupportedVersion: string;
  minSupportedBuildNumber: { ios: number; android: number };
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
  forceOTA: boolean;
}

export type GatePlatform = "ios" | "android";

function optionalUrl(value: unknown): string | null {
  return typeof value === "string" && /^https:\/\//.test(value.trim())
    ? value.trim()
    : null;
}

function buildNumber(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

/**
 * Normalise an untrusted /api/app-config body.
 *
 * Returns null when the payload cannot be trusted at all (not an object, or a
 * `minSupportedVersion` that isn't valid semver). Null means fail open. Note
 * that individual bad *fields* degrade to their inert defaults rather than
 * discarding the whole config — a malformed store URL shouldn't neutralise a
 * legitimate minimum version, it should just leave that platform un-armed.
 */
export function parseAppConfig(raw: unknown): AppConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;

  const minSupportedVersion =
    typeof body.minSupportedVersion === "string"
      ? semver.valid(semver.coerce(body.minSupportedVersion))
      : null;
  if (!minSupportedVersion) return null;

  const builds =
    typeof body.minSupportedBuildNumber === "object" &&
    body.minSupportedBuildNumber !== null
      ? (body.minSupportedBuildNumber as Record<string, unknown>)
      : {};

  return {
    minSupportedVersion,
    minSupportedBuildNumber: {
      ios: buildNumber(builds.ios),
      android: buildNumber(builds.android),
    },
    iosStoreUrl: optionalUrl(body.iosStoreUrl),
    androidStoreUrl: optionalUrl(body.androidStoreUrl),
    forceOTA: body.forceOTA === true,
  };
}

/** The store URL to send this platform to, or null if none is configured. */
export function storeUrlFor(
  platform: GatePlatform,
  config: AppConfig,
): string | null {
  return platform === "ios" ? config.iosStoreUrl : config.androidStoreUrl;
}

export interface StoreCheckInput {
  /**
   * Application.nativeApplicationVersion — the version of the INSTALLED
   * BINARY. Never Constants.expoConfig?.version / ENV.appVersion: after an OTA
   * lands, those describe the downloaded JS bundle's config, not the binary
   * the user would actually be updating in the store.
   */
  nativeApplicationVersion: string | null;
  /** Application.nativeBuildVersion. iOS: "14". Android: the versionCode. */
  nativeBuildVersion: string | null;
  platform: GatePlatform;
  config: AppConfig;
}

/**
 * True when the installed binary is below the supported floor.
 *
 * Two independent floors, either of which can trip:
 *   - the semver `version` string, and
 *   - the platform's build number.
 *
 * The build number exists because eas.json sets `appVersionSource: "remote"`:
 * build numbers are assigned by EAS and climb with every production build
 * while `version` sits still, so they are the finer-grained gate. A binary
 * passes only if it clears both.
 */
export function isStoreUpdateRequired({
  nativeApplicationVersion,
  nativeBuildVersion,
  platform,
  config,
}: StoreCheckInput): boolean {
  // No store URL for this platform means the gate was never armed here. Block
  // nobody rather than showing an Update button that leads nowhere.
  if (!storeUrlFor(platform, config)) return false;

  const installed = semver.valid(semver.coerce(nativeApplicationVersion ?? ""));
  // A binary that can't report its own version can't be judged against a
  // floor. This is the Expo Go / simulator case, where nativeApplicationVersion
  // is frequently null.
  if (installed && semver.lt(installed, config.minSupportedVersion)) {
    return true;
  }

  const minBuild = config.minSupportedBuildNumber[platform];
  if (minBuild > 0 && nativeBuildVersion) {
    const installedBuild = Number(nativeBuildVersion);
    if (Number.isInteger(installedBuild) && installedBuild < minBuild) {
      return true;
    }
  }

  return false;
}
