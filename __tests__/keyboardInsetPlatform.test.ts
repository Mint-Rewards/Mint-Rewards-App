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

/**
 * What the two shipped fixes above got wrong.
 *
 * Both `01a0d907` (content padding) and `01a0d912` (viewport margin) passed
 * every test in the block above and changed nothing on the handset. Both were
 * built on `keyboardInset`, and under edge-to-edge that measurement does not
 * reliably arrive — so both reduced to multiplying by zero, silently, on the
 * one platform they existed for.
 *
 * These tests pin the invariants that do NOT depend on the measurement.
 */
describe("the keyboard fix does not depend on a measured height", () => {
  const editProfile = () => read("app/editProfile.tsx");

  it("reserves the navigation bar on the screen, not in the scroll content", () => {
    /*
     * Padding the scroll CONTENT leaves the viewport running to the bottom of
     * the glass, so whatever is passing under the ||| O < row at any moment is
     * still covered by it — which is what the handset showed. The container
     * has to end above the bar.
     */
    expect(editProfile()).toMatch(
      /styles\.container,\s*\{\s*paddingBottom:\s*insets\.bottom\s*\}/,
    );
  });

  it("scrolls a focused field to the top of the viewport", () => {
    /*
     * An Android keyboard never covers the top of the screen, so a field
     * scrolled up there is visible whatever the keyboard is doing and however
     * tall it is reported to be. This is the part that actually works.
     */
    const src = editProfile();
    expect(src).toMatch(/const scrollFieldIntoView/);
    expect(src).toMatch(/onFocus=\{\(\) => \{/);
    expect(src).toMatch(/scrollFieldIntoView\(inputRef\)/);
  });

  it("assumes a keyboard when Android reports none", () => {
    /*
     * A ScrollView cannot scroll past the end of its content, so a field near
     * the bottom has nowhere to go without room reserved below it. Reserving
     * that room from `keyboardInset` alone is the same zero-multiplication
     * that sank the last two attempts.
     */
    // One number, declared with the hook, so the two screens cannot drift.
    expect(read("hooks/useKeyboardInset.ts")).toMatch(
      /export const ANDROID_KEYBOARD_FALLBACK = \d+/,
    );
    for (const file of SCREENS) {
      const src = read(file);
      expect(src).toMatch(/Math\.max\(keyboardInset, ANDROID_KEYBOARD_FALLBACK\)/);
      // Driven by the cursor being in a field, not by the measurement.
      expect(src).toMatch(/fieldFocused/);
    }
  });

  it("does not carry the reserved room around at rest", () => {
    // A screenful of blank space below a form nobody is typing in.
    for (const file of SCREENS) {
      expect(read(file)).toMatch(/!fieldFocused\s*\?\s*0/);
    }
  });

  it("gives the scroll something to measure against", () => {
    /*
     * `measureLayout` needs a frame. Without a ref on one, the scroll is a
     * silent no-op — which is the exact shape of the two fixes that shipped
     * and changed nothing.
     */
    for (const file of SCREENS) {
      const src = read(file);
      expect(src).toMatch(/const contentRef = useRef<View>\(null\)/);
      expect(src).toMatch(/ref=\{contentRef\}/);
      expect(src).toMatch(/const scrollFieldIntoView/);
      expect(src).toMatch(/onFieldFocus=\{/);
    }
  });
});

/**
 * Sheets anchored to the bottom of an edge-to-edge screen.
 *
 * `justifyContent: "flex-end"` means the bottom of the glass, which is under
 * the ||| O < row — so the last control of every one of these sat against the
 * system buttons. Six of them, wrong in the same way, which is what the shared
 * hook is for.
 */
describe("bottom sheets clear the system controls", () => {
  const SHEETS = [
    "app/(tabs)/deals.tsx",
    "app/(tabs)/redeem.tsx",
    "components/location/TownChangeModal.tsx",
    "components/location/ConfirmAddressModal.tsx",
    "components/ui/LocationPicker.tsx",
    "components/location/FinishProfileModal.tsx",
  ];

  for (const file of SHEETS) {
    it(`${file} reserves the inset below its last control`, () => {
      const src = read(file);
      expect(src).toMatch(/useSheetInset\(/);
      expect(src).toMatch(/paddingBottom: sheetInset/);
    });
  }

  it("every bottom-anchored sheet is on the list", () => {
    /*
     * The list above is only as good as its completeness, and a seventh sheet
     * added later would be wrong in the same way with nothing to catch it.
     * This finds them by the property that causes the problem.
     */
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const found = execSync(
      'grep -rl \'justifyContent: "flex-end"\' --include=*.tsx app components || true',
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .sort();
    expect(found).toEqual([...SHEETS].sort());
  });
});
