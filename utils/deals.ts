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

/** A brand together with the deals the user can see for it. */
export type BrandWithDeals = Deal["brand"] & { deals: Deal[] };

/**
 * The brands with at least one deal, in first-appearance order, each carrying
 * its own deals.
 *
 * Home and the brand-detail screen used to read /api/users/active-campaigns
 * for this. The deals payload embeds the brand on every row, so one fetch now
 * backs all three surfaces.
 *
 * A brand with no live deals does not appear here — by construction, since a
 * dealless brand is not in this payload at all. Screens that must show every
 * approved brand use `mergeBrandsWithDeals` instead.
 */
export function groupDealsByBrand(deals: Deal[]): BrandWithDeals[] {
  const byId = new Map<string, BrandWithDeals>();

  for (const deal of deals) {
    if (!deal.brand?._id) continue;
    const id = String(deal.brand._id);
    const existing = byId.get(id);
    if (existing) existing.deals.push(deal);
    else byId.set(id, { ...deal.brand, deals: [deal] });
  }

  return Array.from(byId.values());
}

/**
 * Every approved brand, each carrying whatever deals the user can see for it —
 * an empty array when the brand has none.
 *
 * Approval in BrandHub is what earns a brand a place in the app; having a live
 * deal is not a second gate. `groupDealsByBrand` alone made it one, so a brand
 * approved with no deals yet was invisible.
 *
 * Order follows `brands` (the /api/users/brands payload), which sorts newest
 * first, so a brand does not move when its first deal lands. Any brand present
 * only in the deals payload is appended rather than dropped: the two responses
 * are separate reads and can disagree for a moment around an approval or a
 * deal expiring, and dropping a brand that has live deals is the worse of the
 * two failures.
 *
 * Brand fields are taken from `brands` when available, since that row is the
 * brand record itself rather than a copy denormalised onto a deal.
 */
export function mergeBrandsWithDeals(
  brands: Deal["brand"][],
  deals: Deal[],
): BrandWithDeals[] {
  const dealsByBrandId = new Map<string, Deal[]>();
  for (const deal of deals) {
    if (!deal.brand?._id) continue;
    const id = String(deal.brand._id);
    const existing = dealsByBrandId.get(id);
    if (existing) existing.push(deal);
    else dealsByBrandId.set(id, [deal]);
  }

  const merged: BrandWithDeals[] = [];
  const seen = new Set<string>();

  for (const brand of brands) {
    if (!brand?._id) continue;
    const id = String(brand._id);
    // A brand listed twice would otherwise get its deals rendered twice.
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({ ...brand, deals: dealsByBrandId.get(id) ?? [] });
  }

  for (const group of groupDealsByBrand(deals)) {
    if (seen.has(String(group._id))) continue;
    seen.add(String(group._id));
    merged.push(group);
  }

  return merged;
}
