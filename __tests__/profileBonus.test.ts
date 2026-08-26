/**
 * resolveProfileBonus decides what a user is PROMISED, so — like
 * resolveLocationGate — the matrix is enumerated here rather than driven
 * through a rendered sheet. Every case that returns null is a case where the
 * modals fall back to their pre-campaign copy.
 */

import { describe, expect, it } from "@jest/globals";
import type { User } from "@/store/store";
import { formatTimeLeft, resolveProfileBonus } from "@/utils/profileBonus";
import type { ProfileBonusConfig } from "@/utils/profileBonusConfig";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-09-15T12:00:00Z");

const CONFIG: ProfileBonusConfig = { points: 100, windowHours: 24 };

const userStartedAt = (startedAt: string | undefined): User =>
  ({
    _id: "u1",
    email: "a@b.test",
    profileBonusWindowStartedAt: startedAt,
  }) as User;

describe("resolveProfileBonus", () => {
  it("offers the bonus inside the window", () => {
    const user = userStartedAt(new Date(NOW - HOUR).toISOString());

    expect(resolveProfileBonus({ user, config: CONFIG, now: NOW })).toEqual({
      points: 100,
      expiresAt: NOW - HOUR + 24 * HOUR,
    });
  });

  it("returns null once the window has elapsed", () => {
    const user = userStartedAt(new Date(NOW - 25 * HOUR).toISOString());

    expect(resolveProfileBonus({ user, config: CONFIG, now: NOW })).toBeNull();
  });

  it("returns null at the exact instant of expiry", () => {
    // A boundary worth pinning: the promise must be gone the moment it stops
    // being payable, not one tick later.
    const user = userStartedAt(new Date(NOW - 24 * HOUR).toISOString());

    expect(resolveProfileBonus({ user, config: CONFIG, now: NOW })).toBeNull();
  });

  it("returns null when the server never opened a window", () => {
    // The already-complete user: nothing to earn, so nothing was stamped.
    expect(
      resolveProfileBonus({ user: userStartedAt(undefined), config: CONFIG, now: NOW }),
    ).toBeNull();
  });

  it("returns null when there is no config", () => {
    const user = userStartedAt(new Date(NOW - HOUR).toISOString());

    expect(resolveProfileBonus({ user, config: null, now: NOW })).toBeNull();
  });

  it("returns null when there is no user", () => {
    expect(resolveProfileBonus({ user: null, config: CONFIG, now: NOW })).toBeNull();
    expect(
      resolveProfileBonus({ user: undefined, config: CONFIG, now: NOW }),
    ).toBeNull();
  });

  it("returns null for an unparseable stamp rather than trusting it", () => {
    const user = userStartedAt("not a date");

    expect(resolveProfileBonus({ user, config: CONFIG, now: NOW })).toBeNull();
  });

  it("honours a non-default windowHours", () => {
    const user = userStartedAt(new Date(NOW - 2 * HOUR).toISOString());

    expect(
      resolveProfileBonus({
        user,
        config: { points: 100, windowHours: 1 },
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe("formatTimeLeft", () => {
  it.each([
    [23 * HOUR + 14 * 60_000, "23h 14m left"],
    [HOUR, "1h 0m left"],
    [42 * 60_000, "42m left"],
    [30_000, "30s left"],
    [0, "Expired"],
    [-1, "Expired"],
  ])("formats %pms as %p", (ms, expected) => {
    expect(formatTimeLeft(ms)).toBe(expected);
  });
});
