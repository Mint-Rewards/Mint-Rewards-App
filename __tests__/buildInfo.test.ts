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
  it("names the bundled build on an embedded launch, despite an updateId", () => {
    const info = readBuildInfo(
      { isEmbeddedLaunch: true, updateId: "1a2b3c4d-embedded", channel: "preview" },
      APP,
    );
    expect(info.embedded).toBe(true);
    expect(info.updateId).toBeNull();
    expect(buildLabel(info)).toBe("v2.2.1 (14) · preview · bundled with 14");
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
    expect(buildLabel(info)).toBe("v2.2.1 (14) · preview · update 24 Sept 15:00 · dfa258be");
    expect(info.publishedAt).toBe("2026-09-24T10:00:00.000Z");
  });

  it("treats a binary without expo-updates as embedded, not as unknown", () => {
    // A build made before the module was linked in. Claiming an update had
    // applied would be worse than saying nothing.
    const info = readBuildInfo(null, APP);
    expect(info.embedded).toBe(true);
    expect(buildLabel(info)).toBe("v2.2.1 (14) · bundled with 14");
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
    expect(buildLabel(info)).toBe("vunknown (unknown) · bundled with unknown");
  });

  it("names Metro rather than a null update on a dev client", () => {
    /*
     * A dev client answers `isEmbeddedLaunch: false` truthfully — the bundle
     * is not the embedded one — and has no update id, because the JS is
     * coming down the cable. Reading only the first of those printed
     * "update null" on the iOS build, which reads as a broken update
     * mechanism when nothing is wrong.
     */
    const info = readBuildInfo(
      { isEmbeddedLaunch: false, updateId: null, channel: null },
      { nativeApplicationVersion: "2.2.1", nativeBuildVersion: "14" },
    );
    expect(info.fromMetro).toBe(true);
    expect(buildLabel(info)).toContain("from Metro");
    expect(buildLabel(info)).not.toContain("null");
  });

  it("does not call a real update Metro", () => {
    const info = readBuildInfo(
      { isEmbeddedLaunch: false, updateId: "01a0d926-7738-764c", channel: "preview" },
      { nativeApplicationVersion: "2.2.1", nativeBuildVersion: "14" },
    );
    expect(info.fromMetro).toBe(false);
    expect(buildLabel(info)).toContain("update 01a0d926");
  });

  it("names the build it is running when no update has landed", () => {
    /*
     * "as shipped" was true and useless. It is what a fresh TestFlight
     * install shows before its first update arrives, and someone checking
     * whether a fix reached them cannot tell that from a build that never
     * checks at all. The build number says which bundle they are on.
     */
    const info = readBuildInfo(
      { isEmbeddedLaunch: true, updateId: "whatever", channel: "preview" },
      { nativeApplicationVersion: "2.2.2", nativeBuildVersion: "80" },
    );
    const label = buildLabel(info);
    expect(label).toContain("bundled with 80");
    expect(label).not.toContain("as shipped");
  });

  it("shows WHEN an update was published, not just its id", () => {
    /*
     * Two update ids cannot be compared by eye — 01a0ec2c against 01a0df21
     * says nothing about which is newer, and "am I on the latest" is the
     * only question this line exists to answer. The timestamp is ordered.
     */
    const info = readBuildInfo(
      {
        isEmbeddedLaunch: false,
        updateId: "01a0ec2c-6eec-7ba5-bdc0-5e04ac1affc2",
        channel: "preview",
        createdAt: new Date("2026-09-29T13:42:00Z"),
      },
      { nativeApplicationVersion: "2.2.2", nativeBuildVersion: "80" },
    );
    const label = buildLabel(info);
    expect(label).toMatch(/update \d+ \w+ \d{2}:\d{2}/);
    // The id survives, for quoting back when something is wrong.
    expect(label).toContain("01a0ec2c");
  });

  it("still names the update when the publish time is missing", () => {
    // An older expo-updates, or a field that did not come through. Losing the
    // id as well would leave the line saying nothing at all.
    const info = readBuildInfo(
      { isEmbeddedLaunch: false, updateId: "01a0ec2c-6eec", channel: "preview", createdAt: null },
      { nativeApplicationVersion: "2.2.2", nativeBuildVersion: "80" },
    );
    expect(buildLabel(info)).toContain("update 01a0ec2c");
  });
});
