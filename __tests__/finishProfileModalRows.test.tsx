/**
 * Which checklist rows are buttons.
 *
 * The chevron has always rendered on exactly the outstanding rows, so the
 * affordance was already promising a tap that nothing listened for. Now that it
 * does something, the pairing has to hold in both directions: a finished row
 * must not become a dead button, and an outstanding one must not be a dead end.
 */
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";
import { FinishProfileModal } from "@/components/location/FinishProfileModal";
import type { MissingField } from "@/utils/locationGate";

function render(missing: MissingField[], onSelectRow = jest.fn()) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <FinishProfileModal
        visible
        missing={missing}
        dismissible
        onContinue={jest.fn()}
        onSelectRow={onSelectRow}
        onDismiss={jest.fn()}
      />,
    );
  });
  return { tree, onSelectRow };
}

/** The row buttons, which carry an accessibilityLabel; the CTA and skip do not. */
function rowButtons(tree: renderer.ReactTestRenderer) {
  return tree.root
    .findAllByType(TouchableOpacity)
    .filter((n) => typeof n.props.accessibilityLabel === "string");
}

describe("checklist rows", () => {
  it("makes every outstanding row tappable", () => {
    const { tree } = render(["userName", "phone", "city", "pin"]);
    // Name, Phone, Pickup address, Map pin — four gaps, four buttons.
    expect(rowButtons(tree)).toHaveLength(4);
  });

  it("does not make finished rows tappable", () => {
    const { tree } = render(["pin"]);
    // Only the pin is outstanding; Name, Email and Pickup address are done.
    expect(rowButtons(tree)).toHaveLength(1);
  });

  it("never makes Email tappable, even though it has no covering field", () => {
    // Email is `covers: []`, so it is always "done" — but if that ever changed,
    // routing to it would land on a read-only input the user cannot fix.
    const { tree } = render(["userName", "phone", "city", "houseNo", "pin"]);
    const labels = rowButtons(tree).map((n) => n.props.accessibilityLabel);
    expect(labels.some((l: string) => l.startsWith("Email"))).toBe(false);
  });

  it("reports the field the tapped row stands for", () => {
    const { tree, onSelectRow } = render(["city", "houseNo"]);
    const address = rowButtons(tree).find((n) =>
      n.props.accessibilityLabel.startsWith("Pickup address"),
    );
    act(() => {
      address!.props.onPress();
    });
    // Four inputs collapse into one destination, because they are one question.
    expect(onSelectRow).toHaveBeenCalledWith("address");
  });

  it("has nothing to tap once everything is done", () => {
    const { tree } = render([]);
    expect(rowButtons(tree)).toHaveLength(0);
  });
});
