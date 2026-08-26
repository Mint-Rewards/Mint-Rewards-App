import { API_BASE_URL } from "@/config/env";
import {
  normalizeProfileBonus,
  type ProfileBonusConfig,
} from "@/utils/profileBonusConfig";

/**
 * Pure decision-adjacent data shape for the location-capture gate.
 *
 * Mirrors utils/versionGate.ts: this module only normalises the untrusted
 * /api/app-config body into a typed config (or null). It does NOT decide
 * hard/soft/off resolution, dismissal accounting, or build-number escalation
 * — that is client logic that lives wherever this config is consumed, per
 * the comment on serverEnv.appConfig.locationGate in the backend's lib/env.ts.
 *
 * Every field here is untrusted network input. Nothing in this file may
 * throw, and a malformed value must never resolve to something MORE
 * restrictive than "no config at all" — a bad deploy or a corrupted response
 * body must not be able to lock the entire userbase out of the app behind a
 * hard gate, since the blocked app is the very thing that would have to fetch
 * the correction. When in doubt, this returns null, and the caller treats
 * null as GATE OFF.
 */

export interface LocationGateConfig {
  mode: "hard" | "soft" | "off";
  activatedCitiesOnly: boolean;
  maxDismissals: number;
  minClientBuild: { ios: number | null; android: number | null };
}

const MODES = ["hard", "soft", "off"] as const;

function isValidMode(value: unknown): value is LocationGateConfig["mode"] {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

/**
 * A non-negative integer, or null.
 *
 * null is the inert value here (not 0, unlike versionGate's buildNumber()) —
 * matching the backend's optionalBuildNumberOrNull: it means "no minimum
 * configured for this platform" rather than ambiguously "block build < 0".
 * An invalid per-platform value degrades to null rather than invalidating the
 * whole config, the same way a malformed store URL doesn't neutralise a
 * legitimate minSupportedVersion in versionGate.ts.
 */
function buildNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Normalises an untrusted /api/app-config body.
 *
 * The body is the whole app-config payload (see components/UpdateGate.tsx's
 * fetch of the same endpoint) with the location-gate config nested under
 * `locationGate` — matching the backend's GET /api/app-config, which serves
 * the version-gate fields at the top level and locationGate as one sub-object
 * alongside them.
 *
 * Returns null when the payload cannot be trusted at all: not an object, no
 * `locationGate` sub-object, or a `mode` that isn't one of the three known
 * literals. mode is the field that decides hard/soft/off, so — unlike
 * activatedCitiesOnly or minClientBuild below — there is no safe inert value
 * to degrade it to; an unrecognised mode has to invalidate the whole config
 * rather than silently pick one of "hard"/"soft"/"off" for it.
 *
 * maxDismissals is deliberately NOT degraded the way minClientBuild's
 * sub-fields are: absent means "use the server default of 3", but a present,
 * explicitly-invalid value (negative, zero, non-integer, non-numeric) returns
 * null for the whole config. Silently clamping or defaulting a value that was
 * actually sent would mask a real bug in whatever produced the payload —
 * absent and invalid are different signals and must not collapse into one.
 */
export function normalizeLocationGate(body: unknown): LocationGateConfig | null {
  if (typeof body !== "object" || body === null) return null;

  const rawLocationGate = (body as Record<string, unknown>).locationGate;
  if (typeof rawLocationGate !== "object" || rawLocationGate === null) return null;
  const locationGate = rawLocationGate as Record<string, unknown>;

  if (!isValidMode(locationGate.mode)) return null;

  let maxDismissals: number;
  if (locationGate.maxDismissals === undefined) {
    maxDismissals = 3;
  } else if (
    typeof locationGate.maxDismissals === "number" &&
    Number.isInteger(locationGate.maxDismissals) &&
    locationGate.maxDismissals >= 1
  ) {
    maxDismissals = locationGate.maxDismissals;
  } else {
    // Present but unusable (wrong type, negative, zero, non-integer, or an
    // explicit null). See the doc comment above for why this nulls the whole
    // config instead of falling back to the default.
    return null;
  }

  const builds =
    typeof locationGate.minClientBuild === "object" && locationGate.minClientBuild !== null
      ? (locationGate.minClientBuild as Record<string, unknown>)
      : {};

  return {
    mode: locationGate.mode,
    // Strict `=== true`, same as versionGate's forceOTA: any non-boolean
    // (including the string "true") degrades to the inert `false` rather
    // than invalidating the config.
    activatedCitiesOnly: locationGate.activatedCitiesOnly === true,
    maxDismissals,
    minClientBuild: {
      ios: buildNumberOrNull(builds.ios),
      android: buildNumberOrNull(builds.android),
    },
  };
}

const CONFIG_TIMEOUT_MS = 8000;

/**
 * Duplicated from components/UpdateGate.tsx's module-private fetchWithTimeout
 * rather than imported from it: that component is explicitly not to be
 * touched by this change (see the task brief), and importing from it would
 * pull this module onto UpdateGate's import graph — the exact coupling that
 * component's own doc comment says it was written to avoid. Same
 * AbortController pattern, same budget, because it is hitting the same
 * endpoint.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches /api/app-config and normalises the location-gate section of it.
 *
 * Never throws; returns null on any failure — network rejection, timeout,
 * a non-2xx response, unparseable JSON, or a payload normalizeLocationGate
 * rejects. Unauthenticated: /api/app-config takes no token, the same as the
 * version-gate fetch in UpdateGate.tsx that hits it.
 */
export async function fetchLocationGateConfig(): Promise<LocationGateConfig | null> {
  return (await fetchGateConfigs()).locationGate;
}

export interface GateConfigs {
  locationGate: LocationGateConfig | null;
  profileBonus: ProfileBonusConfig | null;
}

/**
 * Fetches /api/app-config ONCE and normalises every block the gate needs.
 *
 * One fetch, deliberately. UpdateGate already makes its own independent call to
 * this endpoint (documented in fetchWithTimeout's comment above), so the gates
 * were already hitting it twice on every launch; adding the profile bonus as a
 * third bare fetch would have made it three requests for one payload on the
 * app's most latency-sensitive path.
 *
 * Never throws. Note the two blocks resolve their failures in OPPOSITE
 * directions and each normaliser owns that decision: a null `locationGate`
 * means "gate off" (fail open — a bad config must not lock anyone out), while a
 * null `profileBonus` means "no bonus copy" (fail closed — a bad config must
 * not promise points). They share a request, not a policy.
 */
export async function fetchGateConfigs(): Promise<GateConfigs> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/app-config`,
      CONFIG_TIMEOUT_MS,
    );
    if (!response.ok) return { locationGate: null, profileBonus: null };

    const body = await response.json();
    return {
      locationGate: normalizeLocationGate(body),
      profileBonus: normalizeProfileBonus(body),
    };
  } catch {
    // Covers network rejection, the AbortController timeout, and malformed
    // JSON (response.json() rejects) in one place — all the same decision.
    return { locationGate: null, profileBonus: null };
  }
}
