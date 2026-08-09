import type { Deal } from "@/store/store";

/**
 * Deal presentation rules, kept out of the screens so they can be tested
 * without a renderer or a fetch mock.
 *
 * Vocabulary note (see the backend's docs/VOCABULARY.md): a Deal is the
 * consumer incentive, a Discount is one type of Deal (a price reduction), and
 * a coupon is only the redemption mechanism — the code and the PDF voucher.
 */

/**
 * True once a deal's end date has passed.
 *
 * GET /api/users/deals already filters by date server-side, so an expired deal
 * should never reach the client. This is a backstop for a stale list held
 * across a date boundary. A deal with no end date never expires.
 */
export function isDealExpired(
  deal: Pick<Deal, "endDate">,
  now: Date = new Date(),
): boolean {
  if (!deal.endDate) return false;
  const end = Date.parse(deal.endDate);
  if (Number.isNaN(end)) return false;
  return end < now.getTime();
}

/** True when the user can still claim a code for this deal. */
export function isDealClaimable(deal: Deal, now: Date = new Date()): boolean {
  return !deal.isAvailed && !deal.soldOut && !isDealExpired(deal, now);
}

/**
 * Splits deals into the two buckets the Deals screen renders.
 *
 * `available` backs the Active pill; `used` is appended under the All pill,
 * greyed out. A claimed deal is dead here — the redeem endpoint would hand
 * back the same code, but the app deliberately treats a claim as final, the
 * same as a used campaign coupon always was.
 */
export function partitionDeals(
  deals: Deal[],
  now: Date = new Date(),
): { available: Deal[]; used: Deal[] } {
  const available: Deal[] = [];
  const used: Deal[] = [];

  for (const deal of deals) {
    if (isDealClaimable(deal, now)) available.push(deal);
    else used.push(deal);
  }

  return { available, used };
}

/** The label for a deal card's call-to-action row. */
export function dealCtaLabel(deal: Deal, now: Date = new Date()): string {
  if (deal.isAvailed) return "Used";
  if (deal.soldOut) return "Sold Out";
  if (isDealExpired(deal, now)) return "Expired";
  return "Avail Offer";
}

/**
 * The brands with at least one deal, in first-appearance order, each carrying
 * its own deals.
 *
 * Home and the brand-detail screen used to read /api/users/active-campaigns
 * for this. The deals payload embeds the brand on every row, so one fetch now
 * backs all three surfaces. A brand with no live deals does not appear.
 */
export function groupDealsByBrand(
  deals: Deal[],
): (Deal["brand"] & { deals: Deal[] })[] {
  const byId = new Map<string, Deal["brand"] & { deals: Deal[] }>();

  for (const deal of deals) {
    if (!deal.brand?._id) continue;
    const id = String(deal.brand._id);
    const existing = byId.get(id);
    if (existing) existing.deals.push(deal);
    else byId.set(id, { ...deal.brand, deals: [deal] });
  }

  return Array.from(byId.values());
}
