/**
 * The gate must come back for a user who did not finish.
 *
 * `dismissedOnPath` suppresses the modal for the visit it was set on — tapping
 * "Continue" sets it so the modal is not left sitting under the Edit Profile
 * screen it just pushed. The suppression has to END when the user leaves Home,
 * or the comparison never becomes false again: coming back to Home restores the
 * same pathname string it was set to, and the gate stays silent for the rest of
 * the app run whether or not anything was actually filled in.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";

jest.mock("@/config/env", () => ({
  ENV: { appVariant: "development", apiUrl: "http://test.invalid" },
  IS_DEV: true,
  API_BASE_URL: "http://test.invalid",
}));
jest.mock("@/utils/sentry", () => ({
  captureError: jest.fn(),
  setSentryUser: jest.fn(),
}));

const mockAlert = jest.fn();
jest.mock("@/utils/alert", () => ({
  alertOnce: (...a: unknown[]) => mockAlert(...a),
}));

let mockPathname = "/home";
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));

// A user with nothing filled in: no pin, so the "finish" branch.
const INCOMPLETE_USER = {
  mintId: "M1",
  email: "a@b.test",
  userName: "Test",
  phone: "",
  city: "",
  town: "",
};
const mockStore = {
  user: INCOMPLETE_USER as Record<string, unknown>,
  token: "t",
  updateProfile: jest.fn<
    (...a: unknown[]) => Promise<{ Status: string; ErrorMessage?: string }>
  >(async () => ({ Status: "Success" })),
  setLocationEvaluation: jest.fn(),
};
jest.mock("@/store/store", () => ({ useAppStore: () => mockStore }));

jest.mock("@/utils/locationGateConfig", () => ({
  fetchLocationGateConfig: () =>
    Promise.resolve({
      mode: "soft",
      activatedCitiesOnly: false,
      maxDismissals: 3,
      minClientBuild: { ios: null, android: null },
    }),
}));

// The modals render native surfaces; only their presence matters here.
jest.mock("@/components/location/FinishProfileModal", () => ({
  FinishProfileModal: () => null,
}));
jest.mock("@/components/location/ConfirmAddressModal", () => ({
  ConfirmAddressModal: () => null,
}));

const mockPatch = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock("@/utils/locationApi", () => {
  const actual =
    jest.requireActual<typeof import("@/utils/locationApi")>("@/utils/locationApi");
  return {
    ...actual,
    patchUserLocation: (...a: unknown[]) => mockPatch(...a),
  };
});

import LocationGate from "@/components/LocationGate";

/** Mounts, lets the config promise resolve, and runs out the appearance delay. */
async function mountSettled() {
  jest.useFakeTimers();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<LocationGate />);
  });
  await act(async () => {
    jest.advanceTimersByTime(1500);
  });
  return tree;
}

/** Whether the gate is currently rendering a modal. */
function showing(tree: renderer.ReactTestRenderer): boolean {
  return tree.root.children.length > 0;
}

async function navigateTo(tree: renderer.ReactTestRenderer, path: string) {
  mockPathname = path;
  await act(async () => {
    tree.update(<LocationGate />);
  });
  await act(async () => {
    jest.advanceTimersByTime(1500);
  });
}

beforeEach(() => {
  mockPatch.mockReset();
  mockAlert.mockReset();
  mockStore.updateProfile.mockClear();
  mockStore.setLocationEvaluation.mockClear();
  mockPush.mockClear();
  mockPathname = "/home";
  mockStore.user = { ...INCOMPLETE_USER };
});

describe("tapping an outstanding checklist row", () => {
  const finish = () =>
    require("@/components/location/FinishProfileModal").FinishProfileModal;

  it("routes to Edit Profile carrying the field that was tapped", async () => {
    const tree = await mountSettled();
    await act(async () => {
      tree.root.findByType(finish()).props.onSelectRow("phone");
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/editProfile",
      params: { focus: "phone" },
    });
  });

  it("routes without a focus hint when the CTA is used instead", async () => {
    const tree = await mountSettled();
    await act(async () => {
      tree.root.findByType(finish()).props.onContinue();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/editProfile" });
  });

  it("suppresses the modal without spending a dismissal", async () => {
    // Engaging with the gate is the opposite of skipping it: a row tap must not
    // eat one of the three soft-mode dismissals, or three taps on the checklist
    // would harden the gate against a user who was cooperating the whole time.
    const tree = await mountSettled();
    await act(async () => {
      tree.root.findByType(finish()).props.onSelectRow("pin");
    });
    expect(showing(tree)).toBe(false);

    await navigateTo(tree, "/editProfile");
    await navigateTo(tree, "/home");
    // Still dismissible => the dismissal budget was never touched.
    expect(tree.root.findByType(finish()).props.dismissible).toBe(true);
  });
});

describe("saving from the confirm modal", () => {
  const confirm = () =>
    require("@/components/location/ConfirmAddressModal").ConfirmAddressModal;

  /** A user WITH a pin gets the confirm modal rather than the checklist. */
  const withPin = {
    ...INCOMPLETE_USER,
    city: "Karachi",
    town: "DHA",
    latitude: "24.81",
    longitude: "67.08",
  };

  it("hands the server's verdict to the store, which is what closes the gate", async () => {
    mockStore.user = withPin;
    mockPatch.mockResolvedValue({
      Status: "Success",
      evaluation: {
        complete: true,
        missing: [],
        version: 1,
        currentVersion: 1,
        bucket: "complete",
      },
    });
    const tree = await mountSettled();

    await act(async () => {
      await tree.root.findByType(confirm()).props.onConfirm({ city: "Karachi" });
    });

    // The gate has no "close" of its own: it stops rendering once the user's
    // locationVersion reaches the completion version, and this call is the only
    // thing that carries it there without a refetch.
    expect(mockStore.setLocationEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ currentVersion: 1 }),
    );
  });

  it("does NOT report completion when the server says the profile is short", async () => {
    mockStore.user = withPin;
    mockPatch.mockResolvedValue({
      Status: "Success",
      evaluation: {
        complete: false,
        missing: ["houseNo"],
        version: 1,
        // No bump: the server did not consider this finished.
        currentVersion: 0,
        bucket: "has_pin_partial",
      },
    });
    const tree = await mountSettled();

    await act(async () => {
      await tree.root.findByType(confirm()).props.onConfirm({ city: "Karachi" });
    });

    expect(mockStore.setLocationEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ currentVersion: 0 }),
    );
    // Which leaves the gate up — correct, but see the handoff: the user is told
    // nothing about why.
  });

  it("tells the user what the SERVER still wants, naming the field", async () => {
    mockStore.user = withPin;
    mockPatch.mockResolvedValue({
      Status: "Success",
      evaluation: {
        complete: false,
        // The reachable case: a coordinate written by an older build is
        // `legacy_string`, which satisfies every check this app makes and
        // fails the server's `pin`.
        missing: ["pin"],
        version: 1,
        currentVersion: 0,
        bucket: "no_pin",
      },
    });
    const tree = await mountSettled();

    await act(async () => {
      await tree.root
        .findByType(confirm())
        .props.onConfirm({ city: "Karachi", town: "DHA" });
    });

    // Before this, the modal just stayed up: validation had passed so nothing
    // was marked, the request had succeeded so nothing errored.
    expect(mockAlert).toHaveBeenCalledWith(
      "Almost there",
      expect.stringContaining("Map pin"),
    );
  });

  it("says nothing extra when the server agrees the profile is done", async () => {
    mockStore.user = withPin;
    mockPatch.mockResolvedValue({
      Status: "Success",
      evaluation: {
        complete: true,
        missing: [],
        version: 1,
        currentVersion: 1,
        bucket: "complete",
      },
    });
    const tree = await mountSettled();

    await act(async () => {
      await tree.root.findByType(confirm()).props.onConfirm({ city: "Karachi" });
    });

    expect(mockAlert).not.toHaveBeenCalled();
  });

  it("does not stamp anything when the legacy save fails", async () => {
    mockStore.user = withPin;
    mockStore.updateProfile.mockResolvedValueOnce({
      Status: "Error",
      ErrorMessage: "nope",
    });
    const tree = await mountSettled();

    await act(async () => {
      await tree.root.findByType(confirm()).props.onConfirm({ city: "Karachi" });
    });

    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockStore.setLocationEvaluation).not.toHaveBeenCalled();
  });
});

describe("the gate re-arms when the user comes back to Home", () => {
  it("shows on Home once the delay has passed", async () => {
    const tree = await mountSettled();
    expect(showing(tree)).toBe(true);
  });

  it("comes back after a round trip through Edit Profile", async () => {
    const tree = await mountSettled();

    // Tapping Continue suppresses for this visit and pushes Edit Profile.
    await act(async () => {
      tree.root.findByType(
        require("@/components/location/FinishProfileModal").FinishProfileModal,
      ).props.onContinue();
    });
    expect(showing(tree)).toBe(false);

    await navigateTo(tree, "/editProfile");
    expect(showing(tree)).toBe(false);

    // Back on Home having filled in NOTHING: the gate must ask again.
    await navigateTo(tree, "/home");
    expect(showing(tree)).toBe(true);
  });

  it("asks again for only the fields still outstanding", async () => {
    const tree = await mountSettled();
    const finish = require("@/components/location/FinishProfileModal")
      .FinishProfileModal;
    expect(tree.root.findByType(finish).props.missing).toEqual([
      "phone",
      "city",
      "town",
      "houseNo",
      "pin",
    ]);

    await navigateTo(tree, "/editProfile");
    // They filled in some of it and left the rest.
    mockStore.user = {
      ...INCOMPLETE_USER,
      phone: "03001234567",
      city: "Karachi",
      town: "DHA",
    };
    await navigateTo(tree, "/home");

    expect(showing(tree)).toBe(true);
    // The checklist is recomputed from the live user, so the answered fields
    // are gone and only the real gaps are named. `subArea` is in the list and
    // was NOT in the first one: picking Karachi/DHA is what made it required
    // (DHA has canonical blocks), so the recomputation follows the cascade
    // rather than just crossing items off a fixed list.
    expect(tree.root.findByType(finish).props.missing).toEqual([
      "subArea",
      "houseNo",
      "pin",
    ]);
  });

  it("stays silent once the profile is actually complete", async () => {
    const tree = await mountSettled();
    await navigateTo(tree, "/editProfile");

    // What a completing PATCH leaves behind: the server-stamped version.
    mockStore.user = { ...INCOMPLETE_USER, locationVersion: 1 } as never;

    await navigateTo(tree, "/home");
    expect(showing(tree)).toBe(false);
  });
});
