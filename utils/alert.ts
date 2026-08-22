/**
 * Re-entrancy guard around Alert.alert.
 *
 * React Native queues alerts rather than coalescing them: two taps on the same
 * button in the same frame produce two stacked dialogs, and dismissing the
 * first reveals an identical second one. A per-screen `useState` guard does not
 * fix this — state updates are async, so the second tap in a frame still reads
 * the stale `false`. The flag below is module-level and set synchronously, so
 * it blocks the second tap AND blocks a second alert raised from a different
 * screen while one is already up.
 *
 * The flag is cleared when the dialog goes away, which means every exit path
 * has to clear it: each button's onPress (Cancel included), and `onDismiss` on
 * Android, where a dialog can be dismissed by tapping outside or the back
 * button without any button firing.
 */
import { Alert, AlertButton, AlertOptions, Platform } from "react-native";

let alertOpen = false;

/** Test seam. Not used by app code. */
export function __resetAlertGuard() {
  alertOpen = false;
}

/** True while a guarded alert is on screen. */
export function isAlertOpen() {
  return alertOpen;
}

/**
 * Drop-in replacement for Alert.alert that will not stack.
 *
 * Returns true if the dialog was shown, false if one was already up — callers
 * that need to know (e.g. to avoid clearing local state) can branch on it.
 */
export function alertOnce(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): boolean {
  if (alertOpen) return false;
  alertOpen = true;

  const release = () => {
    alertOpen = false;
  };

  // An alert with no buttons gets an implicit "OK" from the platform, which
  // fires no handler we can hook — so supply our own to guarantee the release.
  const guarded: AlertButton[] = (buttons?.length ? buttons : [{ text: "OK" }]).map(
    (button) => ({
      ...button,
      onPress: (value?: string) => {
        release();
        // The cast covers the prompt() overload's string argument; the plain
        // alert case passes undefined and the extra arg is harmless.
        (button.onPress as ((v?: string) => void) | undefined)?.(value);
      },
    }),
  );

  Alert.alert(title, message, guarded, {
    ...options,
    // Android only. iOS alerts cannot be dismissed without a button, so the
    // button handlers above are the complete set of exit paths there.
    ...(Platform.OS === "android"
      ? {
          onDismiss: () => {
            release();
            options?.onDismiss?.();
          },
        }
      : {}),
  });

  return true;
}
