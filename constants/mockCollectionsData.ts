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
 * demo account in Lahore never sees history in Karachi. Read the arrays
 * through pastPickupsForUser() / upcomingCollectionsForUser() — the raw
 * templates carry no area or city.
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
  collectionName: string;
  area?: string;
  city?: string;
  /** ISO-8601 date (YYYY-MM-DD). */
  date: string;
  status: MockPickupStatus;
  bags: MockPickupBag[];
  comment?: string;
}

export interface MockUpcomingCollection {
  id: string;
  name: string;
  area?: string;
  city?: string;
  /** ISO-8601 date (YYYY-MM-DD). */
  date: string;
  /** Collection radius in metres. */
  radius: number;
  spotsAvailable?: number;
}

/** Location-free templates. Everything except area/city lives here. */
export const MOCK_PAST_PICKUPS: Omit<MockPastPickup, "area" | "city">[] = [
  {
    id: "pickup-001",
    collectionName: "Saturday Morning Drive",
    date: "2026-05-09",
    status: "COMPLETED",
    bags: [
      { qrCode: "MR-8F21A4", weightKg: 3.4 },
      { qrCode: "MR-8F21A5", weightKg: 2.1 },
    ],
    comment: "Left at the gate as agreed with the guard.",
  },
  {
    id: "pickup-002",
    collectionName: "Weekend Community Pickup",
    date: "2026-05-23",
    status: "COMPLETED",
    bags: [{ qrCode: "MR-91C0B7", weightKg: 5.8 }],
  },
  {
    id: "pickup-003",
    collectionName: "Neighbourhood Recycling Drive",
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
    id: "pickup-004",
    collectionName: "Saturday Morning Drive",
    date: "2026-06-18",
    status: "COMPLETED",
    bags: [{ qrCode: "MR-B7E244", weightKg: 3.0 }],
  },
  {
    id: "pickup-005",
    collectionName: "Evening Doorstep Route",
    date: "2026-06-27",
    status: "PENDING",
    bags: [{ qrCode: "MR-C1F833", weightKg: 2.5 }],
    comment: "Captain marked it for re-weighing at the depot.",
  },
  {
    id: "pickup-006",
    collectionName: "Weekend Community Pickup",
    date: "2026-07-05",
    status: "COMPLETED",
    bags: [
      { qrCode: "MR-D4A101", weightKg: 6.3 },
      { qrCode: "MR-D4A102", weightKg: 1.2 },
    ],
  },
  {
    id: "pickup-007",
    collectionName: "Midweek Doorstep Route",
    date: "2026-07-14",
    status: "COMPLETED",
    bags: [
      { qrCode: "MR-E8B776", weightKg: 2.7 },
      { qrCode: "MR-E8B777", weightKg: 3.9 },
    ],
    comment: "Cardboard flattened before handover.",
  },
  {
    id: "pickup-008",
    collectionName: "Community Cleanup Drive",
    date: "2026-07-21",
    status: "COMPLETED",
    bags: [{ qrCode: "MR-F2C388", weightKg: 4.6 }],
  },
  {
    id: "pickup-009",
    collectionName: "Neighbourhood Recycling Drive",
    date: "2026-07-27",
    status: "PENDING",
    bags: [{ qrCode: "MR-0D4E92", weightKg: 3.1 }],
  },
];

/** Location-free templates. Everything except area/city lives here. */
export const MOCK_UPCOMING_COLLECTIONS: Omit<
  MockUpcomingCollection,
  "area" | "city"
>[] = [
  {
    id: "collection-101",
    name: "Saturday Morning Drive",
    date: "2026-08-08",
    radius: 500,
    spotsAvailable: 12,
  },
  {
    id: "collection-102",
    name: "Weekend Community Pickup",
    date: "2026-08-15",
    radius: 750,
    spotsAvailable: 5,
  },
  {
    id: "collection-103",
    name: "Neighbourhood Recycling Drive",
    date: "2026-08-22",
    radius: 1000,
    spotsAvailable: 20,
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

export function pastPickupsForUser(user: User | null | undefined): MockPastPickup[] {
  return MOCK_PAST_PICKUPS.map((pickup) => withUserLocation(pickup, user));
}

export function upcomingCollectionsForUser(
  user: User | null | undefined,
): MockUpcomingCollection[] {
  return MOCK_UPCOMING_COLLECTIONS.map((collection) =>
    withUserLocation(collection, user),
  );
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
