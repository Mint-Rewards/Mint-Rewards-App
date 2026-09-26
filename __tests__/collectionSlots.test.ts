/// <reference types="jest" />

/**
 * Asking to be collected, from the app's side.
 *
 * The hook is where the app's honesty about this feature lives. Three states
 * look alike on a phone and mean entirely different things, and the screen
 * offers a different next move for each: this household cannot be routed to,
 * we could not reach the service, and there are genuinely no dates open.
 * Collapsing any two of them is how someone ends up waiting for a van that
 * was never going to come.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// config/env validates the real app configuration at import time and reads
// expo-constants, which needs a native module this process does not have.
// store/store.ts reaches it transitively, and the hook reaches the store.
jest.mock("@/config/env", () => ({
  API_BASE_URL: "https://api.test.invalid",
  ENV: { apiUrl: "https://api.test.invalid" },
  IS_DEV: false,
}));
jest.mock("@/store/store", () => ({ useAppStore: () => null }));

const mockFetch = jest.fn<() => Promise<unknown>>();
jest.mock("@/utils/api", () => ({
  apiUrl: (p: string) => `https://api.test.invalid${p}`,
  authenticatedFetch: (...args: unknown[]) => mockFetch(...(args as [])),
}));

const { fetchCollectionSlots } = require("@/hooks/useCollectionSlots");

const SLOT = {
  id: 7,
  zoneId: 3,
  zoneName: "Gulshan",
  city: "Karachi",
  date: "2026-10-06",
  timeSlot: "AFTERNOON",
  pendingCount: 4,
  requestThreshold: 20,
  myRequestId: null,
  myStatus: null,
};

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  mockFetch.mockReset();
});

describe("reading what dates are open", () => {
  it("sends the stored token verbatim", async () => {
    /*
     * Both login endpoints issue a token that already reads "Bearer <jwt>".
     * Prefixing another produces "Bearer Bearer <jwt>", which the backend
     * splits on the space and fails to verify — a 401 that signs the person
     * out with nothing logged. It has happened twice.
     */
    mockFetch.mockResolvedValue(ok({ eligible: true, slots: [] }) as never);
    await fetchCollectionSlots("Bearer abc.def");
    const [, init] = mockFetch.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers.Authorization).toBe("Bearer abc.def");
  });

  it("returns the dates as given", async () => {
    mockFetch.mockResolvedValue(ok({ eligible: true, slots: [SLOT] }) as never);
    const result = await fetchCollectionSlots("t");
    expect(result.eligible).toBe(true);
    expect(result.slots).toHaveLength(1);
  });

  it("keeps the reason a household cannot book", async () => {
    // The screen's only useful move for "no_pin" is to send them to the map,
    // so the reason has to survive the trip.
    mockFetch.mockResolvedValue(
      ok({ eligible: false, reason: "no_pin", slots: [] }) as never,
    );
    const result = await fetchCollectionSlots("t");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("no_pin");
  });

  it("does not report 'no dates' when the request failed", async () => {
    /*
     * `eligible: true` with an empty list is a claim: nothing is available
     * in your area. A failed request cannot support it, and the screen must
     * be able to say the different, truthful thing instead.
     */
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as never);
    const result = await fetchCollectionSlots("t");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("unavailable");
  });

  it("survives an offline phone", async () => {
    mockFetch.mockRejectedValue(new Error("Network request failed") as never);
    const result = await fetchCollectionSlots("t");
    expect(result).toEqual({ eligible: false, reason: "unavailable", slots: [] });
  });

  it("tolerates a body with no slots array", async () => {
    // A backend one deploy behind, or a proxy that answered oddly. An
    // undefined .map() here would blank the screen with a red box.
    mockFetch.mockResolvedValue(ok({ eligible: true }) as never);
    expect((await fetchCollectionSlots("t")).slots).toEqual([]);
  });
});

/**
 * The screen's promises, checked at the source level.
 *
 * Nothing here may tell a household a van is coming. Operations decides that
 * when it commits a captain, and this screen runs before that decision — so
 * the word "confirmed" describing a REQUEST would be the easiest and most
 * damaging lie available to it.
 */
describe("what the booking screen promises", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("does not call a request a confirmed collection", () => {
    const src = read("app/bookCollection.tsx");
    expect(src).toMatch(/We&apos;ll\s*\n?\s*confirm once a collection is arranged/);
    expect(src).not.toMatch(/Collection confirmed|Your collection is booked/i);
  });

  it("sends a household with no pin to set one", () => {
    const src = read("app/bookCollection.tsx");
    expect(src).toMatch(/reason === "no_pin"/);
    expect(src).toMatch(/pathname: "\/editProfile", params: \{ focus: "pin" \}/);
  });

  it("offers a retry, not a location fix, when the service is down", () => {
    /*
     * Sending someone to correct an address that was never wrong is worse
     * than saying nothing: they change a good pin and still get no dates.
     */
    const src = read("app/bookCollection.tsx");
    expect(src).toMatch(/Couldn&apos;t load dates/);
    expect(src).toMatch(/Try again/);
  });

  it("leaves the native header off, for every screen and not one by one", () => {
    /*
     * Each screen draws its own Navbar, so a native header on top of it is
     * two headers with the route's FILENAME printed across the second —
     * which is how bookCollection shipped. It was opt-out, one line per
     * route, and the new route had no line. A default that must be repeated
     * is a default the next screen forgets too.
     */
    const layout = read("app/_layout.tsx");
    expect(layout).toMatch(/<Stack[^>]*screenOptions=\{\{ headerShown: false \}\}/);
    // And the one screen that asks for it back does so from its own file.
    expect(read("app/+not-found.tsx")).toMatch(/headerShown: true/);
  });

  it("only offers the entry point to a complete profile", () => {
    // The user's rule, and not cosmetic: a household we cannot route to
    // cannot be collected from, so the choice would be undeliverable.
    const src = read("app/(tabs)/home.tsx");
    expect(src).toMatch(/\{profileComplete && \(/);
    expect(src).toMatch(/testID="book-collection-card"/);
  });
});
