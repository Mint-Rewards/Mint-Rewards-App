/**
 * Normalises the `profileBonus` block of the untrusted /api/app-config body.
 *
 * Sibling of utils/locationGateConfig.ts and structurally the same: nothing
 * here may throw, every field is untrusted network input, and anything that
 * cannot be trusted resolves to null.
 *
 * BUT THE POLARITY IS THE OPPOSITE, AND THAT IS THE POINT OF THIS COMMENT.
 *
 * `locationGate` fails OPEN — a malformed config must never be able to lock the
 * userbase out behind a hard gate, because the blocked app is the very thing
 * that would have to fetch the correction. The risk it manages is *denying
 * access*.
 *
 * `profileBonus` fails CLOSED. The risk here is the mirror image: showing a
 * "+100 POINTS" badge to a user the server will not pay. A garbled config, a
 * campaign that has not started, a deploy where the block is missing entirely —
 * all resolve to null, and null means the modals render exactly the copy they
 * rendered before this feature existed. Promising nothing is always safe;
 * promising points we cannot pay is the specific failure the owner's
 * 2026-08-25 decision was about.
 *
 * The same reasoning is why nothing here is treated as authoritative: this
 * config decides COPY, not money. The server re-reads its own values at payout
 * time (Mint-Rewards-Backend/lib/profileBonus.ts), so a client holding a stale
 * or tampered block can render the wrong badge but cannot cause a payment.
 */

export interface ProfileBonusConfig {
  /** Points on offer. Display only — the server decides what it actually pays. */
  points: number;
  /** Length of each user's personal window, from their first app open. */
  windowHours: number;
}

/** A positive integer, or null. Anything else is untrustworthy. */
function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    ? value
    : null;
}

/**
 * Parses an ISO datetime bound.
 *
 * Three-way, deliberately: `null` for "absent, i.e. unbounded on this end",
 * a number for a real instant, and `"invalid"` for a value that was sent but
 * cannot be read. Collapsing the last two into null would turn a typo in the
 * campaign end date into a campaign that never ends — the fail-closed rule
 * applies to the dates too, not just to the envelope.
 */
function parseBound(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "invalid";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? "invalid" : parsed;
}

/**
 * Returns the bonus config when a campaign is live right now, else null.
 *
 * `now` is injected rather than read from the clock so the campaign-boundary
 * cases are testable, matching how utils/deals.ts threads `now` through
 * `isDealExpired`.
 */
export function normalizeProfileBonus(
  body: unknown,
  now: number = Date.now(),
): ProfileBonusConfig | null {
  if (typeof body !== "object" || body === null) return null;

  const raw = (body as Record<string, unknown>).profileBonus;
  if (typeof raw !== "object" || raw === null) return null;
  const profileBonus = raw as Record<string, unknown>;

  // Strict `=== true`, matching activatedCitiesOnly in locationGateConfig: the
  // string "true" is not a boolean and must not read as one. Note this is the
  // safe direction here — a non-boolean disables the bonus.
  if (profileBonus.enabled !== true) return null;

  const points = positiveInt(profileBonus.points);
  const windowHours = positiveInt(profileBonus.windowHours);
  if (points === null || windowHours === null) return null;

  const start = parseBound(profileBonus.campaignStart);
  const end = parseBound(profileBonus.campaignEnd);
  if (start === "invalid" || end === "invalid") return null;

  if (start !== null && now < start) return null;
  if (end !== null && now > end) return null;

  return { points, windowHours };
}
