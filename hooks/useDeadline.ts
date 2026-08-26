/**
 * Milliseconds remaining until an absolute deadline, re-derived on a tick.
 *
 * Distinct from hooks/useCountdown, which counts DOWN FROM A SECONDS VALUE held
 * in state. That is right for a resend cooldown — a short span, started by a tap,
 * meaningless if the screen goes away — and wrong here for two reasons:
 *
 *   1. It does not survive backgrounding. `setInterval` is throttled or stopped
 *      while the app is backgrounded, so a decrementing counter drifts behind
 *      wall-clock time; a user who backgrounds the app for an hour would come
 *      back to a countdown claiming an hour it has already lost. Re-deriving
 *      from `Date.now()` each tick is always correct on return, however long the
 *      gap and however unreliable the timer.
 *   2. It does not survive a remount. This modal mounts and unmounts as the user
 *      moves on and off Home; a deadline is a fact about the user's window, not
 *      about how long this component has been alive.
 *
 * Ticks once a minute, not once a second, matching what `formatTimeLeft`
 * actually renders — a per-second re-render of a sheet that displays whole
 * minutes is pure waste. The first tick is scheduled to land on the next minute
 * boundary so the displayed value never sits a full minute stale.
 */

import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

export function useDeadline(expiresAt: number | null): number {
  // The CLOCK is the state, and the remaining time is derived from it during
  // render. Holding `msLeft` itself would mean seeding and re-seeding it from
  // an effect on every change of `expiresAt` — a synchronous setState in an
  // effect body, which cascades a second render and which the react-hooks lint
  // rejects (correctly; the same note appears in components/LocationGate.tsx).
  // Here setState happens only inside a timer callback, which is the sanctioned
  // "subscribe to an external system" shape, and the derived value is always
  // correct on the render where `expiresAt` changes.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) return;

    // Re-read from the clock, never decremented — see the note above on
    // backgrounding.
    const tick = () => setNow(Date.now());

    let interval: ReturnType<typeof setInterval> | undefined;
    // Align to the next whole minute so the label changes when the minute
    // changes, rather than at a fixed offset into it.
    const align = setTimeout(
      () => {
        tick();
        interval = setInterval(tick, MINUTE_MS);
      },
      Math.max(0, MINUTE_MS - (Date.now() % MINUTE_MS)),
    );

    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, [expiresAt]);

  if (expiresAt === null) return 0;
  return Math.max(0, expiresAt - now);
}
