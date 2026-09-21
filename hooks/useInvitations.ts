/**
 * The collections this household has been asked about.
 *
 * Kept out of the global store deliberately: an invitation is server truth
 * with a deadline on it, not something the app owns. Holding a stale copy
 * across screens is how someone ends up answering a window that closed an
 * hour ago.
 */
import { useCallback, useEffect, useState } from "react";
import { apiUrl, authenticatedFetch } from "@/utils/api";
import { useAppStore } from "@/store/store";

export interface Invitation {
  collectionId: number;
  name: string;
  scheduledDate: string;
  timeSlot: string;
  responseDeadlineAt: string | null;
  status: "INVITED" | "ACCEPTED" | "DECLINED";
  captainName: string | null;
}

export type AnswerState = Record<number, "sending" | "failed" | undefined>;

/**
 * The fetch on its own, so the mount effect can use it without touching state
 * synchronously. An unreachable server yields an empty list rather than an
 * error: the backend already answers that way, and it is not something a
 * household can act on.
 */
async function fetchInvitations(token: string): Promise<Invitation[]> {
  try {
    const res = await authenticatedFetch(apiUrl("/api/collections/invitations"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    return Array.isArray(body?.invitations) ? body.invitations : [];
  } catch {
    return [];
  }
}


export function useInvitations() {
  const token = useAppStore((state) => state.token);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState<AnswerState>({});

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setInvitations(await fetchInvitations(token));
    setLoading(false);
  }, [token]);

  // Not load(): that sets `loading` synchronously, and a setState in an effect
  // body cascades a render. The first fetch needs no spinner anyway — the
  // screen has plenty else on it — so only manual reloads show one.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetchInvitations(token).then((list) => {
      if (alive) setInvitations(list);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const respond = useCallback(
    async (collectionId: number, response: "ACCEPTED" | "DECLINED") => {
      if (!token) return false;
      setAnswering((prev) => ({ ...prev, [collectionId]: "sending" }));

      // Shown immediately, then reconciled by the reload below. Waiting on a
      // round trip to acknowledge a tap makes the answer feel unrecorded.
      setInvitations((prev) =>
        prev.map((i) => (i.collectionId === collectionId ? { ...i, status: response } : i)),
      );

      try {
        const res = await authenticatedFetch(
          apiUrl(`/api/collections/${collectionId}/respond`),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ response }),
          },
        );
        if (!res.ok) throw new Error(String(res.status));
        setAnswering((prev) => ({ ...prev, [collectionId]: undefined }));
        await load();
        return true;
      } catch {
        setAnswering((prev) => ({ ...prev, [collectionId]: "failed" }));
        // Put the optimistic change back: the window may have closed, and
        // leaving it showing "Accepted" would be a lie the household acts on.
        await load();
        return false;
      }
    },
    [token, load],
  );

  return { invitations, loading, answering, respond, reload: load };
}
