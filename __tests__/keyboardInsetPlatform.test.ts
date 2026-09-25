/// <reference types="jest" />

/**
 * The Android keyboard has to be measured, because Android will not say.
 *
 * `automaticallyAdjustKeyboardInsets` insets a ScrollView by the real keyboard
 * height and needs nothing else — on iOS. It is an iOS-ONLY prop, silently
 * ignored on Android, so every screen relying on it alone was fixed on one
 * platform and untouched on the other. That is the hardest shape of bug to
 * hear about: the person testing on iOS sees it working.
 *
 * Source-level, like modalKeyboard.test.ts: what matters is that no screen
 * ships depending on that prop by itself.
 */
import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SCREENS = [
  "app/editProfile.tsx",
  "components/location/ConfirmAddressModal.tsx",
];

describe("screens that adjust for the keyboard", () => {
  for (const file of SCREENS) {
    it(`${file} does not rely on the iOS-only prop alone`, () => {
      const src = read(file);
      expect(src).toMatch(/automaticallyAdjustKeyboardInsets/);
      // The Android half. Without it the prop above is the whole fix, and
      // the whole fix is iOS.
      expect(src).toMatch(/useKeyboardInset\(\)/);
    });

    it(`${file} actually applies the measured inset`, () => {
      // Calling the hook and ignoring it would pass the test above while
      // changing nothing on screen.
      expect(read(file)).toMatch(/keyboardInset/);
    });
  }

  it("the hook measures on Android and stands aside on iOS", () => {
    const src = read("hooks/useKeyboardInset.ts");
    expect(src).toMatch(/Platform\.OS !== "android"/);
    /*
     * keyboardDidShow, not keyboardWillShow: Android does not fire the Will
     * events on most versions, so a listener on those is a fix that never
     * runs and still reviews well.
     */
    expect(src).toMatch(/addListener\("keyboardDidShow"/);
    // The listener, not the prose: the comment above explains why the Will
    // events are wrong, and a bare /keyboardWillShow/ matched that.
    expect(src).not.toMatch(/addListener\("keyboardWill/);
  });

  it("shrinks the viewport rather than padding the content", () => {
    /*
     * The first attempt padded contentContainerStyle. Under edge-to-edge —
     * on by default from Expo SDK 54 — the window does not shrink when the
     * keyboard opens, so that only added scrollable space BELOW the fold
     * while the viewport still ran to the bottom of the screen. The focused
     * field stayed exactly where the keyboard covered it, and the fix
     * appeared to do nothing at all.
     */
    for (const file of SCREENS) {
      expect(read(file)).toMatch(/marginBottom: keyboardInset/);
    }
  });

  it("keeps the last field clear of the Android navigation bar", () => {
    // Edge-to-edge draws under the ||| O < row too. The home tabs escape it
    // only because the tab bar happens to occupy that space.
    expect(read("app/editProfile.tsx")).toMatch(/useSafeAreaInsets\(\)/);
    expect(read("app/editProfile.tsx")).toMatch(/insets\.bottom/);
  });
});
