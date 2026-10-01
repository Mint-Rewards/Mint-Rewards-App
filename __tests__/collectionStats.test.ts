/**
 * The totals the home card and the profile stats are built from.
 *
 * Worth testing without a device because the bug these replace was not a
 * crash: the card rendered a confident 0 kg for a household that had put out
 * 82.6, because it read a column nothing writes. A wrong number nobody
 * questions is the failure mode to guard.
 */
import { describe, expect, it } from "@jest/globals";
import type { PastCollection } from "@/hooks/usePastCollections";
import {
  EMPTY_COLLECTION_STATS,
  collectionStatsFrom,
} from "@/utils/collectionStats";

const entry = (
  outcome: PastCollection["outcome"],
  weightKg: number,
): PastCollection =>
  ({
    collectionId: Math.round(Math.random() * 1e6),
    name: "Round",
    scheduledDate: "2026-09-01",
    timeSlot: "09:00",
    collectionStatus: "COMPLETED",
    status: "COMPLETED",
    outcome,
    weightKg,
    co2Kg: Number.isFinite(weightKg) ? weightKg * 2.2 : 0,
    noCollectionReason: null,
    resolvedAt: null,
    captainName: null,
    captainAvatar: null,
  }) as PastCollection;

describe("collectionStatsFrom", () => {
  it("sums only the rounds that took the household's waste", () => {
    const stats = collectionStatsFrom([
      entry("collected", 10),
      entry("collected", 5.5),
      // Each of these has a history entry and must count for nothing.
      entry("missed", 99),
      entry("declined", 99),
      entry("cancelled", 99),
      entry("not_collected", 99),
    ]);
    expect(stats.collectedCount).toBe(2);
    expect(stats.wasteKg).toBe(15.5);
  });

  it("sums the CO2 the server sent rather than recomputing it", () => {
    const stats = collectionStatsFrom([entry("collected", 82.6)]);
    expect(stats.wasteKg).toBe(82.6);
    // Whatever operations said — the app must not apply a factor of its own.
    expect(stats.co2Kg).toBe(181.72);
  });

  it("counts a collection whose CO2 the server did not send", () => {
    // An older backend sends no co2Kg. The waste and the count are still
    // true; only the CO2 is unknown, and must not become NaN.
    const legacy = { ...entry("collected", 10) };
    delete (legacy as { co2Kg?: number }).co2Kg;
    const stats = collectionStatsFrom([legacy]);
    expect(stats.wasteKg).toBe(10);
    expect(stats.collectedCount).toBe(1);
    expect(stats.co2Kg).toBe(0);
  });

  it("reports nothing for a household with no history", () => {
    expect(collectionStatsFrom([])).toEqual(EMPTY_COLLECTION_STATS);
  });

  it("survives a weight the server could not supply", () => {
    // A stop completed without a recorded weight must not make the whole
    // total NaN, which renders as "NaN kg" rather than failing visibly.
    const stats = collectionStatsFrom([
      entry("collected", Number.NaN),
      entry("collected", 4),
    ]);
    expect(stats.wasteKg).toBe(4);
    expect(stats.collectedCount).toBe(2);
  });

  it("does not accumulate floating point noise", () => {
    const stats = collectionStatsFrom([
      entry("collected", 0.1),
      entry("collected", 0.2),
    ]);
    expect(stats.wasteKg).toBe(0.3);
  });
});
