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
  getAreaCentroid,
  getCityCentroid,
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

/** A map camera position, in the shape react-native-maps expects. */
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Zoom for a town-level centroid — close enough to recognise streets. */
const AREA_DELTA = 0.05;
/** Zoom for a city-level centroid — the whole city, not the whole country. */
const CITY_DELTA = 0.2;

/**
 * Which rung of the registry supplied the opening camera position.
 *
 * Reported as `map_opened`'s `viewportSource`, so it is a dashboard contract.
 * The two levels are kept apart rather than collapsed into one "centroid"
 * value because the difference is the open question about the dataset: area
 * coverage is partial and city coverage is near-total, so the split says how
 * often anyone actually gets the tighter view.
 */
export type SelectionViewportSource = "area_centroid" | "city_centroid";

export interface SelectionViewport {
  region: MapRegion;
  source: SelectionViewportSource;
}

/**
 * Where to point the map camera for a user who has no saved pin, and which
 * rung of the registry answered.
 *
 * The form already knows their city and town by the time they open the map, so
 * opening on a country-wide view — which is what happens when GPS is denied or
 * fails — asks them to pinch down from national scale to a rooftop for no
 * reason. The registry's centroid is a better guess than the middle of Pakistan.
 *
 * This positions the CAMERA only. It deliberately does not place a pin: a
 * centroid is where an area is, not where a person lives, and a marker they did
 * not put there is one they might confirm by accident. `pinReducer`'s `centroid`
 * event exists for the prefill flow, which is a different question and ships
 * with the gate-flow plan.
 *
 * Returns null when the registry has no centroid for this selection. That is no
 * longer every selection — the dataset landed — but it is still a live path:
 * the sweep that sourced it rejected every name its two providers disagreed
 * about, and a free-text town has no registry key at all. The caller must fall
 * back.
 */
export function resolveSelectionViewport(
  city: string | undefined,
  town: string | undefined,
): SelectionViewport | null {
  const trimmedCity = (city || "").trim();
  if (!trimmedCity) return null;

  const area = getAreaCentroid(trimmedCity, (town || "").trim());
  if (area) return { region: toRegion(area, AREA_DELTA), source: "area_centroid" };

  const cityCentroid = getCityCentroid(trimmedCity);
  if (cityCentroid)
    return { region: toRegion(cityCentroid, CITY_DELTA), source: "city_centroid" };

  return null;
}

/** The camera position alone, for callers that do not report where it came from. */
export function getSelectionRegion(
  city: string | undefined,
  town: string | undefined,
): MapRegion | null {
  return resolveSelectionViewport(city, town)?.region ?? null;
}

/**
 * Registry centroids are stored `[lng, lat]` (GeoJSON), and a map region reads
 * `latitude` first. Converting in one place, once, is the whole reason this is
 * a function — the two orders are indistinguishable to the type system and a
 * swap puts Karachi in Somalia.
 */
function toRegion(
  centroid: readonly [number, number],
  delta: number,
): MapRegion {
  const [longitude, latitude] = centroid;
  return {
    latitude,
    longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}
