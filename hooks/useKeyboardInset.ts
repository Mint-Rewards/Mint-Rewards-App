/**
 * How much room the keyboard is taking, on the platform that will not say.
 *
 * iOS has `automaticallyAdjustKeyboardInsets`, which insets a ScrollView by
 * the real keyboard height and needs nothing else. That prop is iOS-ONLY —
 * silently ignored on Android — so the screens using it were fixed on one
 * platform and untouched on the other, which is exactly how a field stayed
 * hidden behind an Android keyboard while iOS looked perfect.
 *
 * On Android this measures the keyboard and the caller pads by it. Returns 0
 * on iOS so the two paths never both apply and double-space the content.
 */
import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    /*
     * `keyboardDidShow`, not `keyboardWillShow`.
     *
     * Android does not fire the Will events at all on most versions, so a
     * listener on those is a fix that never runs — and one that looks correct
     * in review.
     */
    const shown = Keyboard.addListener("keyboardDidShow", (e) => {
      setInset(e.endCoordinates?.height ?? 0);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => setInset(0));

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return inset;
}

/**
 * Scroll room to assume when Android reports no keyboard height of its own.
 *
 * The hook above reads `keyboardDidShow`, and under edge-to-edge that event is
 * not reliably raised with a usable height — which is how two successive fixes
 * built on the measurement changed nothing on the handset. A field cannot be
 * scrolled clear of the keyboard unless there is somewhere below it to scroll
 * TO, so callers reserve the room on the strength of the cursor being in a
 * field and use the measurement only when it is larger.
 *
 * 320dp is a little over a typical Android keyboard. It lives here rather than
 * on either screen because both need it and they must not drift apart.
 */
export const ANDROID_KEYBOARD_FALLBACK = 320;
