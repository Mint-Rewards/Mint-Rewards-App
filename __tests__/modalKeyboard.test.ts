/// <reference types="jest" />

/**
 * Keyboard handling inside a modal, on Android.
 *
 * `behavior={Platform.OS === "ios" ? "padding" : undefined}` reads like a
 * deliberate platform choice and is a no-op: KeyboardAvoidingView with no
 * behaviour does nothing at all. It survives on most screens because
 * windowSoftInputMode adjustResize shrinks the activity — but a React Native
 * <Modal> is its own window and does not resize with the activity, so inside
 * one the keyboard simply lands on top of the fields.
 *
 * Asserted against the source rather than a render: what matters is that no
 * modal ships with an undefined behaviour again, and that is a fact about the
 * file.
 */
import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODALS_WITH_INPUTS = [
  "components/location/ConfirmAddressModal.tsx",
  "components/ui/LocationPicker.tsx",
];

describe("a modal that collects typing", () => {
  for (const file of MODALS_WITH_INPUTS) {
    const source = readFileSync(join(process.cwd(), file), "utf8");

    it(`${file} avoids the keyboard on both platforms`, () => {
      const behaviours = source.match(/behavior=\{[^}]*\}/g) ?? [];
      expect(behaviours.length).toBeGreaterThan(0);
      for (const behaviour of behaviours) {
        expect(behaviour).not.toMatch(/undefined/);
      }
    });

    it(`${file} lifts the sheet rather than padding beneath it`, () => {
      // These sheets are pinned to the bottom of the screen. Padding adds
      // space under something already at the bottom and moves nothing.
      expect(source).toMatch(/behavior=\{Platform\.OS === "ios" \? "padding" : "height"\}/);
    });
  }
});
