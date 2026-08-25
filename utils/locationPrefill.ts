/**
 * Client for `POST /api/location/reverse-geocode`, plus the pure mapper that
 * turns its answer into the values the confirm modal opens with.
 *
 * Contract mirrored from Mint-Rewards-Backend
 * `app/api/location/reverse-geocode/route.ts`. Note the request body names the
 * coordinate pair `lat` / `lng` — NOT `latitude` / `longitude`, which is what
 * the rest of this app calls them — and that the route 400s on anything
 * non-finite or out of range.
 *
 * The important thing about this module is that the geocoder is an
 * ENHANCEMENT, never a precondition. The backend answers `{ resolved: false }`
 * for every single request while `LOCATIONIQ_API_KEY` is unset, which is the
 * expected production state today; the modal is an address *confirmation*, so
 * the unresolved path is the common path and must produce a fully populated
 * form from the user's own saved fields.
 */

import { authenticatedFetch, apiUrl } from "@/utils/api";
import {
  getProvinceForCity,
  getSubAreasForTown,
  isCanonicalTown,
  shouldPrefillArea,
} from "@/utils/pakistan_areas";
import type { UserProfile } from "@/store/store";

/** Backend `ReverseGeocodeResult`. Every field is nullable by design. */
export interface ReverseGeocodeResult {
  resolved: boolean;
  cityName: string | null;
  areaName: string | null;
  /**
   * A hint only — the raw `neighbourhood`/`residential` string. The route's own
   * comment forbids any caller from writing it into a canonical field, so it
   * may only ever reach the free-text street line here.
   */
  blockHint: string | null;
  raw: Record<string, unknown> | null;
  /** Candidate names the registry could not resolve. The alias-backlog feed. */
  unmatched: string[];
}

/**
 * What every failure returns, and what an unset `LOCATIONIQ_API_KEY` returns
 * from the server too — the caller cannot tell the two apart, and does not need
 * to, because both mean "prefill from what the user already told us".
 */
export const EMPTY_GEOCODE_RESULT: ReverseGeocodeResult = {
  resolved: false,
  cityName: null,
  areaName: null,
  blockHint: null,
  raw: null,
  unmatched: [],
};

/**
 * How long the modal may be held on a spinner waiting for this.
 *
 * The modal has everything it needs to open WITHOUT this call — the user's
 * saved fields — so the geocoder is never allowed to be the reason someone
 * stares at a loader. `authenticatedFetch` is a bare `fetch` with no timeout of
 * its own and a stalled mobile connection does not fail fast.
 */
const GEOCODE_TIMEOUT_MS = 8000;

/** Matches the route's own guards, so an out-of-range pin never costs a round trip. */
function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Reverse-geocodes a saved pin. The RAW token is the Authorization header —
 * no "Bearer" prefix (mint-rewards-backend-api-contract).
 *
 * NEVER throws and never rejects: every failure — rate limit (this endpoint
 * allows 20/hour/user), 401, timeout, malformed body — comes back as
 * `EMPTY_GEOCODE_RESULT`, which `buildPrefill` reads as "use the user's own
 * values". A confirmation modal that cannot open because a third-party
 * geocoder is down would block the very users this flow exists to reach.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  token: string | undefined | null,
): Promise<ReverseGeocodeResult> {
  if (!isValidCoordinate(latitude, longitude)) return EMPTY_GEOCODE_RESULT;

  // Built by hand rather than with AbortSignal.timeout(), which is not reliably
  // present on this runtime.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

  try {
    const response = await authenticatedFetch(
      apiUrl("/api/location/reverse-geocode"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        // The route's parameter names, not this app's.
        body: JSON.stringify({ lat: latitude, lng: longitude }),
        signal: controller.signal,
      },
    );

    if (!response.ok) return EMPTY_GEOCODE_RESULT;

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") return EMPTY_GEOCODE_RESULT;

    // Normalized rather than trusted field-by-field: a 200 carrying a shape we
    // did not expect must degrade to the empty result, not leak `undefined`
    // into the form.
    return {
      resolved: data.resolved === true,
      cityName: typeof data.cityName === "string" ? data.cityName : null,
      areaName: typeof data.areaName === "string" ? data.areaName : null,
      blockHint: typeof data.blockHint === "string" ? data.blockHint : null,
      raw:
        data.raw && typeof data.raw === "object"
          ? (data.raw as Record<string, unknown>)
          : null,
      unmatched: Array.isArray(data.unmatched)
        ? data.unmatched.filter((v: unknown): v is string => typeof v === "string")
        : [],
    };
  } catch {
    return EMPTY_GEOCODE_RESULT;
  } finally {
    clearTimeout(timer);
  }
}

/** What the confirm modal opens with. "" means "unknown", never `undefined`. */
export interface LocationPrefill {
  city: string;
  town: string;
  subArea: string;
  street: string;
}

/** Only the saved fields this mapper reads. Keeps the tests honest. */
export type PrefillUser = Pick<
  UserProfile,
  "city" | "town" | "subArea" | "address"
>;

function clean(value: string | null | undefined): string {
  return (value || "").trim();
}

/**
 * Maps a reverse-geocode result plus the user's saved profile onto the values
 * the confirm modal should open with. PURE — no I/O, no clock, no store.
 *
 * The rules, in the order they matter:
 *
 *  1. `resolved: false` -> the user's own fields, wholesale. This is the common
 *     path, not an edge case (unset `LOCATIONIQ_API_KEY` answers false for
 *     every request), and it must produce a usable form.
 *  2. An area may only be PRE-SELECTED when `shouldPrefillArea` allows it —
 *     that helper refuses to drop a consumer into a port, campus or industrial
 *     estate, because every user of this app is a household by construction and
 *     a pin can legitimately sit on an industrial plot across the road from
 *     where someone lives. When it refuses we fall back to the user's saved
 *     value rather than blanking the field: suppressing a guess must not also
 *     destroy an answer the user already gave.
 *  3. A geocoded string that is not CANONICAL for the resolved city never
 *     enters a canonical field. `town` holds registry values or "", full stop.
 *  4. `blockHint` is a hint. It reaches the free-text street line and nothing
 *     else, per the route's own instruction to its callers.
 *  5. There is no house number here, ever. The geocoder cannot know it; it is
 *     the one field the user always types, and it is the field this whole modal
 *     exists to collect.
 */
export function buildPrefill(
  geo: ReverseGeocodeResult | null | undefined,
  user: Partial<PrefillUser> | null | undefined,
): LocationPrefill {
  const savedCity = clean(user?.city);
  const savedTown = clean(user?.town);
  const savedSubArea = clean(user?.subArea);
  const savedStreet = clean(user?.address);

  const saved: LocationPrefill = {
    city: savedCity,
    town: savedTown,
    subArea: savedSubArea,
    street: savedStreet,
  };

  if (!geo || !geo.resolved) return saved;

  const geoCity = clean(geo.cityName);
  const geoArea = clean(geo.areaName);

  // A city the registry does not know scopes every later lookup to nothing, so
  // it is worth no more than the user's own answer.
  const city = geoCity && getProvinceForCity(geoCity) !== null ? geoCity : savedCity;

  const town =
    geoArea && isCanonicalTown(city, geoArea) && shouldPrefillArea(city, geoArea)
      ? geoArea
      : savedTown;

  // The geocoder never supplies a sub-area — `blockHint` is explicitly not one
  // — so this field only ever carries the user's own saved value forward. It
  // survives untouched while the town is unchanged (their answer, their town),
  // and is dropped once the geocoder has moved the town unless it is still
  // canonical there: showing a block from a different area as though the user
  // had picked it there is worse than showing nothing.
  const subArea =
    town === savedTown || getSubAreasForTown(city, town).includes(savedSubArea)
      ? savedSubArea
      : "";

  return {
    city,
    town,
    subArea,
    // Free text, so the hint is allowed here and ONLY here. It outranks the
    // saved street because it is derived from the pin the user just placed,
    // which is fresher than a string typed at signup.
    street: clean(geo.blockHint) || savedStreet,
  };
}
