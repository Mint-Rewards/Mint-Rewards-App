import { requiresSubArea } from "@/utils/pakistan_areas";
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
