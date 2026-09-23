/**
 * Rounds this household has already been through.
 *
 * Separate from useInvitations because the two answer different questions and
 * change at different rates: an invitation has a deadline on it and is polled,
 * while history only changes when a round ends. Folding them into one hook
 * would mean refetching a year of history every two seconds to watch a van.
 */
import { useCallback, useEffect, useState } from "react";
import { apiUrl, authenticatedFetch } from "@/utils/api";
import { useAppStore } from "@/store/store";

export interface PastCollection {
  collectionId: number;
  name: string;
  scheduledDate: string;
  timeSlot: string;
  collectionStatus: string;
  status: string;
  /**
   * What happened to THIS household, decided by the server.
   *
   * Not the same as what happened to the collection: a completed round still
   * has doors nobody answered, and a household that declined has a history
   * entry too. Re-deriving it here from a status pair is how two clients come
   * to disagree about the same evening.
   */
  outcome: "collected" | "missed" | "declined" | "cancelled" | "not_collected";
  weightKg: number;
  noCollectionReason: string | null;
  resolvedAt: string | null;
  captainName: string | null;
  captainAvatar: string | null;
}

export async function fetchPastCollections(token: string): Promise<PastCollection[]> {
  try {
    const res = await authenticatedFetch(apiUrl("/api/collections/history"), {
      method: "GET",
      // Verbatim. Both login endpoints issue a token that already reads
      // "Bearer <jwt>", and prefixing another is a 401 that signs the person
      // out with nothing logged — it has happened twice.
      headers: { Authorization: token },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { collections?: PastCollection[] };
    return body.collections ?? [];
  } catch {
    // An unreachable server yields an empty history rather than an error:
    // the backend already answers that way, and it is not something the
    // person can act on.
    return [];
  }
}

export function usePastCollections() {
  const token = useAppStore((state) => state.token);
  const [collections, setCollections] = useState<PastCollection[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setHydrated(true);
      return;
    }
    setCollections(await fetchPastCollections(token));
    setHydrated(true);
  }, [token]);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setHydrated(true);
      return;
    }
    fetchPastCollections(token).then((rows) => {
      if (!alive) return;
      setCollections(rows);
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  return { collections, hydrated, reload: load };
}
