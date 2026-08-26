/**
 * A completed location must actually silence the gate.
 *
 * `resolveLocationGate` reads `user.locationVersion`. The only thing that ever
 * learns the new value without a refetch is the PATCH response's `evaluation`,
 * so storing an evaluation has to write that value onto the user — otherwise
 * the gate re-prompts someone who just finished, forever, until the next
 * `getProfile()`.
 *
 * The field is `currentVersion`, NOT `version`, and the difference matters
 * enormously: `version` is the constant "which questionnaire is current" and is
 * returned to EVERY caller including incomplete ones, so writing it would mark
 * the whole userbase complete and permanently disable the gate.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// The real module validates the app's env vars at import time and throws when
// they are absent, which they are in a test run.
jest.mock("@/config/env", () => ({
  ENV: { appVariant: "development", apiUrl: "http://test.invalid" },
  IS_DEV: true,
  API_BASE_URL: "http://test.invalid",
}));
jest.mock("@/utils/sentry", () => ({
  captureError: jest.fn(),
  setSentryUser: jest.fn(),
}));

import { useAppStore } from "@/store/store";

const COMPLETE = {
  complete: true,
  missing: [],
  version: 1,
  currentVersion: 1,
  bucket: "complete" as const,
};

const STILL_INCOMPLETE = {
  complete: false,
  missing: ["houseNo", "pin"],
  version: 1,
  // The user did not complete, so the server never bumped them.
  currentVersion: 0,
  bucket: "no_pin" as const,
};

beforeEach(() => {
  useAppStore.setState({
    user: { mintId: "M1", email: "a@b.test" } as never,
    locationEvaluation: null,
  });
});

describe("setLocationEvaluation", () => {
  it("stamps the user's locationVersion from a completing evaluation", () => {
    useAppStore.getState().setLocationEvaluation(COMPLETE);
    expect(useAppStore.getState().user?.locationVersion).toBe(1);
  });

  it("leaves an incomplete user's version at 0, so the gate asks again", () => {
    useAppStore.getState().setLocationEvaluation(STILL_INCOMPLETE);
    expect(useAppStore.getState().user?.locationVersion ?? 0).toBe(0);
  });

  it("reads currentVersion, never version", () => {
    // The trap: `version` is 1 here for an INCOMPLETE user, because it names
    // the current questionnaire rather than this user's progress. Reading it
    // would silence the gate for everyone who ever PATCHed.
    useAppStore.getState().setLocationEvaluation(STILL_INCOMPLETE);
    expect(useAppStore.getState().user?.locationVersion ?? 0).not.toBe(
      STILL_INCOMPLETE.version,
    );
  });

  it("still stores the evaluation itself", () => {
    useAppStore.getState().setLocationEvaluation(COMPLETE);
    expect(useAppStore.getState().locationEvaluation).toEqual(COMPLETE);
  });

  it("clearing with null does not invent a version", () => {
    useAppStore.getState().setLocationEvaluation(null);
    expect(useAppStore.getState().locationEvaluation).toBeNull();
    expect(useAppStore.getState().user?.locationVersion).toBeUndefined();
  });

  it("does not throw when there is no user yet", () => {
    useAppStore.setState({ user: null as never });
    expect(() =>
      useAppStore.getState().setLocationEvaluation(COMPLETE),
    ).not.toThrow();
  });
});
