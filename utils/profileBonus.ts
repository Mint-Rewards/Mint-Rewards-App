/**
 * Whether to show the profile-completion bonus, and until when.
 *
 * PURE — no React, no network, no store — for the same reason
 * `resolveLocationGate` is: policy that decides what a user is promised should
 * be enumerable in a test table, not read off a rendered component.
 *
 * What this decides is COPY ONLY. It cannot pay anyone, and being wrong in the
 * permissive direction means a user is shown a badge for a bonus the server
 * declines to pay — which is why every uncertain input resolves to null here
 * and in utils/profileBonusConfig.ts.
 *
 * The deadline is derived from a SERVER-STAMPED timestamp
 * (`profileBonusWindowStartedAt`, set on the user's first app open by
 * GET /api/users/my-profile) rather than from anything the client records. A
 * locally-stored deadline would reset on reinstall, drift with the device
 * clock, and disagree with the only clock that decides the payout.
 */

import type { User } from "@/store/store";
import type { ProfileBonusConfig } from "@/utils/profileBonusConfig";

const MS_PER_HOUR = 60 * 60 * 1000;

export interface ProfileBonus {
  points: number;
  /** Epoch ms at which this user's window closes. */
  expiresAt: number;
}

export function resolveProfileBonus(input: {
  user: User | null | undefined;
  config: ProfileBonusConfig | null;
  now?: number;
}): ProfileBonus | null {
  const { user, config } = input;
  const now = input.now ?? Date.now();

  if (!user || !config) return null;

  const raw = user.profileBonusWindowStartedAt;
  // No stamp means the server never opened a window for this user — most often
  // because their profile was already complete when the campaign started, or
  // because they have already been paid. Either way there is nothing to offer.
  if (!raw) return null;

  // Date.parse, not a bare Number: the wire value is an ISO string. An
  // unparseable one is untrustworthy input like any other and fails closed.
  const startedAt = Date.parse(raw);
  if (!Number.isFinite(startedAt)) return null;

  const expiresAt = startedAt + config.windowHours * MS_PER_HOUR;
  if (now >= expiresAt) return null;

  return { points: config.points, expiresAt };
}

/**
 * "23h 14m left" / "42m left" / "4m left".
 *
 * Hours and minutes, not the `m:ss` of `formatCountdown` in hooks/useCountdown:
 * a 24-hour deadline ticking down by the second reads as a pressure tactic and
 * makes the sheet twitch on every re-render. Seconds only appear under a
 * minute, where they are genuinely informative.
 */
export function formatTimeLeft(msLeft: number): string {
  if (msLeft <= 0) return "Expired";

  const totalMinutes = Math.floor(msLeft / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (totalMinutes > 0) return `${totalMinutes}m left`;
  return `${Math.ceil(msLeft / 1000)}s left`;
}
