/**
 * Turns location form values into the payload the profile endpoint expects.
 *
 * Extracted from `app/editProfile.tsx` because the confirm-address modal saves
 * the same shape. Every canonical/free-text decision happens HERE, once, so the
 * two hosts cannot disagree about which half of a pair holds the value — and so
 * `buildLocationPatchPayload` can keep being fed the normalized output rather
 * than raw form state.
 */

import type { LocationFormValues } from "@/hooks/useLocationForm";
import type { UserProfile } from "@/store/store";
import { resolveProvinceForPayload } from "@/utils/locationForm";
import { getSubAreasForTown, isCanonicalTown } from "@/utils/pakistan_areas";

/** Matches the server-side cap on `townOther` / `subAreaOther`. */
const OTHER_TEXT_MAX = 100;

const trimCapped = (v?: string) => (v || "").trim().slice(0, OTHER_TEXT_MAX);

/**
 * Normalises both canonical/free-text pairs before they leave the client.
 *
 * `town` and `subArea` are re-checked against the canonical lists here rather
 * than trusted from form state, and at most one of each pair survives. Every
 * field is always sent (as "" when unset) so clearing a previously-saved value
 * actually reaches the server.
 *
 * Province is derived, never asked: every registry city belongs to exactly one
 * province, so a field would only let someone save a pair that cannot exist. An
 * off-registry city yields "" and does not block the save — the P0.2d null path.
 *
 * `houseNo` is sent BOTH flat and nested. The nested copy is where it lives on
 * the server; sending it on this call as well as on the structured PATCH means a
 * field the user is now required to fill cannot be lost to a PATCH timeout.
 */
export function buildLocationPayload(
  values: LocationFormValues,
): Partial<UserProfile> {
  const city = values.city.trim();
  const province = resolveProvinceForPayload(city);
  const houseNo = values.houseNo.trim();

  // A non-canonical town is never allowed through as `town`; it degrades to
  // `townOther` rather than being dropped, so nothing the user typed is lost.
  const townIsCanonical = isCanonicalTown(city, values.town);
  const town = townIsCanonical ? values.town : "";
  const townOther = townIsCanonical
    ? ""
    : trimCapped(values.townOther || values.town);

  const base: Partial<UserProfile> = {
    city,
    province,
    address: values.address.trim(),
    latitude: values.latitude,
    longitude: values.longitude,
    houseNo,
    ...(houseNo ? { structuredAddress: { houseNo } } : {}),
  };

  // Sub-area is only meaningful under a canonical town, and only for towns that
  // actually have sub-area data — one with none never offered "Other", so
  // neither field can legitimately hold anything.
  const canonicalSubAreas = town ? getSubAreasForTown(city, town) : [];
  if (canonicalSubAreas.length === 0) {
    return { ...base, town, townOther, subArea: "", subAreaOther: "" };
  }

  const subArea = canonicalSubAreas.includes(values.subArea)
    ? values.subArea
    : "";
  const subAreaOther = subArea ? "" : trimCapped(values.subAreaOther);

  return { ...base, town, townOther, subArea, subAreaOther };
}

export interface LocationValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * The location half of form validation, shared by both hosts.
 *
 * Street address is deliberately absent: it became optional on 2026-08-25 and is
 * derived from the geocoder where possible.
 */
export function validateLocationValues(
  values: LocationFormValues,
  options: { requireSubArea: boolean; houseNoLabel: string },
): LocationValidationResult {
  const errors: Record<string, string> = {};

  // Mandatory as of 2026-08-26 (owner request). It is still never PERSISTED —
  // `buildLocationPayload` derives the saved province from the city — so this
  // is a gate on the order the form is filled in, not a new stored answer. It
  // guarantees the cascade is entered from the top, which is what lets the map
  // open on the province before a city has been picked.
  if (!values.province.trim()) errors.province = "Province is required";

  if (!values.city.trim()) errors.city = "City is required";

  // Either a canonical town or free-text "Other" satisfies the requirement.
  if (!values.town.trim() && !values.townOther.trim())
    errors.town = "Town is required";

  if (
    options.requireSubArea &&
    !values.subArea.trim() &&
    !values.subAreaOther.trim()
  )
    errors.subArea = "This field is required";

  if (!values.houseNo.trim())
    errors.houseNo = `${options.houseNoLabel} is required`;

  // The pin must be a parseable number, not merely a non-empty string.
  if (
    !values.latitude.trim() ||
    !values.longitude.trim() ||
    isNaN(parseFloat(values.latitude)) ||
    isNaN(parseFloat(values.longitude))
  )
    errors.location = "Please pin your exact location on the map";

  return { valid: Object.keys(errors).length === 0, errors };
}
