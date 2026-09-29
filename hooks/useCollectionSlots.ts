/**
 * The dates this household could ask to be collected on, and asking.
 *
 * Separate from useInvitations and usePastCollections because it answers a
 * different question at a different rate: an invitation is polled because a
 * van is moving, history changes only when a round ends, and availability
 * changes when an operator publishes a date — days apart, not seconds.
 */
import { useCallback, useEffect, useState } from "react";
import { apiUrl, authenticatedFetch } from "@/utils/api";
import { useAppStore } from "@/store/store";

export type SlotTime = "MORNING" | "AFTERNOON" | "EVENING";

export interface CollectionSlot {
  id: number;
  zoneId: number;
  zoneName: string;
  city: string;
  date: string;
  timeSlot: SlotTime;
  /** How many neighbours have asked. */
  pendingCount: number;
  requestThreshold: number;
  /** This household's own pending request, if it has one. */
  myRequestId: number | null;
  myStatus: string | null;
}

export interface SlotAvailability {
  eligible: boolean;
  /**
   * Why not. Three values the screen must tell apart, because the useful
   * next move differs for each:
   *
   *   "no_pin"      — they can fix it, by dropping a pin. Send them there.
   *   "unavailable" — we could not ask. Offer to try again; promise nothing.
   *   undefined     — eligible, and the list is simply what it is.
   */
  reason?: string;
  slots: CollectionSlot[];
}

const EMPTY: SlotAvailability = { eligible: false, reason: "unavailable", slots: [] };

export async function fetchCollectionSlots(token: string): Promise<SlotAvailability> {
  try {
    const res = await authenticatedFetch(apiUrl("/api/collections/slots"), {
      method: "GET",
      // Verbatim. Both login endpoints issue a token that already reads
      // "Bearer <jwt>", and prefixing another is a 401 that signs the person
      // out with nothing logged.
      headers: { Authorization: token },
    });
    if (!res.ok) return EMPTY;
    const body = (await res.json()) as Partial<SlotAvailability>;
    return {
      eligible: Boolean(body.eligible),
      reason: body.reason,
      slots: body.slots ?? [],
    };
  } catch {
    return EMPTY;
  }
}

export interface SlotActionResult {
  ok: boolean;
  /**
   * What to put in front of the person when it failed.
   *
   * The server's own words, because its refusals are specific and
   * actionable — "you already have a collection booked for that day" is
   * worth reading, and "something went wrong" is not.
   */
  error?: string;
}

async function act(
  token: string,
  path: string,
  method: "POST" | "DELETE",
): Promise<SlotActionResult> {
  try {
    const res = await authenticatedFetch(apiUrl(path), {
      method,
      headers: { Authorization: token },
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? "That didn't go through. Please try again." };
  } catch {
    return { ok: false, error: "You appear to be offline." };
  }
}

export function useCollectionSlots() {
  const token = useAppStore((state) => state.token);
  const [availability, setAvailability] = useState<SlotAvailability>({
    eligible: false,
    slots: [],
  });
  const [hydrated, setHydrated] = useState(false);
  const [busySlotId, setBusySlotId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setHydrated(true);
      return;
    }
    setAvailability(await fetchCollectionSlots(token));
    setHydrated(true);
  }, [token]);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setHydrated(true);
      return;
    }
    fetchCollectionSlots(token).then((next) => {
      if (alive) {
        setAvailability(next);
        setHydrated(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [token]);

  /**
   * Ask for a date, then re-read.
   *
   * Re-read rather than patch the row in place: the server decides both the
   * request id and whether this closed the slot for everyone, and a client
   * that guesses either is a client that can disagree with the van.
   */
  const request = useCallback(
    async (slotId: number): Promise<SlotActionResult> => {
      if (!token) return { ok: false, error: "You must be signed in." };
      setBusySlotId(slotId);
      const result = await act(token, `/api/collections/slots/${slotId}/request`, "POST");
      if (result.ok) await load();
      setBusySlotId(null);
      return result;
    },
    [token, load],
  );

  const withdraw = useCallback(
    async (slotId: number, requestId: number): Promise<SlotActionResult> => {
      if (!token) return { ok: false, error: "You must be signed in." };
      setBusySlotId(slotId);
      const result = await act(
        token,
        `/api/collections/slot-requests/${requestId}`,
        "DELETE",
      );
      if (result.ok) await load();
      setBusySlotId(null);
      return result;
    },
    [token, load],
  );

  return { ...availability, hydrated, busySlotId, request, withdraw, reload: load };
}
