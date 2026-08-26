/**
 * The location gate's decision function: which modal, if any, meets a user on
 * Home.
 *
 * Deliberately PURE — no React, no network, no store. Ship day touches every
 * existing user at once (owner ruling, 2026-08-25), so the one thing that must
 * be exhaustively testable is *who gets blocked*. Keeping the rules in a
 * function of plain data means the whole matrix can be enumerated in a test
 * table instead of driven through a rendered component.
 */

import type { User } from "@/store/store";
import {
  getCoverageTier,
  requiresSubArea,
} from "@/utils/pakistan_areas";

/**
 * The version of the location questionnaire this build knows how to ask.
 *
 * MUST stay in step with `LOCATION_COMPLETION_VERSION` in the backend's
 * `lib/evaluateLocation.ts`. The client deliberately holds its OWN copy rather
 * than reading the server's: the server bumps this when it starts demanding a
 * new field, and a client that has not shipped the input for that field would
 * otherwise block the user behind a modal it cannot satisfy. A client should
 * only ever ask for what it knows how to collect, so re-asking is gated on the
 * client's version, and the mismatch resolves itself when the new build ships.
 */
export const LOCATION_COMPLETION_VERSION = 1;

export type GateMode = "hard" | "soft" | "off";

export interface LocationGateConfig {
  mode: GateMode;
  activatedCitiesOnly: boolean;
  maxDismissals: number;
  minClientBuild: { ios: number | null; android: number | null };
}

export type MissingField =
  | "userName"
  | "phone"
  | "city"
  | "town"
  | "subArea"
  | "houseNo"
  | "pin";

export type GateDecision =
  | { show: "none"; reason: string }
  /**
   * `dismissible` controls whether the modal offers a SKIP — never whether it
   * shows. A non-dismissible modal is still a modal; it just has no way out
   * but completing it. Conflating the two is how a "soft" rollout turns into a
   * hard one by accident.
   */
  | { show: "confirm"; dismissible: boolean }
  | { show: "finish"; dismissible: boolean; missing: MissingField[] };

/**
 * `locationVersion` is stamped by the server on a successful
 * `PATCH /api/users/location` and is not yet declared on the store's `User`.
 * Read through a local widening rather than editing the store type, so this
 * module can land without touching shared state; fold it into `User` when the
 * store next changes.
 */
type UserWithLocationVersion = User & { locationVersion?: number };

/**
 * Whether the gate considers a city "activated".
 *
 * ASSUMPTION, isolated here on purpose: the config flag is
 * `activatedCitiesOnly`, but nothing in the client carries an activation list,
 * so this reads coverage tier "A" as the proxy — the tier we have real area
 * data for. If activation ever becomes its own list (or arrives on the config
 * payload), this predicate is the single line to change; no caller encodes the
 * assumption.
 */
export function isActivatedCity(city: string | undefined | null): boolean {
  return getCoverageTier((city ?? "").trim()) === "A";
}

/** Ordering for mode escalation. A higher number is a stricter gate. */
const MODE_RANK: Record<GateMode, number> = { off: 0, soft: 1, hard: 2 };

function strictest(a: GateMode, b: GateMode): GateMode {
  return MODE_RANK[a] >= MODE_RANK[b] ? a : b;
}

/**
 * `Number`, not `parseFloat`: `parseFloat("24abc")` happily returns 24, and a
 * coordinate that only half-parses is corrupt data we should re-ask for rather
 * than silently route to. The empty-string guard is load-bearing for the same
 * reason — `Number("")` is 0, which is a perfectly finite point in the Gulf of
 * Guinea.
 */
function isFiniteCoord(value: string | undefined | null): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  return Number.isFinite(Number(trimmed));
}

/** The pin is the discriminator between the two modals — see the design doc. */
function hasPin(user: User): boolean {
  return isFiniteCoord(user.latitude) && isFiniteCoord(user.longitude);
}

/**
 * Every field the finish modal knows how to collect, in the order its checklist
 * renders them.
 *
 * Note what is NOT here: `province` (derived from city, never shown — preserves
 * 502b162) and `address` (optional since the completeness rule change; a house
 * number routes, a free-text street does not).
 *
 * The cascade rules are not restated here — `requiresSubArea` from
 * `pakistan_areas` is the single source of truth for whether a blank sub-area
 * is a gap or simply not applicable, and it is the same function
 * `utils/profile.ts` reads, so the two cannot disagree. `isAreaAnswered` itself
 * is not reusable here: it answers one boolean over the whole address, while a
 * checklist needs to name each unsatisfied row, and it additionally demands
 * `province`, which this gate never asks a user for.
 */
function missingFields(user: User): MissingField[] {
  const missing: MissingField[] = [];

  const city = user.city?.trim() || "";
  const town = user.town?.trim() || "";

  if (!user.userName?.trim()) missing.push("userName");
  if (!user.phone?.trim()) missing.push("phone");
  if (!city) missing.push("city");

  // Either half of the canonical/free-text pair answers the question; they are
  // mutually exclusive by construction.
  if (!town && !user.townOther?.trim()) missing.push("town");

  if (
    requiresSubArea(city, town) &&
    !user.subArea?.trim() &&
    !user.subAreaOther?.trim()
  ) {
    missing.push("subArea");
  }

  if (!user.structuredAddress?.houseNo?.trim()) missing.push("houseNo");
  if (!hasPin(user)) missing.push("pin");

  return missing;
}

export function resolveLocationGate(input: {
  user: User | null | undefined;
  config: LocationGateConfig | null;
  dismissals: number;
  platform: "ios" | "android" | "web";
  build: number | null;
}): GateDecision {
  const { user, config, dismissals, platform, build } = input;

  if (!user) return { show: "none", reason: "no user" };

  // FAIL OPEN. An unreachable `/api/app-config`, a malformed body, or a payload
  // with no `locationGate` all arrive here as null, and all resolve to "none".
  // This is the single most important property in this module: a broken config
  // must never be able to lock the entire userbase out of the app. Every
  // stricter rule below is downstream of a config we actually have.
  if (config === null) return { show: "none", reason: "config unavailable" };

  // The effective mode is computed BEFORE the off-switch check, because an
  // outdated client is escalated to at least "soft" regardless of mode — the
  // backend's own comment on `minClientBuild`. A build below the floor may be
  // sending data in a shape the server no longer accepts, so leaving it
  // ungated is worse than nagging it. "web" has no floor and is never
  // escalated: there is no store build number to compare against.
  const floor = platform === "web" ? null : config.minClientBuild[platform];
  const outdated = build !== null && floor !== null && build < floor;
  const effectiveMode: GateMode = outdated
    ? strictest(config.mode, "soft")
    : config.mode;

  if (effectiveMode === "off") return { show: "none", reason: "gate off" };

  // Scoping the gate to activated cities can only be applied to a user we can
  // actually place. Someone with NO city has no tier, and suppressing them would
  // mean never asking for the one field that would tell us whether they belong
  // in scope — the flag would switch off the gate precisely where it is most
  // needed. An unplaceable user is therefore always gated.
  const hasCity = !!user.city?.trim();
  if (config.activatedCitiesOnly && hasCity && !isActivatedCity(user.city)) {
    return { show: "none", reason: "city not activated" };
  }

  const locationVersion =
    (user as UserWithLocationVersion).locationVersion ?? 0;
  if (locationVersion >= LOCATION_COMPLETION_VERSION) {
    return { show: "none", reason: "already confirmed" };
  }

  // "hard" is never dismissible whatever the count says — that is what makes it
  // hard. See the `GateDecision` comment: this offers a skip, it does not
  // decide whether the modal appears.
  const dismissible =
    effectiveMode === "soft" && dismissals < config.maxDismissals;

  // A pin sends the user to the confirm modal even with other gaps: they fill
  // the house number inline there rather than being sent round the whole form.
  if (hasPin(user)) return { show: "confirm", dismissible };

  return { show: "finish", dismissible, missing: missingFields(user) };
}
