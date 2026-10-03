/**
 * A household's totals, derived from the rounds it has actually been through.
 *
 * These used to be read off `user.totalWasteCollected` and
 * `user.totalCollections` — denormalised columns inherited from Mongo that
 * nothing has written since the move to Postgres. The operations API owns
 * collections and records a weight per stop; it has never had any code that
 * writes back to `consumer.users`. So the fields were always empty, and the
 * home card reported 0 kg to a household that had put out 82.6.
 *
 * Deriving them here instead of restoring the writer is deliberate: a total
 * kept in two places is a total that will eventually disagree with itself,
 * and the app already downloads the history these are computed from.
 *
 * Pure, so the arithmetic can be tested without a device or a network.
 */
import type { PastCollection } from "@/hooks/usePastCollections";

export interface CollectionStats {
  /** Rounds where this household's bags were actually taken. */
  collectedCount: number;
  /** Their combined weight, to one decimal — the unit the card shows. */
  wasteKg: number;
  /** What that weight represents, via the single shared factor. */
  co2Kg: number;
}

export const EMPTY_COLLECTION_STATS: CollectionStats = {
  collectedCount: 0,
  wasteKg: 0,
  co2Kg: 0,
};

/**
 * `outcome` rather than `status`, and only "collected".
 *
 * The server decides per household what happened, because a completed round
 * still has doors nobody answered and a household that declined still has a
 * history entry. Counting anything else here would credit somebody for a
 * collection that never took their waste — and would disagree with the list
 * on the collections tab, which reads the same field.
 */
export function collectionStatsFrom(
  collections: readonly PastCollection[],
): CollectionStats {
  const collected = collections.filter((c) => c.outcome === "collected");
  const rawKg = collected.reduce(
    (sum, c) => sum + (Number.isFinite(c.weightKg) ? c.weightKg : 0),
    0,
  );
  // Rounded once, here, so the card and the CO2 figure cannot disagree about
  // the same weight by a hundredth.
  const wasteKg = Math.round((rawKg + Number.EPSILON) * 10) / 10;
  /*
   * Summed from what the server sent, never recomputed here.
   *
   * The app used to multiply weight by 0.21 — a car's emissions per
   * kilometre, copied from the wrong line of the public calculator — and so
   * reported roughly a tenth of every household's real impact. Operations
   * owns the weights and now sends what they are worth, and will send a
   * per-material figure once the warehouse portal records material. A client
   * that does this arithmetic is a client that will disagree with the
   * warehouse, the brand ESG report and the website.
   */
  const co2Raw = collected.reduce(
    (sum, c) => sum + (Number.isFinite(c.co2Kg) ? (c.co2Kg as number) : 0),
    0,
  );
  return {
    collectedCount: collected.length,
    wasteKg,
    co2Kg: Math.round((co2Raw + Number.EPSILON) * 100) / 100,
  };
}
