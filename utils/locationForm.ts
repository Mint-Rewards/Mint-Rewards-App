/**
 * Pure form-shaping helpers for the location fields in `app/editProfile.tsx`.
 *
 * These exist so the parts of the capture flow that can be reasoned about
 * without a renderer — which cities are offered, which towns are offered, what
 * province leaves the client — are unit-testable. Anything needing component
 * state stays in the screen.
 *
 * Registry strings are never edited here: every value is read through the
 * accessors in `utils/pakistan_areas.ts`.
 */

import {
  PAKISTAN_LOCATIONS,
  getProvinceForCity,
  getSelectableTownsForCity,
} from "@/utils/pakistan_areas";

/**
 * Sentinel appended to the town and sub-area dropdowns. Never persisted:
 * choosing it clears the canonical field and reveals a free-text input.
 * Defined here (not in the screen) so option-building can be tested.
 */
export const OTHER_OPTION = "Other";

/**
 * Every city in the registry, province-independent, sorted for the picker.
 *
 * The province dropdown is gone (P2.1): city is now the top of the cascade, so
 * the offered list can no longer be scoped by a previously-picked province.
 * Computed once at module load — the registry is static.
 */
export const ALL_CITIES: string[] = Object.values(PAKISTAN_LOCATIONS.cities)
  .flat()
  .sort((a, b) => a.localeCompare(b));

/** Every city in the registry, province-independent. */
export function getAllCities(): string[] {
  return ALL_CITIES;
}

/**
 * Town options for the picker: selectable towns plus the "Other" escape.
 *
 * `getSelectableTownsForCity` (not `getTownsForCity`) is deliberate — deprecated
 * towns stay valid on existing profiles but must not be offered for new picks.
 * A stored legacy town therefore will not appear here; the picker still
 * DISPLAYS the stored value, it just cannot be re-selected from the list.
 */
export function buildTownOptions(city: string): string[] {
  if (!city?.trim()) return [];
  return [...getSelectableTownsForCity(city), OTHER_OPTION];
}

/**
 * The `province` value to send for a chosen city.
 *
 * The province dropdown was removed, but the field is still part of the profile
 * contract and `isProfileComplete` still requires it, so it is derived at
 * payload time instead of being asked for. An unknown city yields "" rather
 * than throwing — the P0.2d null path. Save is NOT blocked on it: a city
 * outside the registry is a data gap, not a user error.
 */
export function resolveProvinceForPayload(city: string): string {
  return getProvinceForCity(city) ?? "";
}
