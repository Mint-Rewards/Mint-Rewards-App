/**
 * What this household has been told.
 *
 * Server truth, fetched per screen rather than held in the store: the unread
 * count changes from outside the app — a push arrives, another device reads
 * it — and a cached copy would show a badge for something already seen.
 */
import { useCallback, useEffect, useState } from "react";
import { apiUrl, authenticatedFetch } from "@/utils/api";
import { useAppStore } from "@/store/store";
import { onForegroundMessage } from "@/utils/push";

export interface InboxItem {
  id: number;
  event: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: string;
  readAt: string | null;
}

interface Page {
  notifications: InboxItem[];
  unread: number;
  nextBefore: number | null;
}

const EMPTY: Page = { notifications: [], unread: 0, nextBefore: null };

async function fetchPage(token: string, before?: number): Promise<Page> {
  try {
    const query = before ? `?before=${before}` : "";
    const res = await authenticatedFetch(apiUrl(`/api/notifications${query}`), {
      headers: { Authorization: token },
    });
    const body = await res.json();
    return {
      notifications: Array.isArray(body?.notifications) ? body.notifications : [],
      unread: typeof body?.unread === "number" ? body.unread : 0,
      nextBefore: typeof body?.nextBefore === "number" ? body.nextBefore : null,
    };
  } catch {
    // The backend already answers with an empty inbox when operations is
    // unreachable; this covers the network never getting there at all.
    return EMPTY;
  }
}

export function useNotifications() {
  const token = useAppStore((state) => state.token);
  const [page, setPage] = useState<Page>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetchPage(token).then((next) => {
      if (alive) setPage(next);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  /**
   * A notification arriving while this screen is open.
   *
   * Without it the banner appears and the list beneath it does not change,
   * which reads as the app having missed the very thing it just showed you.
   *
   * Refetched silently — no spinner. The person did not ask for a refresh and
   * a control appearing on its own is noise.
   */
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const unsubscribe = onForegroundMessage(() => {
      fetchPage(token).then((next) => {
        if (alive) setPage(next);
      });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setPage(await fetchPage(token));
    setLoading(false);
  }, [token]);

  /**
   * Appends the next page. Cursor-based, so rows arriving at the top while
   * someone is reading do not shift the page boundary and cause a repeat.
   */
  const loadMore = useCallback(async () => {
    if (!token || !page.nextBefore || loadingMore) return;
    setLoadingMore(true);
    const next = await fetchPage(token, page.nextBefore);
    setPage((prev) => ({
      notifications: [...prev.notifications, ...next.notifications],
      unread: next.unread,
      nextBefore: next.nextBefore,
    }));
    setLoadingMore(false);
  }, [token, page.nextBefore, loadingMore]);

  /**
   * Clears the badge.
   *
   * Applied locally first: the round trip is not worth a badge that lingers
   * after someone has plainly read the screen. If the call fails the next
   * load corrects it, which is why nothing here reports an error.
   */
  const markAllRead = useCallback(async () => {
    if (!token || page.unread === 0) return;
    const now = new Date().toISOString();
    setPage((prev) => ({
      ...prev,
      unread: 0,
      notifications: prev.notifications.map((n) => ({ ...n, readAt: n.readAt ?? now })),
    }));
    try {
      await authenticatedFetch(apiUrl("/api/notifications/read"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({}),
      });
    } catch {
      // The badge corrects itself on the next load.
    }
  }, [token, page.unread]);

  return {
    notifications: page.notifications,
    unread: page.unread,
    hasMore: page.nextBefore !== null,
    loading,
    loadingMore,
    refresh,
    loadMore,
    markAllRead,
  };
}
