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
  user: INCOMPLETE_USER,
  token: "t",
  updateProfile: jest.fn(),
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
