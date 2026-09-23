/// <reference types="jest" />

/**
 * What the profile screen tells a remote tester about their build.
 *
 * The failure worth guarding: expo-updates exposes an `updateId` on an
 * embedded launch too — it is the id of the bundle that shipped with the
 * binary. Reporting it unconditionally would show "update 1a2b3c4d" on a
 * phone that has never received an OTA, which reads as confirmation that a
 * fix landed when nothing has landed at all.
 */
import { describe, expect, it } from "@jest/globals";

const { readBuildInfo, buildLabel } = require("@/utils/buildInfo");

const APP = { nativeApplicationVersion: "2.2.1", nativeBuildVersion: "14" };

describe("the build a device reports", () => {
  it("says 'as shipped' on an embedded launch, despite an updateId", () => {
    const info = readBuildInfo(
      { isEmbeddedLaunch: true, updateId: "1a2b3c4d-embedded", channel: "preview" },
      APP,
    );
    expect(info.embedded).toBe(true);
    expect(info.updateId).toBeNull();
    expect(buildLabel(info)).toBe("v2.2.1 (14) · preview · as shipped");
  });

  it("names the update once one has been applied", () => {
    const info = readBuildInfo(
      {
        isEmbeddedLaunch: false,
        updateId: "dfa258be-7149-4d77-9f80-72e4d047006f",
        channel: "preview",
        createdAt: new Date("2026-09-24T10:00:00Z"),
      },
      APP,
    );
    expect(info.embedded).toBe(false);
    expect(buildLabel(info)).toBe("v2.2.1 (14) · preview · update dfa258be");
    expect(info.publishedAt).toBe("2026-09-24T10:00:00.000Z");
  });

  it("treats a binary without expo-updates as embedded, not as unknown", () => {
    // A build made before the module was linked in. Claiming an update had
    // applied would be worse than saying nothing.
    const info = readBuildInfo(null, APP);
    expect(info.embedded).toBe(true);
    expect(buildLabel(info)).toBe("v2.2.1 (14) · as shipped");
  });

  it("reports the BINARY version, not the bundle's config version", () => {
    // versionGate.ts makes the same point: after an OTA, the bundle's config
    // describes the downloaded JS, not the app the tester would reinstall.
    const info = readBuildInfo({ isEmbeddedLaunch: false, updateId: "abcdef12" }, {
      nativeApplicationVersion: "2.2.0",
      nativeBuildVersion: "13",
    });
    expect(info.version).toBe("2.2.0");
    expect(info.build).toBe("13");
  });

  it("does not invent a version when neither module answers", () => {
    const info = readBuildInfo(null, null);
    expect(info.version).toBe("unknown");
    expect(buildLabel(info)).toBe("vunknown (unknown) · as shipped");
  });
});
