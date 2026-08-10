/**
 * Orchestration tests for components/UpdateGate.
 *
 * These cover the decisions that the pure logic in utils/versionGate.ts cannot:
 * what the gate does when the network misbehaves, and the ordering guarantee
 * that the OTA check never runs behind a failed store check.
 *
 * NOT covered here, deliberately — see the note at the bottom of this file for
 * why each is out of reach of a unit test.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";

jest.mock("@/config/env", () => ({
  API_BASE_URL: "https://api.test.invalid",
  ENV: { appVariant: "production", apiUrl: "https://api.test.invalid" },
  IS_DEV: false,
}));

// Every binding referenced from inside a jest.mock() factory must be
// `mock`-prefixed: the factories are hoisted above these declarations, and jest
// only exempts that naming convention from its out-of-scope-variable guard.
const mockCapture = jest.fn();
jest.mock("@/utils/posthog", () => ({
  posthog: { capture: (...args: unknown[]) => mockCapture(...args) },
  isPostHogEnabled: false,
}));

const mockCheckForUpdate = jest.fn();
const mockFetchUpdate = jest.fn();
const mockReload = jest.fn();
jest.mock("expo-updates", () => ({
  checkForUpdateAsync: () => mockCheckForUpdate(),
  fetchUpdateAsync: () => mockFetchUpdate(),
  reloadAsync: () => mockReload(),
}));

// Getters, not plain values: the gate reads these at call time, so each test
// can reassign the installed version between renders.
const mockNative = { version: "2.1.8" as string | null, build: "14" as string | null };
jest.mock("expo-application", () => ({
  get nativeApplicationVersion() {
    return mockNative.version;
  },
  get nativeBuildVersion() {
    return mockNative.build;
  },
}));

import UpdateGate from "@/components/UpdateGate";

const CONFIG = {
  minSupportedVersion: "2.1.8",
  minSupportedBuildNumber: { ios: 0, android: 0 },
  iosStoreUrl: "https://apps.apple.com/app/id123456789",
  androidStoreUrl: "https://play.google.com/store/apps/details?id=x",
  forceOTA: false,
};

function mockFetchResolving(body: unknown, ok = true, status = 200) {
  (global as any).fetch = jest.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
}

/** Renders the gate and lets every queued microtask settle. */
async function renderGate() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<UpdateGate />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return tree!;
}

/** True when the gate rendered nothing — i.e. the app is not blocked. */
function isOpen(tree: renderer.ReactTestRenderer) {
  return tree.toJSON() === null;
}

beforeEach(() => {
  mockNative.version = "2.1.8";
  mockNative.build = "14";
  mockCapture.mockClear();
  mockCheckForUpdate.mockReset();
  mockFetchUpdate.mockReset();
  mockReload.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("UpdateGate — fail open", () => {
  it("renders nothing when the config fetch rejects", async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error("Network request failed");
    });

    const tree = await renderGate();

    expect(isOpen(tree)).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(
      "update_gate_failed",
      expect.objectContaining({ step: "config_fetch" }),
    );
  });

  it("renders nothing when the config fetch times out", async () => {
    // What the AbortController surfaces when the deadline fires.
    (global as any).fetch = jest.fn(async () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      throw error;
    });

    const tree = await renderGate();

    expect(isOpen(tree)).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(
      "update_gate_failed",
      expect.objectContaining({ step: "config_fetch" }),
    );
  });

  it("renders nothing when the response body is not valid JSON", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    }));

    const tree = await renderGate();

    expect(isOpen(tree)).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(
      "update_gate_failed",
      expect.objectContaining({ step: "config_fetch" }),
    );
  });

  it("renders nothing when the JSON parses but is the wrong shape", async () => {
    mockFetchResolving({ unexpected: "payload" });

    const tree = await renderGate();

    expect(isOpen(tree)).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(
      "update_gate_failed",
      expect.objectContaining({ step: "config_parse" }),
    );
  });

  it("renders nothing on a non-2xx response", async () => {
    mockFetchResolving({}, false, 503);

    const tree = await renderGate();

    expect(isOpen(tree)).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(
      "update_gate_failed",
      expect.objectContaining({ step: "config_fetch" }),
    );
  });

  it("never calls the OTA check on any fail-open path", async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error("Network request failed");
    });

    await renderGate();

    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });
});

describe("UpdateGate — store check short-circuits the OTA check", () => {
  it("blocks and does NOT check for an OTA when the binary is too old", async () => {
    mockNative.version = "2.1.7";
    // forceOTA is on, so the only thing preventing the OTA check is the
    // short-circuit itself.
    mockFetchResolving({ ...CONFIG, forceOTA: true });

    const tree = await renderGate();

    expect(isOpen(tree)).toBe(false);
    // The whole point: runtimeVersion is "appVersion", so an OTA could never
    // reach this binary anyway.
    expect(mockCheckForUpdate).not.toHaveBeenCalled();
    expect(mockFetchUpdate).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledWith(
      "update_gate_blocked",
      expect.objectContaining({ reason: "store_version" }),
    );
  });

  it("also short-circuits when only the build-number floor trips", async () => {
    mockNative.version = "2.1.8";
    mockNative.build = "13";
    mockFetchResolving({
      ...CONFIG,
      minSupportedBuildNumber: { ios: 21, android: 21 },
      forceOTA: true,
    });

    const tree = await renderGate();

    expect(isOpen(tree)).toBe(false);
    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });

  it("reaches the OTA check only once the store check passes", async () => {
    mockNative.version = "2.2.0";
    mockCheckForUpdate.mockResolvedValue({ isAvailable: false } as never);
    mockFetchResolving({ ...CONFIG, forceOTA: true });

    const tree = await renderGate();

    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
    expect(isOpen(tree)).toBe(true); // nothing available, nothing to block on
  });

  it("does not check for an OTA when forceOTA is false", async () => {
    mockNative.version = "2.2.0";
    mockFetchResolving({ ...CONFIG, forceOTA: false });

    const tree = await renderGate();

    expect(mockCheckForUpdate).not.toHaveBeenCalled();
    expect(isOpen(tree)).toBe(true);
  });
});

describe("UpdateGate — forced OTA path", () => {
  it("fetches and reloads when an update is available and forced", async () => {
    mockNative.version = "2.2.0";
    mockCheckForUpdate.mockResolvedValue({ isAvailable: true } as never);
    mockFetchUpdate.mockResolvedValue({ isNew: true } as never);
    mockReload.mockResolvedValue(undefined as never);
    mockFetchResolving({ ...CONFIG, forceOTA: true });

    await renderGate();

    expect(mockFetchUpdate).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("fails open when the OTA download throws", async () => {
    mockNative.version = "2.2.0";
    mockCheckForUpdate.mockResolvedValue({ isAvailable: true } as never);
    mockFetchUpdate.mockRejectedValue(new Error("download failed") as never);
    mockFetchResolving({ ...CONFIG, forceOTA: true });

    const tree = await renderGate();

    expect(mockReload).not.toHaveBeenCalled();
    expect(isOpen(tree)).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(
      "update_gate_failed",
      expect.objectContaining({ step: "ota_check" }),
    );
  });
});

/**
 * Not unit-testable, and why:
 *
 * - `Updates.reloadAsync()` actually tearing down and relaunching the JS
 *   runtime. The assertion above only proves the call was made; the reload
 *   itself is native and destroys the very JS context the test runs in, so
 *   there is nothing left to assert against. Needs a real dev-client or
 *   release build against a published EAS channel.
 *
 * - Whether a published OTA is genuinely reachable by a given binary. That is
 *   decided by the runtimeVersion match on Expo's servers, not by any code in
 *   this repo, so a unit test can only ever confirm our own mock.
 *
 * - `Linking.openURL` landing on the correct App Store / Play listing. Mocking
 *   proves the URL is passed through; that it resolves to the real product
 *   page is a store-configuration fact.
 *
 * - `BackHandler` genuinely swallowing the Android hardware back button. The
 *   listener registration is plain JS, but the interception is native and only
 *   observable on a device.
 *
 * - Real `AbortController` timeout firing at 8000ms. The timeout branch is
 *   simulated above by throwing an AbortError, which is the same code path the
 *   gate sees; asserting the real timer would mean an 8-second test.
 */
