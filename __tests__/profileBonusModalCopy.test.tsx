/**
 * The rule the 2026-08-25 owner decision set, now enforced by a test rather
 * than by a comment: THESE SHEETS NEVER MENTION POINTS UNLESS A LIVE WINDOW
 * SAYS THEY CAN.
 *
 * The badge came back when the award did, but every no-bonus path — campaign
 * off, config unreadable, window elapsed, user never stamped — still has to
 * render the copy that shipped before the campaign existed. `bonus === null` is
 * the single code path all of those collapse into, so asserting on it covers
 * the lot.
 *
 * ConfirmAddressModal is not exercised here: it mounts a map picker, a location
 * form and a reverse-geocode fetch on mount, which is a fixture out of all
 * proportion to a copy assertion. Its bonus rendering is the same three lines
 * driven by the same prop, and the shared decision that feeds both is covered
 * in __tests__/profileBonus.test.ts.
 */

import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { FinishProfileModal } from "@/components/location/FinishProfileModal";
import type { ProfileBonus } from "@/utils/profileBonus";

jest.mock("@/utils/locationAnalytics", () => ({
  trackProfileBonusShown: jest.fn(),
}));

const HOUR = 60 * 60 * 1000;

/** Every string the sheet actually renders, flattened. */
function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) =>
      React.Children.toArray(node.props.children)
        .filter((c) => typeof c === "string" || typeof c === "number")
        .join(""),
    )
    .join(" | ");
}

/**
 * Renders, reads the copy, and UNMOUNTS. The unmount is not tidiness: a live
 * bonus starts useDeadline's minute timer, and a tree left mounted holds it
 * past the end of the run (jest reports the worker failing to exit). Returning
 * the text rather than the tree makes it impossible for a case to forget.
 */
function renderText(node: React.ReactElement): string {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  const text = textOf(tree);
  act(() => {
    tree.unmount();
  });
  return text;
}

function render(bonus: ProfileBonus | null): string {
  return renderText(
    <FinishProfileModal
      visible
      missing={["phone", "houseNo", "pin"]}
      dismissible
      onContinue={jest.fn()}
      onSelectRow={jest.fn()}
      onDismiss={jest.fn()}
      bonus={bonus}
    />,
  );
}

describe("no live bonus", () => {
  it("says nothing about points when bonus is null", () => {
    const text = render(null);

    expect(text).not.toMatch(/point/i);
    expect(text).not.toMatch(/\+\d/);
    expect(text).toContain("Continue");
  });

  it("says nothing about points when the prop is omitted entirely", () => {
    // The default. Every existing call site that has not been updated — and
    // every future one that forgets — lands here.
    const text = renderText(
      <FinishProfileModal
        visible
        missing={["pin"]}
        dismissible
        onContinue={jest.fn()}
        onSelectRow={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );

    expect(text).not.toMatch(/point/i);
  });

  it("withdraws the promise when the window has already elapsed", () => {
    // A deadline in the past reaches the sheet as a real `bonus` object; the
    // sheet must not take the object's word for it.
    const text = render({ points: 100, expiresAt: Date.now() - 1000 });

    expect(text).not.toMatch(/point/i);
    expect(text).toContain("Continue");
  });
});

describe("live bonus", () => {
  it("renders the badge and the earning CTA", () => {
    const text = render({ points: 100, expiresAt: Date.now() + 5 * HOUR });

    expect(text).toContain("+100 POINTS");
    expect(text).toContain("Continue & earn 100 points");
  });

  it("shows how long is left", () => {
    const text = render({ points: 100, expiresAt: Date.now() + 5 * HOUR });

    expect(text).toMatch(/4h 59m left|5h 0m left/);
  });

  it("renders the configured amount rather than a hardcoded 100", () => {
    const text = render({ points: 250, expiresAt: Date.now() + HOUR });

    expect(text).toContain("+250 POINTS");
    expect(text).toContain("Continue & earn 250 points");
  });

  it("leaves the checklist itself untouched", () => {
    // The bonus is decoration on an existing decision — it must not change
    // what the sheet says is missing.
    const withBonus = render({ points: 100, expiresAt: Date.now() + HOUR });
    const without = render(null);

    for (const line of ["Finish your profile", "2 of 5 complete", "Map pin"]) {
      expect(withBonus).toContain(line);
      expect(without).toContain(line);
    }
  });
});
