import { isLegacyTownValue, requiresSubArea } from "@/utils/pakistan_areas";
import type { User } from "@/store/store";

/**
 * True when the profile has every field the app needs to place a user.
 *
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
export function isProfileComplete(user: User | null | undefined): boolean {
  if (!user) return false;

  const city = user.city?.trim() || "";
  const town = user.town?.trim() || "";
  const hasTown = !!town || !!user.townOther?.trim();

  if (!user.phone?.trim() || !user.province?.trim() || !city || !hasTown) {
    return false;
  }

  if (requiresSubArea(city, town)) {
    return !!user.subArea?.trim() || !!user.subAreaOther?.trim();
  }

  return true;
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

  if (requiresSubArea(city, town)) {
    return !user.subArea?.trim() && !user.subAreaOther?.trim();
  }

  return false;
}
