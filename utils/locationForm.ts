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
  getCitiesForProvince,
  getCityCentroid,
  getProvinceExtent,
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
 * Every province in the registry, sorted.
 *
 * Province is a FILTER over the city list, not a saved answer. It was removed
 * as a field in P2.1 because an independently-chosen province lets someone
 * store Karachi/Punjab — a pair the registry says cannot exist — and that
 * remains true: `buildLocationPayload` still derives the saved `province` from
 * the chosen city via `resolveProvinceForPayload`, and never reads this. What
 * comes back here only narrows which cities are offered.
 */
export const ALL_PROVINCES: string[] = Object.keys(PAKISTAN_LOCATIONS.cities).sort(
  (a, b) => a.localeCompare(b),
);

export function getAllProvinces(): string[] {
  return ALL_PROVINCES;
}

/**
 * The cities to offer, narrowed to a province when one is chosen.
 *
 * An empty or unknown province returns EVERY city rather than none. The picker
 * must never be empty: province is a convenience for finding your city in a
 * list of 58, so a province the registry does not recognise has to degrade to
 * "no filter applied", not to a dead end the user cannot get out of.
 */
export function getCitiesForPicker(province: string | undefined): string[] {
  const trimmed = (province || "").trim();
  if (!trimmed) return ALL_CITIES;
  const scoped = getCitiesForProvince(trimmed);
  return scoped.length > 0 ? [...scoped].sort((a, b) => a.localeCompare(b)) : ALL_CITIES;
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
export type SelectionViewportSource =
  | "area_centroid"
  | "city_centroid"
  | "province_centroid";

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
  province?: string,
): SelectionViewport | null {
  const trimmedCity = (city || "").trim();

  if (trimmedCity) {
    const area = getAreaCentroid(trimmedCity, (town || "").trim());
    if (area) return { region: toRegion(area, AREA_DELTA), source: "area_centroid" };

    const cityCentroid = getCityCentroid(trimmedCity);
    if (cityCentroid)
      return { region: toRegion(cityCentroid, CITY_DELTA), source: "city_centroid" };
  }

  // Province is the widest useful rung, and the only one available before a
  // city is chosen. Its extent is the bounding box of the cities we have
  // coordinates for rather than a geocoded midpoint — see `PROVINCE_EXTENTS`
  // for why a polygon centre would put Balochistan users in empty desert. Its
  // deltas therefore come from the data and are NOT a fixed zoom like the two
  // rungs above.
  const extent = getProvinceExtent((province || "").trim());
  if (extent) {
    const [longitude, latitude] = extent.centroid;
    return {
      region: {
        latitude,
        longitude,
        latitudeDelta: extent.latitudeDelta,
        longitudeDelta: extent.longitudeDelta,
      },
      source: "province_centroid",
    };
  }

  return null;
}

/** The camera position alone, for callers that do not report where it came from. */
export function getSelectionRegion(
  city: string | undefined,
  town: string | undefined,
  province?: string,
): MapRegion | null {
  return resolveSelectionViewport(city, town, province)?.region ?? null;
}

/**
 * How far a GPS fix may sit from the selected city's centroid and still be
 * treated as "the user is here", in km.
 *
 * 60km is drawn around Karachi, the widest city in the registry at roughly 40km
 * from centre to edge — the same figure the centroid sweep uses to decide
 * whether an area belongs to its city. Generous on purpose: the cost of
 * accepting a fix that is actually just outside the city is a viewport a few km
 * off, while the cost of rejecting a real one is sending someone back to a
 * city-wide view when the map could have opened on their street.
 */
const FIX_WITHIN_CITY_KM = 60;

/** Great-circle distance in km. Haversine; the earth is close enough here. */
function distanceKm(
  [lngA, latA]: readonly [number, number],
  [lngB, latB]: readonly [number, number],
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Whether a device fix is plausibly inside the city the user selected.
 *
 * A GPS fix is the best viewport there is FOR SOMEONE STANDING AT THE ADDRESS
 * THEY ARE ENTERING, and a worse one than the city centroid for anybody else —
 * someone entering a relative's address, someone travelling, or anyone on a
 * simulator, whose default fix is in California. Before centroids existed the
 * fallback was the whole of Pakistan, so a fix was always an improvement and
 * was always taken; now there is a real alternative and it can be compared
 * against.
 *
 * Returns TRUE when there is nothing to judge against — no city, or a city the
 * sweep never confirmed. That keeps the old behaviour exactly where the new
 * data cannot improve on it: with no centroid the only other option is the
 * country view, and a fix beats that wherever it is.
 */
export function isFixWithinCity(
  latitude: number,
  longitude: number,
  city: string | undefined,
): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const centroid = getCityCentroid((city || "").trim());
  if (!centroid) return true;
  return distanceKm([longitude, latitude], centroid) <= FIX_WITHIN_CITY_KM;
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
