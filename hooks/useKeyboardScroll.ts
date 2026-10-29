/**
 * Scrolling the focused control clear of the keyboard, which on Android
 * nothing else does.
 *
 * `KeyboardAvoidingView` is given no `behavior` on Android throughout this
 * app — there `padding` fights the system's own windowSoftInputMode and
 * `height` collapses the layout — so on Android it is inert, and any control
 * low in a long form sits under the keyboard. QA reported Confirm PIN on
 * sign-up, which is simply the lowest control on that tab; the cause is not
 * specific to it, and every field below the fold has the same problem.
 *
 * The remedy is to measure where the control is and scroll it into view.
 * `app/editProfile.tsx` solved it first; this is the same approach, shared, so
 * the auth screens cannot drift from each other.
 *
 * Everything is optional-chained and the failure callback is a no-op: a
 * measurement that cannot be taken must leave the user on a usable form, never
 * break the screen.
 */
import { useRef } from "react";
import type { ScrollView, TextInput, View } from "react-native";

/** How much of the control to leave visible above the keyboard. */
const SCROLL_MARGIN = 90;
/** Long enough for the keyboard to start animating and the layout to settle. */
const SETTLE_MS = 120;

export function useKeyboardScroll() {
  const scrollRef = useRef<ScrollView>(null);
  /**
   * The container every control is measured against. The ScrollView's own
   * content container takes no ref, so the content carries one.
   */
  const contentRef = useRef<View>(null);

  const scrollIntoView = (
    anchor: React.RefObject<View | TextInput | null>,
  ) => {
    setTimeout(() => {
      const target = anchor.current;
      const content = contentRef.current;
      if (!target || !content) return;
      target.measureLayout(
        content,
        (_x, y) =>
          scrollRef.current?.scrollTo({
            y: Math.max(0, y - SCROLL_MARGIN),
            animated: true,
          }),
        () => {},
      );
    }, SETTLE_MS);
  };

  return { scrollRef, contentRef, scrollIntoView };
}

export default useKeyboardScroll;
