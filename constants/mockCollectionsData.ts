/**
 * Demo-only mock data for the past-pickups / upcoming-collections experience.
 *
 * This module is the single source of truth for every number shown on
 * app/collections.tsx, app/(tabs)/profile.tsx and app/(tabs)/home.tsx for
 * allowlisted demo accounts (see constants/demoAccounts.ts). Screens must
 * read the derived totals from here rather than computing their own, so the
 * figures agree by construction.
 *
 * Nothing here is fetched. The shapes deliberately mirror the pickupHistory /
 * Collection documents so a future real data source can be swapped in with
 * minimal churn at the call sites.
 *
 * Location is NOT part of the stored data: every pickup and collection is
 * placed in the viewing user's own town/city via withUserLocation(), so a
 * demo account in Lahore never sees history in Karachi. The row code shown to
 * the user is city-derived for the same reason (KHI-122 vs LHE-122). Read the
 * arrays through pastPickupsForUser() / upcomingCollectionsForUser() — the raw
 * templates carry no area, city or code.
 */

import type { User } from "@/store/store";

export type MockPickupStatus = "COMPLETED" | "PENDING";

export interface MockPickupBag {
  qrCode: string;
  weightKg: number;
}

/**
 * Where a pickup/collection happened, taken from the viewing user's profile.
 * Undefined when that user has no city set — the UI hides the location line
 * rather than inventing one.
 */
export interface DemoUserLocation {
  area: string;
  city: string;
}

export interface MockPastPickup {
  id: string;
  /**
   * The row's user-facing identifier, e.g. "KHI-122". Derived, not stored: the
   * CITYCODE prefix comes from the viewing user's own city, so the same
   * template reads KHI-122 in Karachi and LHE-122 in Lahore.
   */
  code: string;
  area?: string;
  city?: string;
  /** ISO-8601 date (YYYY-MM-DD). */
  date: string;
  status: MockPickupStatus;
  bags: MockPickupBag[];
  comment?: string;
}

/**
 * Stored form of a pickup: no location, and only the numeric half of the code.
 * The city prefix cannot live here because it depends on who is looking.
 */
type MockPastPickupTemplate = Omit<MockPastPickup, "area" | "city" | "code"> & {
  codeNumber: number;
};

/** One day/time a user can pick when joining an upcoming collection. */
export interface MockCollectionSlot {
  id: string;
  /** ISO-8601 date (YYYY-MM-DD). */
  date: string;
  /** Human-readable window, e.g. "9:00 – 11:00 AM". */
  time: string;
}

export interface MockUpcomingCollection {
  id: string;
  /** User-facing identifier, e.g. "KHI-122". Derived — see MockPastPickup.code. */
  code: string;
  area?: string;
  city?: string;
  /** Selectable day/time options — the user picks one before joining. */
  slots: MockCollectionSlot[];
}

/** Stored form of a collection — see MockPastPickupTemplate. */
type MockUpcomingCollectionTemplate = Omit<
  MockUpcomingCollection,
  "area" | "city" | "code"
> & { codeNumber: number };

/**
 * Location-free templates. Everything except area/city and the display code
 * lives here.
 *
 * Ids are ObjectId-shaped because that is what the real documents carry. They
 * are never shown to the user: rows display the derived CITYCODE-### code
 * instead — see formatRowCode().
 */
export const MOCK_PAST_PICKUPS: MockPastPickupTemplate[] = [
  {
    id: "6612a4f09c1d4b0a83e5f101",
    codeNumber: 101,
    date: "2026-05-09",
    status: "COMPLETED",
    bags: [
      { qrCode: "MR-8F21A4", weightKg: 3.4 },
      { qrCode: "MR-8F21A5", weightKg: 2.1 },
    ],
    comment: "Left at the gate as agreed with the guard.",
  },
  {
    id: "6612a4f09c1d4b0a83e5f2b7",
    codeNumber: 102,
    date: "2026-05-23",
    status: "COMPLETED",
    bags: [{ qrCode: "MR-91C0B7", weightKg: 5.8 }],
  },
  {
    id: "6619bd137e2a4c0f91d3a519",
    codeNumber: 103,
    date: "2026-06-04",
    status: "COMPLETED",
    bags: [
      { qrCode: "MR-A3D519", weightKg: 4.2 },
      { qrCode: "MR-A3D520", weightKg: 1.6 },
      { qrCode: "MR-A3D521", weightKg: 2.9 },
    ],
    comment: "Mostly PET bottles this time.",
  },
  {
    id: "6624c8215f3b4e1d70a2e244",
    codeNumber: 104,
    date: "2026-06-18",
    status: "COMPLETED",
    bags: [{ qrCode: "MR-B7E244", weightKg: 3.0 }],
  },
  {
    id: "6633e0782d9f41c5b80a4101",
    codeNumber: 106,
    date: "2026-07-05",
    status: "COMPLETED",
    bags: [
      { qrCode: "MR-D4A101", weightKg: 6.3 },
      { qrCode: "MR-D4A102", weightKg: 1.2 },
    ],
  },
  {
    id: "663bf1935c6d48ea27b3b776",
    codeNumber: 107,
    date: "2026-07-14",
    status: "COMPLETED",
    bags: [
      { qrCode: "MR-E8B776", weightKg: 2.7 },
      { qrCode: "MR-E8B777", weightKg: 3.9 },
    ],
    comment: "Cardboard flattened before handover.",
  },
  {
    id: "6643028a1b7e4d93c5f2c388",
    codeNumber: 108,
    date: "2026-07-21",
    status: "COMPLETED",
    bags: [{ qrCode: "MR-F2C388", weightKg: 4.6 }],
  },
  {
    id: "66490fb63e8a4f17d90d4e92",
    codeNumber: 109,
    date: "2026-07-27",
    status: "PENDING",
    bags: [{ qrCode: "MR-0D4E92", weightKg: 3.1 }],
  },
];

/** Location-free templates. Everything except area/city lives here. */
export const MOCK_UPCOMING_COLLECTIONS: MockUpcomingCollectionTemplate[] = [
  {
    id: "6651a7c48d2b4e6f01a9c110",
    codeNumber: 121,
    slots: [
      {
        id: "6651a7c48d2b4e6f01a9c111",
        date: "2026-08-08",
        time: "9:00 – 11:00 AM",
      },
      {
        id: "6651a7c48d2b4e6f01a9c112",
        date: "2026-08-09",
        time: "10:00 AM – 12:00 PM",
      },
    ],
  },
  {
    id: "6658b3e05a7c4d1982f4d220",
    codeNumber: 122,
    slots: [
      {
        id: "6658b3e05a7c4d1982f4d221",
        date: "2026-08-15",
        time: "8:30 – 10:30 AM",
      },
      {
        id: "6658b3e05a7c4d1982f4d222",
        date: "2026-08-15",
        time: "4:00 – 6:00 PM",
      },
      {
        id: "6658b3e05a7c4d1982f4d223",
        date: "2026-08-16",
        time: "9:00 – 11:00 AM",
      },
    ],
  },
  {
    id: "6660c5194f9a4b3d67e8a330",
    codeNumber: 123,
    slots: [
      {
        id: "6660c5194f9a4b3d67e8a331",
        date: "2026-08-22",
        time: "9:00 – 11:00 AM",
      },
      {
        id: "6660c5194f9a4b3d67e8a332",
        date: "2026-08-23",
        time: "3:00 – 5:00 PM",
      },
    ],
  },
];

/**
 * The viewing user's own location, or null when their profile has no city.
 * No fallback city is substituted — a blank here is a profile data gap.
 */
export function resolveDemoUserLocation(
  user: User | null | undefined,
): DemoUserLocation | null {
  const city = user?.city?.trim();
  const area = user?.town?.trim() || city;
  if (!city || !area) return null;
  return { area, city };
}

/** Places one mock item in the viewing user's own town/city. */
export function withUserLocation<T extends object>(
  item: T,
  user: User | null | undefined,
): T & Partial<DemoUserLocation> {
  const location = resolveDemoUserLocation(user);
  return location ? { ...item, ...location } : item;
}

/**
 * Airport-style prefixes for the cities demo accounts sit in. Keys are
 * lowercased city names as they arrive from the profile.
 */
const CITY_CODES: Record<string, string> = {
  karachi: "KHI",
  lahore: "LHE",
  islamabad: "ISB",
  rawalpindi: "RWP",
  faisalabad: "FSD",
  multan: "MUX",
  peshawar: "PEW",
  quetta: "UET",
  hyderabad: "HDD",
  sialkot: "SKT",
};

/**
 * Used when the profile has no city at all. Unlike the location line, a code
 * cannot simply be hidden — it is the row's only identifier — so an unresolved
 * city degrades to a neutral prefix rather than a blank.
 */
const FALLBACK_CITY_CODE = "MNT";

/**
 * "Karachi" -> "KHI". Cities outside CITY_CODES fall back to their first three
 * letters ("Sahiwal" -> "SAH"), which keeps codes stable and readable without
 * needing an entry for every city in the country.
 */
export function cityCode(city: string | null | undefined): string {
  const key = city?.trim().toLowerCase();
  if (!key) return FALLBACK_CITY_CODE;
  if (CITY_CODES[key]) return CITY_CODES[key];
  const letters = key.replace(/[^a-z]/g, "");
  return letters ? letters.slice(0, 3).toUpperCase() : FALLBACK_CITY_CODE;
}

/** "KHI-122" — the code shown on every pickup and collection row. */
export function formatRowCode(
  codeNumber: number,
  city: string | null | undefined,
): string {
  return `${cityCode(city)}-${codeNumber}`;
}

/** PENDING pickups sort ahead of COMPLETED ones — they still need attention. */
function pickupStatusRank(status: MockPickupStatus): number {
  return status === "PENDING" ? 0 : 1;
}

/**
 * Past pickups: PENDING first, then most recent first within each status. The
 * order is established here rather than assumed of MOCK_PAST_PICKUPS, so
 * reordering or appending to that array — or swapping in a real data source
 * with its own ordering — cannot change what the screens show. Dates are
 * ISO-8601, so a string compare sorts them; the id tiebreak keeps same-day
 * pickups in a stable order.
 */
export function pastPickupsForUser(user: User | null | undefined): MockPastPickup[] {
  const city = resolveDemoUserLocation(user)?.city;
  return MOCK_PAST_PICKUPS.map(({ codeNumber, ...pickup }) => ({
    ...withUserLocation(pickup, user),
    code: formatRowCode(codeNumber, city),
  })).sort(
    (a, b) =>
      pickupStatusRank(a.status) - pickupStatusRank(b.status) ||
      b.date.localeCompare(a.date) ||
      b.id.localeCompare(a.id),
  );
}

export function upcomingCollectionsForUser(
  user: User | null | undefined,
): MockUpcomingCollection[] {
  const city = resolveDemoUserLocation(user)?.city;
  return MOCK_UPCOMING_COLLECTIONS.map(({ codeNumber, ...collection }) => ({
    ...withUserLocation(collection, user),
    code: formatRowCode(codeNumber, city),
  }));
}

/** The soonest slot on a collection — what the home teaser counts down to. */
export function earliestCollectionSlot(
  collection: Pick<MockUpcomingCollection, "slots">,
): MockCollectionSlot | undefined {
  return [...collection.slots].sort((a, b) => a.date.localeCompare(b.date))[0];
}

/**
 * Status of an upcoming collection for the current session. "pending" is the
 * internal value once the user has joined a slot; other logic may key off it,
 * so it is never renamed — only its rendered label differs (see
 * upcomingStatusLabel).
 */
export type MockUpcomingStatus = "open" | "pending";

/**
 * User-facing label for an upcoming collection's status. A joined collection
 * reads as "Scheduled" — the user picked a future slot, which is a different
 * thing from a past pickup's "Processing" (collected, awaiting confirmation),
 * so that label is deliberately not shared with MOCK_PAST_PICKUPS.
 */
export function upcomingStatusLabel(status: MockUpcomingStatus): string {
  return status === "pending" ? "Scheduled" : "Open";
}

/**
 * User-facing label for a past pickup's status. PENDING reads as "Processing":
 * the waste is collected and awaiting confirmation/weighing. As with
 * upcomingStatusLabel this is display-only — the stored value stays "PENDING",
 * which is what pickupStatusRank and the COMPLETED-only totals key off.
 */
export function pickupStatusLabel(status: MockPickupStatus): string {
  return status === "COMPLETED" ? "Completed" : "Processing";
}

/** Total weight of a single pickup, in kg. */
export function pickupWeightKg(pickup: MockPastPickup): number {
  return round1(pickup.bags.reduce((sum, bag) => sum + bag.weightKg, 0));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const COMPLETED_PICKUPS = MOCK_PAST_PICKUPS.filter(
  (pickup) => pickup.status === "COMPLETED",
);

/** Sum of all bag weights across COMPLETED pickups only. */
export const TOTAL_WASTE_KG: number = round1(
  COMPLETED_PICKUPS.reduce(
    (sum, pickup) => sum + pickup.bags.reduce((s, bag) => s + bag.weightKg, 0),
    0,
  ),
);

export const PICKUPS_COMPLETED_COUNT: number = COMPLETED_PICKUPS.length;

export const TOTAL_BAGS_COUNT: number = MOCK_PAST_PICKUPS.reduce(
  (sum, pickup) => sum + pickup.bags.length,
  0,
);

export const UPCOMING_COLLECTIONS_COUNT: number = MOCK_UPCOMING_COLLECTIONS.length;

/** Points credited for each completed pickup. */
export const POINTS_PER_COMPLETED_PICKUP = 100;

/**
 * Points the demo account has earned: 100 per COMPLETED pickup. PENDING
 * pickups are excluded for the same reason they are excluded from
 * TOTAL_WASTE_KG — the weight is not confirmed yet, so the points are not
 * credited yet.
 */
export const TOTAL_POINTS_EARNED: number =
  PICKUPS_COMPLETED_COUNT * POINTS_PER_COMPLETED_PICKUP;

/** "9 May 2026" — display helper shared by every screen. */
export function formatCollectionDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
