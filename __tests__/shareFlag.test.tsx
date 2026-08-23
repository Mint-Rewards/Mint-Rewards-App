/**
 * Gating tests for the `referrals-enabled` PostHog flag on the Share screen.
 *
 * The flag's whole value is that it can be flipped without a release, which
 * means nobody exercises the off state before it is switched on for real
 * users. These cover the two ways that goes wrong: the paused state never
 * appearing, and — the more dangerous one — an unresolved flag being read as
 * "off" and hiding the form from everyone at cold start.
 */
import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";

const mockUseFeatureFlag = jest.fn();
jest.mock("posthog-react-native", () => ({
  useFeatureFlag: (key: string) => mockUseFeatureFlag(key),
}));

const mockSendReferral = jest.fn();
jest.mock("../store/store", () => ({
  useAppStore: () => ({
    sendReferral: mockSendReferral,
    isLoading: false,
    error: null,
    user: { mintId: "M1", email: "a@b.test" },
  }),
}));

// Pulling in the real module loads the Sentry SDK, which keeps timers alive
// past the end of the run.
jest.mock("@/utils/sentry", () => ({ captureError: jest.fn() }));

jest.mock("@/components/ui/navbar", () => "Navbar");
jest.mock("@/components/ui/TabBarBackground", () => ({
  useBottomTabOverflow: () => 0,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
jest.mock("expo-status-bar", () => ({ StatusBar: "StatusBar" }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

import ShareScreen from "../app/(tabs)/share";

/** Every string rendered anywhere in the tree, flattened. */
function allText(tree: renderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(React.createElement(ShareScreen));
  });
  return tree;
}

describe("referrals-enabled flag", () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReset();
    mockSendReferral.mockReset();
  });

  it("shows the invite form when the flag is on", () => {
    mockUseFeatureFlag.mockReturnValue(true);
    const text = allText(render());
    expect(text).toContain("Add another email");
    expect(text).not.toContain("Invitations are paused");
  });

  it("shows the form while the flag is still unresolved", () => {
    // undefined is what PostHog returns before flags load. Defaulting off here
    // would flash a paused screen at every user on every cold start.
    mockUseFeatureFlag.mockReturnValue(undefined);
    expect(allText(render())).toContain("Add another email");
  });

  it("replaces the form and the send button when the flag is off", () => {
    mockUseFeatureFlag.mockReturnValue(false);
    const text = allText(render());
    expect(text).toContain("Invitations are paused");
    expect(text).not.toContain("Add another email");
    expect(text).not.toContain("Send invitation");
  });

  it("reads the flag under its documented key", () => {
    mockUseFeatureFlag.mockReturnValue(true);
    render();
    expect(mockUseFeatureFlag).toHaveBeenCalledWith("referrals-enabled");
  });
});
