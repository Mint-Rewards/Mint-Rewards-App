/// <reference types="jest" />

/**
 * When the invitations list asks the server again.
 *
 * The tab stays mounted for the life of the session, so a fetch on mount is a
 * fetch once. An invitation that arrives afterwards — which is every
 * invitation, since the push is what brings the household to the screen — was
 * never picked up: they tapped the notification, landed on a list that had
 * already concluded it was empty, and saw the collection only after reloading
 * the bundle from Metro.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";

type FetchLike = (url: string, options: RequestInit) => Promise<unknown>;
const mockAuthenticatedFetch = jest.fn<FetchLike>();
jest.mock("@/utils/api", () => ({
  apiUrl: (path: string) => `https://api.test.invalid${path}`,
  authenticatedFetch: mockAuthenticatedFetch,
}));

jest.mock("@/store/store", () => ({
  useAppStore: (select: (s: { token: string }) => unknown) =>
    select({ token: "Bearer test.jwt" }),
}));

// Captured rather than run: the real one needs a navigator above it, and what
// matters here is what the hook does when it is called.
let focusCallback: (() => void | (() => void)) | null = null;
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    focusCallback = cb;
  },
}));

// AppState's listener, likewise — but by spying rather than by mocking the
// module. react-native exposes its surface through lazy getters onto the
// native binary, so both replacing it wholesale and spreading `requireActual`
// blow up on a module that has no business being loaded here (`DevMenu`).
let appStateListener: ((s: string) => void) | null = null;
const { AppState } = require("react-native") as typeof import("react-native");

const { useInvitations } = require("@/hooks/useInvitations");

const invitation = (collectionId: number) => ({
  collectionId,
  name: "North Karachi drive",
  scheduledDate: "2026-09-25",
  timeSlot: "MORNING",
  responseDeadlineAt: null,
  status: "INVITED",
  collectionStatus: "CONFIRMING",
  state: "answerable",
  startedAt: null,
  captainName: "Abdul Qudoos",
  captainAvatar: null,
});

/** What the next fetch will answer with. */
function answerWith(invitations: unknown[]) {
  mockAuthenticatedFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ invitations }),
  });
}

let latest: ReturnType<typeof useInvitations>;

function Probe() {
  latest = useInvitations();
  return null;
}

async function mount() {
  await act(async () => {
    renderer.create(<Probe />);
  });
}

describe("refreshing the invitations list", () => {
  beforeEach(() => {
    focusCallback = null;
    appStateListener = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _event: string,
      cb: (state: string) => void,
    ) => {
      appStateListener = cb;
      return { remove: () => {} };
    }) as never);
    mockAuthenticatedFetch.mockReset();
    answerWith([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("asks once on mount", async () => {
    await mount();
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1);
    expect(latest.invitations).toEqual([]);
  });

  it("knows the difference between no answer yet and an answer of none", async () => {
    // The screen renders "No Collections Found" off this flag, and saying it
    // before the server has replied is saying it at the worst moment.
    await mount();
    expect(latest.hydrated).toBe(true);
  });

  it("asks again when the household comes back to the screen", async () => {
    await mount();
    // The first focus is the mount's own, which already has a fetch in
    // flight; asking twice for the same render is waste, not safety.
    await act(async () => {
      focusCallback?.();
    });
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1);

    answerWith([invitation(3)]);
    await act(async () => {
      focusCallback?.();
    });
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(2);
    expect(latest.invitations).toHaveLength(1);
    expect(latest.invitations[0].collectionId).toBe(3);
  });

  it("asks again when the app returns from the background", async () => {
    // Tapping a push opens the app onto a screen that is already focused, so
    // focus alone never fires. This is the signal that covers it.
    await mount();
    answerWith([invitation(7)]);
    await act(async () => {
      appStateListener?.("active");
    });
    expect(latest.invitations[0].collectionId).toBe(7);
  });

  it("does not ask while the app is going away", async () => {
    await mount();
    await act(async () => {
      appStateListener?.("background");
    });
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1);
  });
});
