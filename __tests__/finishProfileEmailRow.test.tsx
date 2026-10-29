/**
 * The checklist must not tick a field the account does not have.
 *
 * The "Email" row covers nothing, so it can never be outstanding — it always
 * drew as done and always counted towards "x of y complete". True of an
 * account created from an email address; on a phone-only household it ticked
 * an address that does not exist. QA reported seeing "Email ✓" on an account
 * that had never had one.
 *
 * The two rows below it in ROWS are filtered out rather than drawn as done for
 * exactly this reason, with a comment saying so. This one was not.
 */
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { FinishProfileModal } from "@/components/location/FinishProfileModal";
import type { MissingField } from "@/utils/locationGate";

function render(hasEmail: boolean, missing: MissingField[] = ["city"]) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <FinishProfileModal
        visible
        missing={missing}
        dismissible
        onContinue={jest.fn()}
        onSelectRow={jest.fn()}
        onDismiss={jest.fn()}
        emailVerificationApplies={hasEmail}
      />,
    );
  });
  return tree
    .root.findAllByType(Text)
    .map((node) => String(node.props.children));
}

describe("the Email row", () => {
  it("is not shown at all to an account with no email", () => {
    expect(render(false)).not.toContain("Email");
  });

  it("is shown to an account that has one", () => {
    expect(render(true)).toContain("Email");
  });
});
