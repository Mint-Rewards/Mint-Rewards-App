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

export interface PastCollectionsResult {
  collections: PastCollection[];
  /** True when the request did not succeed, as opposed to succeeding empty. */
  failed: boolean;
}

/**
 * The household's finished rounds.
 *
 * `failed` exists because the two outcomes are not the same thing and used to
 * render identically. The backend route was deployed one commit behind the app
 * and answered 404; this swallowed it, returned [], and the screen said the
 * household had never had a collection — a confident, wrong answer that took a
 * trace through three services to disbelieve. The backend's own route comment
 * had predicted it: "a household with no history and a backend that cannot
 * reach operations look" alike.
 *
 * A 401 never reaches here — authenticatedFetch treats it as a session expiry
 * and signs the person out — so this is 404s, 5xx and an unreachable network.
 */
export async function fetchPastCollections(token: string): Promise<PastCollectionsResult> {
  try {
    const res = await authenticatedFetch(apiUrl("/api/collections/history"), {
      method: "GET",
      // Verbatim. Both login endpoints issue a token that already reads
      // "Bearer <jwt>", and prefixing another is a 401 that signs the person
      // out with nothing logged — it has happened twice.
      headers: { Authorization: token },
    });
    if (!res.ok) return { collections: [], failed: true };
    const body = (await res.json()) as { collections?: PastCollection[] };
    return { collections: body.collections ?? [], failed: false };
  } catch {
    return { collections: [], failed: true };
  }
}

export function usePastCollections() {
  const token = useAppStore((state) => state.token);
  const [collections, setCollections] = useState<PastCollection[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setHydrated(true);
      return;
    }
    const result = await fetchPastCollections(token);
    setCollections(result.collections);
    setFailed(result.failed);
    setHydrated(true);
  }, [token]);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setHydrated(true);
      return;
    }
    fetchPastCollections(token).then((result) => {
      if (!alive) return;
      setCollections(result.collections);
      setFailed(result.failed);
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  return { collections, hydrated, failed, reload: load };
}
