import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an async handler at most once at a time.
 *
 * The latch is a ref, not state, because the two taps we are guarding against
 * land in the same frame: a state update has not been applied by the time the
 * second tap reads it, so a `useState` guard lets it through. The ref is set
 * synchronously on the first call, which is the whole point.
 *
 * `inFlight` is returned as state purely so callers can drive `disabled` /
 * spinners — it is never read for the guard decision itself.
 */
export function useSingleFlight<A extends unknown[]>(
  handler: (...args: A) => void | Promise<void>,
): { run: (...args: A) => void; inFlight: boolean } {
  const latch = useRef(false);
  const [inFlight, setInFlight] = useState(false);
  // Avoids tearing down and rebuilding `run` whenever the caller passes a new
  // inline closure, which would otherwise defeat memoisation downstream.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback((...args: A) => {
    if (latch.current) return;
    latch.current = true;
    setInFlight(true);

    const finish = () => {
      latch.current = false;
      // The handler routinely navigates away or signs the user out, so the
      // component is often gone by the time it resolves. Setting state then
      // would warn for no benefit.
      if (mounted.current) setInFlight(false);
    };

    let result: void | Promise<void>;
    try {
      result = handlerRef.current(...args);
    } catch (error) {
      finish();
      throw error;
    }

    if (result && typeof (result as Promise<void>).then === "function") {
      // Swallowed deliberately, not carelessly: rethrowing from inside this
      // rejection handler produces an unhandled promise rejection, because the
      // promise we would be rejecting is one nobody holds a reference to. The
      // wrapped handlers all surface their own failures to the user; the only
      // thing left to do here is release the latch so the action is retryable,
      // and leave a trace for the console.
      (result as Promise<void>).then(finish, (error) => {
        finish();
        console.error("[useSingleFlight] handler rejected:", error);
      });
    } else {
      finish();
    }
  }, []);

  return { run, inFlight };
}
