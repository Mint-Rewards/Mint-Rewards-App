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
 * Sheets that rise from the bottom of an edge-to-edge screen.
 *
 * Two things they all have to get right, and both were wrong across the board.
 *
 * `justifyContent: "flex-end"` means the bottom of the glass, which is under
 * the ||| O < row, so every sheet's last control sat against the system
 * buttons. And every one of them could only be closed by a button: tapping
 * the dimmed area did nothing, which is the first thing anybody tries.
 *
 * `BottomSheet` now owns both. A sheet either uses it, or reserves the inset
 * itself and says why.
 */
describe("bottom sheets", () => {
  /** Sheets that delegate to the shared component. */
  const ON_BOTTOM_SHEET = [
    "app/(tabs)/deals.tsx",
    "app/(tabs)/redeem.tsx",
    "components/location/TownChangeModal.tsx",
    "components/location/FinishProfileModal.tsx",
    "components/NotificationNudgeModal.tsx",
  ];

  /**
   * Sheets that still build their own, and the reason each one does.
   *
   * Not an exemption from the inset — they are checked for it below — only
   * from the shared component.
   */
  const OWN_CONTAINER: Record<string, string> = {
    // Hosts a KeyboardAvoidingView, a ScrollView and the focus-scrolling
    // above; converting it in the same pass as everything else would put the
    // location gate's hard rule on the same roll of the dice as a cosmetic
    // change.
    "components/location/ConfirmAddressModal.tsx": "keyboard handling",
    // Already closes on a backdrop tap, so the complaint never applied.
    "components/ui/LocationPicker.tsx": "already dismissible",
  };

  for (const file of ON_BOTTOM_SHEET) {
    it(`${file} uses the shared sheet`, () => {
      const src = read(file);
      expect(src).toMatch(/<BottomSheet/);
      // Which is where the inset comes from, so it must not also roll its own.
      expect(src).not.toMatch(/justifyContent: "flex-end"/);
    });

    it(`${file} has no Close button`, () => {
      /*
       * The backdrop, the drag and Android back all close it. A "Close"
       * control on top of those is the thing the user asked to be rid of.
       * "Not now" and "Cancel" are answers to a question, not ways out, and
       * are deliberately still allowed.
       */
      expect(read(file)).not.toMatch(/>Close</);
    });
  }

  for (const [file, why] of Object.entries(OWN_CONTAINER)) {
    it(`${file} reserves the inset itself (${why})`, () => {
      const src = read(file);
      expect(src).toMatch(/useSheetInset\(/);
      expect(src).toMatch(/paddingBottom: sheetInset/);
    });
  }

  it("fades the backdrop instead of sliding it away with the card", () => {
    /*
     * The Modal's own `animationType="slide"` translates the ENTIRE modal,
     * dim layer included — so the black wash travelled down with the card
     * and the screen behind it was revealed from the top. The sheet animates
     * itself, which is why it also has to stay mounted past `visible` going
     * false to play the exit.
     */
    const src = read("components/ui/BottomSheet.tsx");
    expect(src).toMatch(/animationType="none"/);
    expect(src).not.toMatch(/animationType="slide"/);
    expect(src).toMatch(/const \[rendered, setRendered\]/);
  });

  it("uses Gesture Handler, not the JS responder system", () => {
    /*
     * Two attempts were built on PanResponder and neither followed the
     * finger. The JS responder system negotiates per touch: a
     * TouchableOpacity becomes the responder the moment a finger lands on
     * it, and on a card that is mostly buttons the sheet is never asked.
     * Capturing on the move phase did not rescue it either. Gesture Handler
     * runs natively and does not take part in that argument.
     */
    const src = read("components/ui/BottomSheet.tsx");
    expect(src).toMatch(/Gesture\.Pan\(\)/);
    expect(src).toMatch(/<GestureDetector gesture=\{pan\}>/);
    // Its absence from the CODE. The header comment names it deliberately,
    // to record why it is not being used.
    expect(src).not.toMatch(/PanResponder\.create/);
    expect(src).not.toMatch(/panHandlers/);
  });

  it("mounts the gesture root the Modal needs", () => {
    /*
     * The one line whose absence makes a Gesture Handler gesture inside a
     * React Native <Modal> silently inert: the modal's contents live in a
     * separate native view hierarchy that the app's root does not reach.
     * Forgetting it reproduces the exact bug this replaced, with no error.
     */
    expect(read("components/ui/BottomSheet.tsx")).toMatch(
      /<GestureHandlerRootView style=\{styles\.root\}>/,
    );
  });

  it("reads velocity in the units Gesture Handler reports", () => {
    /*
     * Gesture Handler gives px per SECOND where PanResponder gave px per
     * millisecond. Carrying the old threshold across would have made every
     * gesture a dismissal — a thousandfold error that no type would catch.
     */
    const src = read("components/ui/BottomSheet.tsx");
    const threshold = /const DISMISS_VELOCITY = (\d+)/.exec(src);
    expect(threshold).not.toBeNull();
    expect(Number(threshold![1])).toBeGreaterThan(100);
    expect(src).toMatch(/event\.velocityY > DISMISS_VELOCITY/);
  });

  it("does not eat taps on the buttons inside the card", () => {
    // The whole card is the handle, so the gesture must not activate until
    // the finger has actually travelled. A tap does not move.
    const src = read("components/ui/BottomSheet.tsx");
    expect(src).toMatch(/\.activeOffsetY\(\[-ACTIVATION_SLOP, ACTIVATION_SLOP\]\)/);
  });

  it("follows the finger upward too, without exposing the backdrop", () => {
    /*
     * Dragging up cannot dismiss anything, but a card that answers in only
     * one direction does not feel attached to the finger. It follows
     * reluctantly and springs back, and its background runs past the bottom
     * of the screen by the same amount it can be lifted, so what comes into
     * view is more card rather than a strip of dimmed area beneath it.
     */
    const src = read("components/ui/BottomSheet.tsx");
    expect(src).toMatch(/Math\.max\(-LIFT_LIMIT, event\.translationY \* LIFT_DAMPING\)/);
    expect(src).toMatch(/paddingBottom: sheetInset \+ LIFT_LIMIT/);
    expect(src).toMatch(/marginBottom: -LIFT_LIMIT/);
  });

  it("dims in step with the drag", () => {
    // What makes a half-finished drag readable: the gesture shows you what
    // letting go will do before you let go.
    const src = read("components/ui/BottomSheet.tsx");
    expect(src).toMatch(/const backdropStyle = useAnimatedStyle/);
    expect(src).toMatch(/interpolate\(\s*translateY\.value/);
  });

  it("the shared sheet reserves the inset and offers three ways out", () => {
    const src = read("components/ui/BottomSheet.tsx");
    expect(src).toMatch(/useSheetInset\(/);
    expect(src).toMatch(/paddingBottom: sheetInset/);
    // Drag, backdrop, Android back.
    expect(src).toMatch(/Gesture\.Pan\(\)/);
    expect(src).toMatch(/testID="bottom-sheet-backdrop"/);
    expect(src).toMatch(/onRequestClose=\{dismissible \? onClose/);
  });

  it("reports when it has actually gone, not merely when it stops moving", () => {
    /*
     * A sheet that hands off to another Modal has to say when it is GONE.
     * React Native drops a presentation made while another Modal is
     * dismissing, so "I've moved my house" closed the town sheet, asked for
     * the map picker in the same tick, and got nothing at all.
     *
     * The timer beside the animation callback is the part that matters: a
     * caller waiting on `onClosed` to open the next screen would otherwise be
     * stranded by a callback that never arrives. A sheet closing a fraction
     * late is cosmetic; one that never reports closing is a dead end.
     */
    const src = read("components/ui/BottomSheet.tsx");
    expect(src).toMatch(/onClosed\?: \(\) => void/);
    expect(src).toMatch(/setTimeout\(finishClose, EXIT_MS \+ \d+\)/);
    // Idempotent, because the animation and the timer race to call it.
    expect(src).toMatch(/if \(closedOnce\.current\) return/);
    // And re-armed, or a sheet reopened after closing never reports again.
    expect(src).toMatch(/closedOnce\.current = false/);
  });

  it("a pinned sheet cannot be swiped away", () => {
    /*
     * The location gate's hard rule: a household with no pin cannot be
     * catered for. A gate that a drag dismisses is not a gate, so all three
     * exits route through the one flag.
     */
    const src = read("components/ui/BottomSheet.tsx");
    expect(src).toMatch(/onPress=\{dismissible \? onClose : undefined\}/);
    expect(src).toMatch(/\.enabled\(dismissible\)/);
  });

  it("the system inset cannot be overridden by a caller's own style", () => {
    /*
     * `style` used to come AFTER the computed padding in the style array, so
     * any sheet whose own stylesheet still carried a `paddingBottom` silently
     * won — discarding the inset and putting its buttons back under the
     * ||| O < row. Two did, and the finish-profile modal shipped that way:
     * Continue and Not now sat under the Android navigation buttons.
     *
     * The inset is the whole point of the component, so it goes last.
     * `extraInset` is the supported way to ask for more room.
     */
    const src = read("components/ui/BottomSheet.tsx");
    const arr = src.slice(src.indexOf("style={[\n        styles.card"));
    const styleAt = arr.indexOf("style,");
    const padAt = arr.indexOf("paddingBottom: sheetInset");
    expect(styleAt).toBeGreaterThan(-1);
    expect(padAt).toBeGreaterThan(styleAt);
  });

  it("no sheet re-declares the padding the component computes", () => {
    // Belt to the braces above: even with the ordering right, a stray
    // paddingBottom in a caller's sheet style is a sign someone is fighting
    // the component rather than passing `extraInset`.
    for (const file of ON_BOTTOM_SHEET) {
      const src = read(file);
      const styleBlock = /\n  (?:sheet|couponSheet|modalSheet): \{[\s\S]*?\n  \},/.exec(src);
      if (!styleBlock) continue;
      expect(styleBlock[0]).not.toMatch(/paddingBottom/);
    }
  });

  it("the picker's backdrop sits behind its card, not around it", () => {
    /*
     * A TouchableOpacity WRAPPING the card closes on any press inside it that
     * is not itself touchable — and counts a layout change as a press. Open
     * this picker while another field holds the keyboard: the modal is its own
     * window, the keyboard dismisses, the KeyboardAvoidingView resizes under a
     * finger that is still down, the wrapper fires, the sheet shuts, the
     * finger is back on the dropdown, and it reopens. It flickered as fast as
     * it could render.
     */
    const src = read("components/ui/LocationPicker.tsx");
    expect(src).toMatch(/<Pressable\s+style=\{StyleSheet\.absoluteFill\}/);
    expect(src).not.toMatch(/<TouchableOpacity\s+style=\{styles\.overlay\}/);
    // And the keyboard is put away before the sheet arrives, so it opens
    // against a settled layout rather than a moving one.
    expect(src).toMatch(/Keyboard\.dismiss\(\);\s*\n\s*setIsOpen\(true\)/);
  });

  it("every bottom-anchored sheet is accounted for", () => {
    /*
     * The lists above are only as good as their completeness, and a new sheet
     * would be wrong in the same two ways with nothing to catch it. This finds
     * them by the property that causes the problem.
     */
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const found = execSync(
      'grep -rl \'justifyContent: "flex-end"\' --include=*.tsx app components || true',
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .sort();
    expect(found).toEqual(
      [...Object.keys(OWN_CONTAINER), "components/ui/BottomSheet.tsx"].sort(),
    );
  });
});
