import { describe, expect, it } from "@jest/globals";
import {
  isStoreUpdateRequired,
  parseAppConfig,
  storeUrlFor,
  type AppConfig,
} from "@/utils/versionGate";

const config = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  minSupportedVersion: "2.1.8",
  minSupportedBuildNumber: { ios: 0, android: 0 },
  iosStoreUrl: "https://apps.apple.com/app/id123456789",
  androidStoreUrl:
    "https://play.google.com/store/apps/details?id=com.mintrewards.appp",
  forceOTA: false,
  ...overrides,
});

const check = (
  nativeApplicationVersion: string | null,
  overrides: Partial<AppConfig> = {},
  nativeBuildVersion: string | null = null,
  platform: "ios" | "android" = "ios",
) =>
  isStoreUpdateRequired({
    nativeApplicationVersion,
    nativeBuildVersion,
    platform,
    config: config(overrides),
  });

describe("isStoreUpdateRequired — semver comparison", () => {
  it("blocks a binary below minSupportedVersion", () => {
    expect(check("2.1.7")).toBe(true);
  });

  it("allows a binary exactly at minSupportedVersion", () => {
    expect(check("2.1.8")).toBe(false);
  });

  it("allows a binary above minSupportedVersion", () => {
    expect(check("2.2.0")).toBe(false);
  });

  it("compares numerically, not lexicographically", () => {
    // "2.1.10" < "2.1.8" as strings, but is newer as semver.
    expect(check("2.1.10")).toBe(false);
    expect(check("2.10.0")).toBe(false);
    // Major dominates.
    expect(check("1.99.99")).toBe(true);
    expect(check("3.0.0")).toBe(false);
  });

  it("fails open when the binary cannot report its version", () => {
    // Expo Go / simulator commonly leave nativeApplicationVersion null.
    expect(check(null)).toBe(false);
    expect(check("")).toBe(false);
    expect(check("not-a-version")).toBe(false);
  });

  it("fails open when no store URL is configured for the platform", () => {
    // Blocking with no destination would strand the user on a dead button.
    expect(check("1.0.0", { iosStoreUrl: null }, null, "ios")).toBe(false);
    expect(check("1.0.0", { androidStoreUrl: null }, null, "android")).toBe(
      false,
    );
    // The other platform's URL being present must not arm this one.
    expect(check("1.0.0", { iosStoreUrl: null }, null, "android")).toBe(true);
  });
});

describe("isStoreUpdateRequired — build numbers", () => {
  const withMinBuild = (ios: number, android = 0) => ({
    minSupportedBuildNumber: { ios, android },
  });

  it("blocks a build below the platform floor even when the version passes", () => {
    expect(check("2.1.8", withMinBuild(20), "14", "ios")).toBe(true);
  });

  it("allows a build at or above the floor", () => {
    expect(check("2.1.8", withMinBuild(14), "14", "ios")).toBe(false);
    expect(check("2.1.8", withMinBuild(14), "21", "ios")).toBe(false);
  });

  it("compares build numbers numerically", () => {
    expect(check("2.1.8", withMinBuild(9), "10", "ios")).toBe(false);
  });

  it("reads only the current platform's floor", () => {
    // A high iOS floor must not block Android builds.
    expect(check("2.1.8", withMinBuild(99, 0), "14", "android")).toBe(false);
  });

  it("treats a floor of 0 as unset", () => {
    expect(check("2.1.8", withMinBuild(0), "1", "ios")).toBe(false);
  });

  it("fails open on an unreadable build number", () => {
    expect(check("2.1.8", withMinBuild(20), null, "ios")).toBe(false);
    expect(check("2.1.8", withMinBuild(20), "abc", "ios")).toBe(false);
  });
});

describe("parseAppConfig", () => {
  const valid = {
    minSupportedVersion: "2.1.8",
    minSupportedBuildNumber: { ios: 14, android: 9 },
    iosStoreUrl: "https://apps.apple.com/app/id123456789",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=x",
    forceOTA: true,
  };

  it("accepts a well-formed payload", () => {
    expect(parseAppConfig(valid)).toEqual(valid);
  });

  it("rejects payloads that are not usable objects", () => {
    expect(parseAppConfig(null)).toBeNull();
    expect(parseAppConfig("nope")).toBeNull();
    expect(parseAppConfig(42)).toBeNull();
    expect(parseAppConfig([])).toBeNull(); // array has no minSupportedVersion
  });

  it("rejects a payload with no usable minSupportedVersion", () => {
    expect(parseAppConfig({ ...valid, minSupportedVersion: undefined })).toBeNull();
    expect(parseAppConfig({ ...valid, minSupportedVersion: "" })).toBeNull();
    expect(parseAppConfig({ ...valid, minSupportedVersion: 218 })).toBeNull();
  });

  it("degrades bad individual fields to inert defaults instead of discarding the config", () => {
    const parsed = parseAppConfig({
      minSupportedVersion: "2.1.8",
      minSupportedBuildNumber: "not-an-object",
      iosStoreUrl: "http://insecure.example.com/app", // not https
      androidStoreUrl: 12345,
      forceOTA: "true", // string, not boolean
    });

    expect(parsed).toEqual({
      minSupportedVersion: "2.1.8",
      minSupportedBuildNumber: { ios: 0, android: 0 },
      iosStoreUrl: null,
      androidStoreUrl: null,
      forceOTA: false,
    });
  });

  it("rejects negative and non-integer build numbers", () => {
    const parsed = parseAppConfig({
      ...valid,
      minSupportedBuildNumber: { ios: -3, android: 1.5 },
    });
    expect(parsed?.minSupportedBuildNumber).toEqual({ ios: 0, android: 0 });
  });
});

describe("storeUrlFor", () => {
  it("returns the URL for the requested platform", () => {
    const c = config();
    expect(storeUrlFor("ios", c)).toBe(c.iosStoreUrl);
    expect(storeUrlFor("android", c)).toBe(c.androidStoreUrl);
  });
});
