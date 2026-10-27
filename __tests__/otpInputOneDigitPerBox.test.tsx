/**
 * One digit per box, whatever arrives and however it arrives.
 *
 * The boxes used to be six `TextInput`s, each accepting up to six characters so
 * a pasted code could be spread across them. Pasting letters into one left
 * them sitting there: non-digits were stripped, which left the code unchanged,
 * so there was no prop change for React to push back down.
 *
 * The fix is structural — one field, and boxes that only draw it — so these
 * tests are written structurally too. The last one is the real guarantee: if
 * somebody turns the boxes back into inputs, it fails.
 */
import { describe, expect, it, jest } from "@jest/globals";
import React, { useState } from "react";
import renderer, { act } from "react-test-renderer";
import { Text, TextInput } from "react-native";

jest.mock("@/utils/constants", () => ({
  API_BASE_URL: "https://test.invalid",
  Constants: { appThemeColor: "#449EB2", showDialog: jest.fn() },
}));

import OtpInput from "@/components/OtpInput";

/** Controlled the way every real caller controls it. */
function Harness({ secure = false }: { secure?: boolean }) {
  const [code, setCode] = useState("");
  return (
    <OtpInput
      value={code}
      onChange={setCode}
      autoFocus={false}
      secure={secure}
    />
  );
}

function render(secure = false) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Harness secure={secure} />);
  });
  return tree;
}

/** The single field, which is also what a paste or an autofill arrives on. */
function field(tree: renderer.ReactTestRenderer) {
  const inputs = tree.root.findAllByType(TextInput);
  expect(inputs).toHaveLength(1);
  return inputs[0];
}

async function arrive(tree: renderer.ReactTestRenderer, text: string) {
  await act(async () => {
    field(tree).props.onChangeText(text);
  });
}

/** What each box draws, in order. An empty box draws the placeholder bullet. */
function drawn(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map((node) => String(node.props.children))
    .filter((text) => text !== "undefined");
}

const BULLET = "•";

describe("OtpInput — one digit per box", () => {
  it("keeps only the digits out of an alphanumeric paste, in order", async () => {
    const tree = render();
    await arrive(tree, "a1b2c3");

    expect(drawn(tree)).toEqual(["1", "2", "3", BULLET, BULLET, BULLET]);
  });

  /*
   * The reported bug. "abc" sanitises to nothing, so the code does not change
   * — which is precisely the case the old component could not recover from,
   * because React had no new prop to send to the box holding the letters.
   */
  it("shows nothing at all for a paste with no digits in it", async () => {
    const tree = render();
    await arrive(tree, "abc");

    expect(drawn(tree)).toEqual([BULLET, BULLET, BULLET, BULLET, BULLET, BULLET]);
    expect(field(tree).props.value).toBe("");
  });

  it("never lets a letter reach a box, for any of these", async () => {
    for (const pasted of [
      "abcdef",
      "A1!2 3",
      "   ",
      "12ab34",
      "٢٣٤", // Arabic-Indic digits — not \d, so not ours to accept
      "1.2,3",
      "-123456",
    ]) {
      const tree = render();
      await arrive(tree, pasted);

      for (const text of drawn(tree)) {
        expect(text.length).toBe(1);
        expect(text === BULLET || /^[0-9]$/.test(text)).toBe(true);
      }
    }
  });

  it("truncates a paste longer than the row instead of refusing it", async () => {
    const tree = render();
    await arrive(tree, "1234567890");

    expect(drawn(tree)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(field(tree).props.value).toBe("123456");
  });

  /*
   * A code with a trailing space or a stray character is the common real paste,
   * and it has to survive — truncating the FIELD rather than refusing the input
   * is what makes that work.
   */
  it("accepts a code pasted with surrounding junk", async () => {
    const tree = render();
    await arrive(tree, " 483927\n");

    expect(drawn(tree)).toEqual(["4", "8", "3", "9", "2", "7"]);
  });

  it("masks every character when secure, and never draws the digit", async () => {
    const tree = render(true);
    await arrive(tree, "483927");

    expect(drawn(tree)).toEqual(Array(6).fill(BULLET));
    for (const text of drawn(tree)) expect(/[0-9]/.test(text)).toBe(false);
  });

  it("draws one box per digit of length, always", async () => {
    const tree = render();
    expect(drawn(tree)).toHaveLength(6);
    await arrive(tree, "4");
    expect(drawn(tree)).toHaveLength(6);
    await arrive(tree, "483927");
    expect(drawn(tree)).toHaveLength(6);
  });

  /*
   * Sanitising on the way OUT as well as in: a parent restoring a draft or
   * reading a route param must not be able to put a letter in a box either.
   */
  it("sanitises a value handed in by the parent", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <OtpInput value="a1b2" onChange={jest.fn()} autoFocus={false} />,
      );
    });

    expect(drawn(tree)).toEqual(["1", "2", BULLET, BULLET, BULLET, BULLET]);
  });

  /*
   * THE GUARANTEE. With one field there is nowhere for a stray character to
   * live, so none of the above depends on native honouring a correction. Turn
   * the boxes back into inputs and this fails first.
   */
  it("has exactly one text field, not one per box", () => {
    const tree = render();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  });
});
