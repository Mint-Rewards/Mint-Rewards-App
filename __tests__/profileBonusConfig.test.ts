/**
 * normalizeProfileBonus fails CLOSED, which is the opposite of its sibling
 * normalizeLocationGate — so this suite is mostly a malformed-input matrix
 * asserting null, the mirror image of __tests__/locationGateConfig.test.ts.
 *
 * The property under test throughout: there is no input, however garbled,
 * partial or hostile, that produces a bonus the caller would then promise on
 * screen. A returned config means every field was present, well-typed and
 * in-window.
 */

import { describe, expect, it } from "@jest/globals";
import { normalizeProfileBonus } from "@/utils/profileBonusConfig";

const NOW = Date.parse("2026-09-15T12:00:00Z");

const VALID = {
  // The neighbouring block, present to prove it is neither required nor read.
  locationGate: { mode: "soft" },
  profileBonus: {
    enabled: true,
    points: 100,
    windowHours: 24,
    campaignStart: "2026-09-01T00:00:00Z",
    campaignEnd: "2026-09-30T00:00:00Z",
  },
};

const withBonus = (overrides: Record<string, unknown>) => ({
  ...VALID,
  profileBonus: { ...VALID.profileBonus, ...overrides },
});

describe("normalizeProfileBonus — envelope", () => {
  it("accepts a well-formed, in-window payload", () => {
    expect(normalizeProfileBonus(VALID, NOW)).toEqual({
      points: 100,
      windowHours: 24,
    });
  });

  it.each([null, undefined, 0, "", "profileBonus", [], true])(
    "returns null for a non-object body (%p)",
    (body) => {
      expect(normalizeProfileBonus(body, NOW)).toBeNull();
    },
  );

  it("returns null when the block is absent entirely", () => {
    // The realistic deploy skew: a client that knows about the campaign talking
    // to a backend that does not serve it yet.
    expect(normalizeProfileBonus({ locationGate: { mode: "soft" } }, NOW))
      .toBeNull();
  });

  it.each([null, "yes", 1, []])(
    "returns null when profileBonus is not an object (%p)",
    (profileBonus) => {
      expect(normalizeProfileBonus({ ...VALID, profileBonus }, NOW)).toBeNull();
    },
  );

  it("ignores unknown extra keys rather than rejecting them", () => {
    expect(
      normalizeProfileBonus(withBonus({ someFutureField: "x" }), NOW),
    ).toEqual({ points: 100, windowHours: 24 });
  });
});

describe("normalizeProfileBonus — enabled", () => {
  it("returns null when disabled", () => {
    expect(normalizeProfileBonus(withBonus({ enabled: false }), NOW)).toBeNull();
  });

  it.each(["true", 1, null, undefined, {}])(
    "requires a real boolean true, not %p",
    (enabled) => {
      // Same strictness as activatedCitiesOnly in locationGateConfig, but here
      // the degraded value switches the bonus OFF, which is the safe direction.
      expect(normalizeProfileBonus(withBonus({ enabled }), NOW)).toBeNull();
    },
  );
});

describe("normalizeProfileBonus — amounts", () => {
  it.each([0, -1, 1.5, "100", null, undefined, NaN])(
    "returns null for an unusable points value (%p)",
    (points) => {
      expect(normalizeProfileBonus(withBonus({ points }), NOW)).toBeNull();
    },
  );

  it.each([0, -24, 1.5, "24", null, undefined])(
    "returns null for an unusable windowHours value (%p)",
    (windowHours) => {
      expect(normalizeProfileBonus(withBonus({ windowHours }), NOW)).toBeNull();
    },
  );

  it("passes non-default amounts through", () => {
    expect(
      normalizeProfileBonus(withBonus({ points: 250, windowHours: 48 }), NOW),
    ).toEqual({ points: 250, windowHours: 48 });
  });
});

describe("normalizeProfileBonus — campaign window", () => {
  it("returns null before the campaign starts", () => {
    expect(
      normalizeProfileBonus(VALID, Date.parse("2026-08-31T23:59:59Z")),
    ).toBeNull();
  });

  it("returns null after the campaign ends", () => {
    expect(
      normalizeProfileBonus(VALID, Date.parse("2026-09-30T00:00:01Z")),
    ).toBeNull();
  });

  it("treats absent bounds as unbounded", () => {
    const unbounded = withBonus({ campaignStart: null, campaignEnd: undefined });
    expect(normalizeProfileBonus(unbounded, 0)).toEqual({
      points: 100,
      windowHours: 24,
    });
  });

  it.each(["next Tuesday", "", 20260901, {}])(
    "returns null for an unreadable bound (%p) rather than treating it as unbounded",
    (campaignEnd) => {
      // The case worth spelling out: silently reading a typo'd end date as
      // "no end" would run the campaign forever.
      expect(normalizeProfileBonus(withBonus({ campaignEnd }), NOW)).toBeNull();
    },
  );
});
