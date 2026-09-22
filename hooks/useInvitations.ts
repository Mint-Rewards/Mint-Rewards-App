/**
 * The collections this household has been asked about.
 *
 * Kept out of the global store deliberately: an invitation is server truth
 * with a deadline on it, not something the app owns. Holding a stale copy
 * across screens is how someone ends up answering a window that closed an
 * hour ago.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
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
  /** The collection's own status, for telling "confirmed" from "on the way". */
  collectionStatus: "CONFIRMING" | "READY" | "IN_PROGRESS";
  /**
   * What this row may offer, decided by the server.
   *
   * Whether an answer can still be recorded is a fact about the collection's
   * window, not something to re-derive from a status pair — two clients doing
   * that arithmetic is how they come to disagree, and the losing side offers a
   * button that 409s.
   */
  state: "answerable" | "confirmed" | "declined";
  startedAt: string | null;
}

export type AnswerState = Record<number, "sending" | "failed" | undefined>;

/**
 * The fetch on its own, so the mount effect can use it without touching state
 * synchronously. An unreachable server yields an empty list rather than an
 * error: the backend already answers that way, and it is not something a
 * household can act on.
 */
export async function fetchInvitations(token: string): Promise<Invitation[]> {
  try {
    const res = await authenticatedFetch(apiUrl("/api/collections/invitations"), {
      // Verbatim. The store's token already reads "Bearer <jwt>" — both login
      // endpoints issue it that way — so prefixing again sends
      // "Bearer Bearer <jwt>", which 401s and, through authenticatedFetch,
      // signs the person out. Every other caller in the app sends it as-is.
      headers: { Authorization: token },
    });
    const body = await res.json();
    return Array.isArray(body?.invitations) ? body.invitations : [];
  } catch {
    return [];
  }
}


/**
 * Answering one invitation.
 *
 * Separate from the hook so the header it sends can be asserted directly.
 * Both of this file's calls once prefixed a second "Bearer" onto a token that
 * already carried one, which 401s and signs the person out — a failure with
 * no error to read, only an empty screen.
 */
export async function sendInvitationResponse(
  token: string,
  collectionId: number,
  response: "ACCEPTED" | "DECLINED",
): Promise<Response> {
  return authenticatedFetch(
    apiUrl(`/api/collections/${collectionId}/respond`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ response }),
    },
  );
}

export function useInvitations() {
  const token = useAppStore((state) => state.token);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  /**
   * Whether the first fetch has come back.
   *
   * Not `loading`, which stays false on that first fetch by design. A screen
   * cannot say "no collections" before it has asked, and with nothing to
   * distinguish "none" from "not yet" it says it anyway — which is what a
   * household sees at the exact moment they tap a notification telling them
   * otherwise.
   */
  const [hydrated, setHydrated] = useState(false);
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
    // Nobody to ask about, so the answer is already known: a spinner that
    // waits for a fetch which will never be made never stops.
    if (!token) {
      setHydrated(true);
      return;
    }
    let alive = true;
    fetchInvitations(token).then((list) => {
      if (!alive) return;
      setInvitations(list);
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  /**
   * Again whenever this screen is looked at.
   *
   * The tab stays mounted, so the mount fetch above runs once per session —
   * and an invitation that arrives after it is one the screen never learns
   * about. A household was invited, tapped the notification, was taken to a
   * collections screen that had already decided it was empty, and only saw
   * the invitation after a full reload of the bundle.
   *
   * Skipped on the first focus, which is the same render the mount fetch is
   * already in flight for.
   */
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      let alive = true;
      fetchInvitations(token).then((list) => {
        if (alive) setInvitations(list);
      });
      return () => {
        alive = false;
      };
    }, [token]),
  );

  /**
   * And on the way back from the background.
   *
   * A push arrives, the household opens the app from the notification, and
   * the collections tab is already the focused screen — so nothing re-runs.
   * Coming back to the foreground is the one signal that covers it.
   */
  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        fetchInvitations(token).then(setInvitations);
      }
    });
    return () => sub.remove();
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
        const res = await sendInvitationResponse(token, collectionId, response);
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

  return { invitations, hydrated, loading, answering, respond, reload: load };
}
