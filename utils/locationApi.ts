/**
 * Client for `PATCH /api/users/location` — the progressive-save endpoint
 * (backend P1.4) that stores the STRUCTURED location alongside the legacy
 * string fields.
 *
 * Why this exists next to `updateProfile`: the legacy PUT /update-profile call
 * persists the strings a human reads ("Karachi", "DHA", "Phase 6"). This
 * endpoint persists what routing actually needs — a GeoJSON point, and how
 * much that point can be trusted. The server dual-writes the legacy fields from
 * whatever it receives here, so the two calls agree; this one is additive and
 * its failure is never allowed to break a save.
 *
 * Contract mirrored from Mint-Rewards-Backend `app/api/users/location/route.ts`.
 */

import { authenticatedFetch, apiUrl } from "@/utils/api";
import type { PinPlacement } from "@/utils/pinState";
import type { UserProfile } from "@/store/store";

/** Backend `LocationSource` (lib/types.ts). Only a subset is reachable from this app. */
export type LocationSource =
  | "map_pin"
  | "area_centroid"
  | "city_centroid"
  | "legacy_string"
  | "collector_verified";

/** Backend `LocationPrecision` (lib/types.ts). */
export type LocationPrecision =
  | "building"
  | "block"
  | "area"
  | "city"
  | "unknown";

/**
 * The structured-address leaves this app can fill today.
 *
 * `streetOrBlock` is accepted by the endpoint but not sent — nothing collects
 * it, and "" would clear whatever a future screen writes. `houseNo` IS sent now
 * that the form collects it and requires it.
 */
export interface StructuredAddressPatch {
  cityId?: string;
  areaId?: string;
  areaOther?: string;
  blockId?: string;
  blockOther?: string;
  houseNo?: string;
}

export interface LocationPatch {
  /** GeoJSON order: [longitude, latitude] — the REVERSE of the legacy pair. */
  coordinates: [number, number];
  source: LocationSource;
  precision: LocationPrecision;
}

export interface LocationPatchPayload {
  structuredAddress?: StructuredAddressPatch;
  location?: LocationPatch;
}

/** Backend `LocationEvaluation` (lib/evaluateLocation.ts). */
export interface LocationEvaluation {
  complete: boolean;
  /** Subset of ["cityId","areaId","houseNo","pin"], in that fixed order. */
  missing: string[];
  version: number;
  currentVersion: number;
  bucket: "complete" | "has_pin_partial" | "no_pin";
}

export type LocationPatchResult =
  | { Status: "Success"; evaluation: LocationEvaluation }
  | {
      Status: "Error";
      ErrorMessage: string;
      /**
       * The request 401'd, so `authenticatedFetch` has already signed the user
       * out and redirected them to the login screen. The caller needs this to
       * avoid congratulating them on a save while they are being bounced.
       */
      unauthorized?: boolean;
    };

/**
 * Placement -> how much the coordinate can be trusted.
 *
 * `user_placed` is the only placement that earns `building`: someone put the
 * pin on their door. Everything else is a coordinate we inherited — a value
 * saved by an older build, from a form that let device GPS become the pin — so
 * it is tagged `legacy_string`/`unknown` rather than flattered. Precision drives
 * routing (anything below "building" is excluded), so over-claiming here sends
 * a collector to the wrong door.
 *
 * `null` is NOT in this table on purpose — see `buildLocationPatchPayload`.
 */
const PLACEMENT_TRUST: Record<
  PinPlacement,
  { source: LocationSource; precision: LocationPrecision }
> = {
  user_placed: { source: "map_pin", precision: "building" },
  derived: { source: "legacy_string", precision: "unknown" },
  default: { source: "legacy_string", precision: "unknown" },
};

/**
 * Builds the PATCH body from the SAME normalized payload that goes to
 * `update-profile`, so the canonical/"Other" resolution lives in exactly one
 * place (`buildLocationPayload` in utils/locationSave.ts) and the two calls cannot
 * disagree about which of a pair holds the value.
 *
 * Pair rule, and it matters: never send BOTH members of a pair. The endpoint
 * applies leaves in a fixed order and each one clears its sibling, so sending
 * `areaId: "DHA"` together with `areaOther: ""` would apply the clear LAST and
 * wipe the town that was just set. Exactly one member is sent; when both are
 * empty the CANONICAL one is sent as "" to clear both sides, so a stale block
 * from a previously-chosen town cannot survive a town change.
 *
 * `cityId` is only ever sent non-empty — city is a required field, and an empty
 * one here would clear a good value rather than express anything.
 *
 * `placement` is the session's verdict on the pin, and `null` means the map was
 * never opened. That case omits `location` ENTIRELY rather than describing a
 * coordinate nobody looked at: the form rehydrates saved coordinates, so a user
 * editing their phone number would otherwise re-send their existing pin tagged
 * `legacy_string`/`unknown` — overwriting a `building`-precision pin they had
 * deliberately placed, and resetting `capturedAt`, on every unrelated profile
 * edit. An absent key means "don't touch", which is exactly the right message
 * for a coordinate this session did not produce. Bringing a legacy coordinate
 * into the structured record is the backfill's job, not this form's.
 */
export function buildLocationPatchPayload(
  profile: Partial<UserProfile>,
  placement: PinPlacement | null,
): LocationPatchPayload {
  const structuredAddress: StructuredAddressPatch = {};

  const city = (profile.city || "").trim();
  if (city) structuredAddress.cityId = city;

  const town = (profile.town || "").trim();
  const townOther = (profile.townOther || "").trim();
  if (town) structuredAddress.areaId = town;
  else if (townOther) structuredAddress.areaOther = townOther;
  else structuredAddress.areaId = "";

  // Mandatory on the form, so in practice always present here. Omitted rather
  // than sent empty on the defensive path: "" would clear a stored value, and
  // losing a house number to a partially-filled payload is worse than leaving
  // the old one until the next save.
  const houseNo = (profile.houseNo || "").trim();
  if (houseNo) structuredAddress.houseNo = houseNo;

  const subArea = (profile.subArea || "").trim();
  const subAreaOther = (profile.subAreaOther || "").trim();
  if (subArea) structuredAddress.blockId = subArea;
  else if (subAreaOther) structuredAddress.blockOther = subAreaOther;
  else structuredAddress.blockId = "";

  const payload: LocationPatchPayload = { structuredAddress };

  // The map was never opened this session, so there is no coordinate of ours to
  // report. Say nothing rather than re-describing what is already stored.
  if (placement === null) return payload;

  const latitude = parseFloat((profile.latitude || "").trim());
  const longitude = parseFloat((profile.longitude || "").trim());

  // No pin -> omit `location` entirely rather than sending a partial one. An
  // absent key means "don't touch"; a present one would overwrite a coordinate
  // some other flow captured.
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const trust = PLACEMENT_TRUST[placement];
    payload.location = {
      coordinates: [longitude, latitude],
      source: trust.source,
      precision: trust.precision,
    };
  }

  return payload;
}

/**
 * How long the caller may be made to wait for this request.
 *
 * The save it follows has ALREADY succeeded server-side by the time this runs,
 * so an unbounded wait here means a user staring at a spinner over work that is
 * already done. `authenticatedFetch` is a bare `fetch` with no timeout of its
 * own, and a stalled mobile connection does not fail fast on its own.
 */
const PATCH_TIMEOUT_MS = 8000;

/**
 * Sends the structured location. The RAW token is the Authorization header —
 * no "Bearer" prefix (mint-rewards-backend-api-contract).
 *
 * Never throws: every failure comes back as `{ Status: "Error" }` so the caller
 * can log it and carry on. This call is additive to a save that has already
 * succeeded, so it must not be able to turn a completed save into a failed one
 * — and, because it is awaited before the success message, it must not be able
 * to hold that message indefinitely either. A timeout is what makes the second
 * guarantee true; without it the call is non-blocking on errors but not on time.
 */
export async function patchUserLocation(
  payload: LocationPatchPayload,
  token: string | undefined | null,
): Promise<LocationPatchResult> {
  // Built by hand rather than with AbortSignal.timeout(), which is not reliably
  // present on this runtime.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PATCH_TIMEOUT_MS);

  try {
    const response = await authenticatedFetch(apiUrl("/api/users/location"), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data?.Status === "Success") {
      return { Status: "Success", evaluation: data.evaluation };
    }

    // This endpoint answers with `error` for 400/401/500 and `message` for 404
    // — read both rather than betting on one (the per-endpoint error-key quirk
    // the API contract warns about).
    return {
      Status: "Error",
      ErrorMessage:
        data?.error || data?.message || `Request failed (${response.status})`,
      unauthorized: response.status === 401,
    };
  } catch (error) {
    // An abort is this timeout firing, not an arbitrary network fault — name it
    // so the log says which one happened.
    const aborted =
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    return {
      Status: "Error",
      ErrorMessage: aborted
        ? `Timed out after ${PATCH_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : "Network error",
    };
  } finally {
    clearTimeout(timer);
  }
}
