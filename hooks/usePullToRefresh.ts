/**
 * The pull-to-refresh plumbing, once.
 *
 * Every screen needs the same three lines — a flag, an async call, release
 * the flag — and the one that matters is the release. A reload that throws
 * and leaves the spinner turning looks like a screen still trying when it has
 * already given up, which is worse than not offering the gesture at all.
 *
 * `refresh` is called on every pull, including while one is already in
 * flight: the guard is deliberate rather than absent. A person pulling again
 * is asking again, usually because the first one appeared to do nothing.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function usePullToRefresh(refresh: () => unknown): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);
  // Survives unmount-during-refresh: setting state on a gone component is a
  // warning in development and a leak in the making.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      try {
        await refresh();
      } catch {
        // Swallowed on purpose. Each screen already renders its own failure
        // state; a pull must never be the thing that crashes the tab.
      } finally {
        if (alive.current) setRefreshing(false);
      }
    })();
  }, [refresh]);

  return { refreshing, onRefresh };
}
