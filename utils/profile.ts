import {
  getSubAreasForTown,
  isLegacyTownValue,
  requiresSubArea,
} from "@/utils/pakistan_areas";
import type { User } from "@/store/store";

/**
 * Each location level is satisfied by either half of its canonical/free-text
 * pair, since the two are mutually exclusive by construction: a user with a
 * `townOther` has answered the town question just as completely as one with a
 * canonical `town`.
 *
 * Sub-area is only counted where it can actually be answered — see
 * `requiresSubArea`. Demanding it unconditionally would mark free-text-town
 * users, and everyone in a town with no sub-area data, permanently incomplete
 * with no way to fix it.
 */
/**
 * True when the address STRINGS are answered — phone, province, city, town and
 * (where it can be answered) sub-area.
 *
 * Split out of `isProfileComplete` so callers can tell the two halves of
 * incompleteness apart *for messaging only*. "You haven't told us your area" and
 * "you haven't pinned your door" need different words; they must not need
 * different gates, which is why the gate keeps using `isProfileComplete`.
 */
export function isAreaAnswered(user: User | null | undefined): boolean {
  if (!user) return false;

  const city = user.city?.trim() || "";
  const town = user.town?.trim() || "";
  const hasTown = !!town || !!user.townOther?.trim();

  if (!user.phone?.trim() || !user.province?.trim() || !city || !hasTown) {
    return false;
  }

  // A town the picker cannot represent is not a complete answer to "where do
  // you live": the user cannot see or confirm it, and the app cannot tell
  // whether it still means anything. Treat it as missing rather than as an
  // answered field.
  if (isLegacyTownValue(city, town)) return false;

  if (requiresSubArea(city, town)) {
    const subArea = user.subArea?.trim() || "";
    // Same reasoning as the town check above: a `subArea` that is no longer
    // in the canonical list for this town (renamed or removed from the
    // dataset) cannot be confirmed by the user, so it does not count as an
    // answer. Mirrors the equivalent guard in `needsLocationUpdate` and the
    // rehydrate logic in `app/editProfile.tsx`, which drops the same value.
    if (subArea) return getSubAreasForTown(city, town).includes(subArea);
    return !!user.subAreaOther?.trim();
  }

  return true;
}

/**
 * True when we know where to actually deliver to: a saved coordinate.
 *
 * Used to pair a coordinate with a street address, on the reasoning that
 * neither was usable alone — a pin with no address could not be written on a
 * collection sheet, and an address with no pin could not be routed to. Street
 * became optional by owner decision on 2026-08-25: the coordinate is what a
 * route actually needs, and `isProfileComplete` below now gates on a house
 * number instead, which does the job a free-text street used to.
 */
export function isDeliveryPointSet(user: User | null | undefined): boolean {
  if (!user) return false;
  // Truthiness, not parseability, and deliberately so: this mirrors exactly what
  // the two screens tested before the rule moved here, so no existing user's
  // gate flips as a side effect. `validateForm` in editProfile is the
  // parseability gate, and it runs before anything is saved. (Street address
  // was dropped from this check on 2026-08-25 — see the doc comment above.)
  return !!user.latitude?.trim() && !!user.longitude?.trim();
}

/**
 * True when the profile has every field the app needs to place a user.
 *
 * The COORDINATE is part of this (owner ruling, 2026-08-25): a user with no
 * saved pin has an incomplete profile and is in the same category as a new
 * user. Before that ruling this checked only the address strings, and every
 * caller had to remember to AND it with its own hand-rolled coordinate check —
 * two screens did, with two different definitions of what counted. Stating it
 * once here is the point.
 *
 * The HOUSE NUMBER is also required (owner ruling, 2026-08-25 — the same pass
 * that dropped street address out of `isDeliveryPointSet`): it is where the
 * client's completion definition and the backend's tier-A one now agree, and
 * unlike a free-text street it is a value the app can actually route a
 * collection to. Read from `structuredAddress.houseNo`, the only field of
 * that subdocument this app consumes (see the `User` type).
 *
 * THIS is what gates. `isAreaAnswered` and `isDeliveryPointSet` exist so a
 * caller can say WHICH half is missing when it writes a prompt; they are not
 * alternative gates, and using one alone to decide access would reintroduce
 * exactly the split this function exists to close.
 */
export function isProfileComplete(user: User | null | undefined): boolean {
  const hasHouseNo = !!user?.structuredAddress?.houseNo?.trim();
  return isAreaAnswered(user) && isDeliveryPointSet(user) && hasHouseNo;
}

/**
 * True when a saved location predates the canonical dataset and the user must
 * re-pick it.
 *
 * Two populations qualify: a town renamed out of the list (which the picker
 * cannot represent at all), and a canonical town whose sub-area was never
 * collected because the field did not exist when the profile was created.
 *
 * Derived from the user document on every call — there is no stored flag to
 * drift out of sync, so a half-finished update simply prompts again.
 *
 * Returns false for free-text-town users (`town` empty, value in `townOther`),
 * for profiles with no town at all (already covered by the generic
 * incomplete-profile prompt), and for cities with no canonical town list —
 * none of them has an answerable question here.
 */
export function needsLocationUpdate(user: User | null | undefined): boolean {
  if (!user) return false;

  const city = user.city?.trim() || "";
  const town = user.town?.trim() || "";

  if (isLegacyTownValue(city, town)) return true;

  // A `subArea` can go stale the same way a town does: renamed or dropped
  // from the dataset in a later update. `requiresSubArea` only checks
  // whether the town still carries sub-area data at all — it has no opinion
  // on whether this particular saved value is still in that list. Without
  // this guard, a user in that state would sail through as "up to date"
  // while `editProfile` silently blanks the same value on rehydrate.
  if (
    town &&
    user.subArea?.trim() &&
    !getSubAreasForTown(city, town).includes(user.subArea.trim())
  ) {
    return true;
  }

  if (requiresSubArea(city, town)) {
    return !user.subArea?.trim() && !user.subAreaOther?.trim();
  }

  return false;
}
