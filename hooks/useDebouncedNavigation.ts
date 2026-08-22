import { useCallback, useRef } from "react";

/**
 * Leading-edge throttle for navigation.
 *
 * expo-router's `push` has no idea a screen is already being pushed, so N taps
 * on a card in quick succession stack N copies of the destination and the user
 * has to press back N times. Navigation commits within a frame but the
 * transition runs for a few hundred ms, which is the window taps land in.
 *
 * Leading edge, not trailing: the first tap must navigate immediately or the
 * screen feels broken. Subsequent taps inside the window are dropped, not
 * queued.
 */
const NAV_THROTTLE_MS = 600;

export function useDebouncedNavigation(windowMs: number = NAV_THROTTLE_MS) {
  const lastNavigatedAt = useRef(0);

  return useCallback(
    (navigate: () => void) => {
      const now = Date.now();
      if (now - lastNavigatedAt.current < windowMs) return;
      lastNavigatedAt.current = now;
      navigate();
    },
    [windowMs],
  );
}
