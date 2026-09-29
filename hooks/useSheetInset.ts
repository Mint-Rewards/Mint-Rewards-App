/**
 * How far a bottom sheet has to sit above the bottom of the screen.
 *
 * Edge-to-edge (Expo SDK 56, Android) means "the bottom of the screen" is
 * underneath the ||| O < row, so a sheet anchored with `justifyContent:
 * "flex-end"` puts its last control — usually a Close or Cancel — directly
 * against the system controls. It is reachable, but it reads as a mis-drawn
 * screen, and a mistap dismisses the app instead of the sheet.
 *
 * A hook rather than six copies of `insets.bottom + 12`, because there are six
 * bottom sheets and they were all wrong in the same way. The next one gets it
 * by asking.
 *
 * iOS returns the home-indicator inset here for the same reason, which is what
 * a sheet wants anyway.
 */
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Clear space below the last control, on top of the system inset.
 *
 * Not zero even on a handset with no gesture bar: a button flush against the
 * bottom edge of the glass looks clipped whether or not anything is drawn
 * there.
 */
export const SHEET_BREATHING_ROOM = 12;

export function useSheetInset(extra: number = SHEET_BREATHING_ROOM): number {
  return useSafeAreaInsets().bottom + extra;
}
