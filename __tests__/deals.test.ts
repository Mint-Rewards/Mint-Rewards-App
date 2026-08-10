import { describe, expect, it } from "@jest/globals";
import type { Deal } from "@/store/store";
import {
  dealCtaLabel,
  groupDealsByBrand,
  isDealClaimable,
  isDealExpired,
  mergeBrandsWithDeals,
  partitionDeals,
} from "@/utils/deals";

const NOW = new Date("2026-06-15T12:00:00Z");

const brand = (id: string, companyName = `Brand ${id}`): Deal["brand"] => ({
  _id: id,
  companyName,
  logo: "https://example.com/logo.png",
  themeColor: "#449EB2",
  category: "Retail",
});

const deal = (overrides: Partial<Deal> = {}): Deal => ({
  _id: "deal-1",
  title: "Exclusive deal from Dawlance",
  description: "",
  discountPercentage: 15,
  discountAmount: null,
  minimumPurchase: null,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  brand: brand("brand-1"),
  isAvailed: false,
  code: null,
  soldOut: false,
  ...overrides,
});

describe("isDealExpired", () => {
  it("is false for a deal ending in the future", () => {
    expect(isDealExpired(deal({ endDate: "2026-12-31" }), NOW)).toBe(false);
  });

  it("is true for a deal whose end date has passed", () => {
    expect(isDealExpired(deal({ endDate: "2026-01-01" }), NOW)).toBe(true);
  });

  // Deals are not required to be date-bounded, unlike campaign coupons.
  it("is false when there is no end date", () => {
    expect(isDealExpired(deal({ endDate: null }), NOW)).toBe(false);
  });

  it("is false for an unparseable end date rather than hiding the deal", () => {
    expect(isDealExpired(deal({ endDate: "not a date" }), NOW)).toBe(false);
  });
});

describe("isDealClaimable", () => {
  it("is true for a live, unclaimed, in-stock deal", () => {
    expect(isDealClaimable(deal(), NOW)).toBe(true);
  });

  it("is false once the user has claimed it", () => {
    expect(isDealClaimable(deal({ isAvailed: true }), NOW)).toBe(false);
  });

  // Every code goes to exactly one user, so a deal can genuinely run out.
  it("is false when the deal is sold out", () => {
    expect(isDealClaimable(deal({ soldOut: true }), NOW)).toBe(false);
  });

  it("is false when the deal has expired", () => {
    expect(isDealClaimable(deal({ endDate: "2026-01-01" }), NOW)).toBe(false);
  });
});

describe("partitionDeals", () => {
  it("splits claimable deals from claimed, sold-out and expired ones", () => {
    const live = deal({ _id: "live" });
    const claimed = deal({ _id: "claimed", isAvailed: true });
    const soldOut = deal({ _id: "sold-out", soldOut: true });
    const expired = deal({ _id: "expired", endDate: "2026-01-01" });

    const { available, used } = partitionDeals(
      [live, claimed, soldOut, expired],
      NOW,
    );

    expect(available.map((d) => d._id)).toEqual(["live"]);
    expect(used.map((d) => d._id)).toEqual(["claimed", "sold-out", "expired"]);
  });

  it("returns empty buckets for an empty list", () => {
    expect(partitionDeals([], NOW)).toEqual({ available: [], used: [] });
  });
});

describe("dealCtaLabel", () => {
  it("offers an unclaimed deal", () => {
    expect(dealCtaLabel(deal(), NOW)).toBe("Avail Offer");
  });

  it("reads Used once claimed", () => {
    expect(dealCtaLabel(deal({ isAvailed: true }), NOW)).toBe("Used");
  });

  it("reads Sold Out when the inventory is gone", () => {
    expect(dealCtaLabel(deal({ soldOut: true }), NOW)).toBe("Sold Out");
  });

  it("reads Expired past the end date", () => {
    expect(dealCtaLabel(deal({ endDate: "2026-01-01" }), NOW)).toBe("Expired");
  });

  // A claimed deal that also sold out is still the user's own claim.
  it("prefers Used over Sold Out", () => {
    expect(dealCtaLabel(deal({ isAvailed: true, soldOut: true }), NOW)).toBe(
      "Used",
    );
  });
});

describe("groupDealsByBrand", () => {
  it("groups deals under their brand in first-appearance order", () => {
    const a1 = deal({ _id: "a1", brand: brand("a", "Alpha") });
    const b1 = deal({ _id: "b1", brand: brand("b", "Beta") });
    const a2 = deal({ _id: "a2", brand: brand("a", "Alpha") });

    const groups = groupDealsByBrand([a1, b1, a2]);

    expect(groups.map((g) => g._id)).toEqual(["a", "b"]);
    expect(groups[0].companyName).toBe("Alpha");
    expect(groups[0].deals.map((d) => d._id)).toEqual(["a1", "a2"]);
    expect(groups[1].deals.map((d) => d._id)).toEqual(["b1"]);
  });

  it("returns no brands for no deals — a brand with nothing live does not appear", () => {
    expect(groupDealsByBrand([])).toEqual([]);
  });
});

describe("mergeBrandsWithDeals", () => {
  it("keeps an approved brand that has no deals", () => {
    const merged = mergeBrandsWithDeals([brand("a", "Alpha")], []);

    expect(merged.map((b) => b._id)).toEqual(["a"]);
    expect(merged[0].deals).toEqual([]);
  });

  it("attaches each brand's own deals", () => {
    const a1 = deal({ _id: "a1", brand: brand("a") });
    const a2 = deal({ _id: "a2", brand: brand("a") });
    const b1 = deal({ _id: "b1", brand: brand("b") });

    const merged = mergeBrandsWithDeals(
      [brand("a", "Alpha"), brand("b", "Beta"), brand("c", "Gamma")],
      [a1, b1, a2],
    );

    expect(merged.map((b) => b._id)).toEqual(["a", "b", "c"]);
    expect(merged[0].deals.map((d) => d._id)).toEqual(["a1", "a2"]);
    expect(merged[1].deals.map((d) => d._id)).toEqual(["b1"]);
    expect(merged[2].deals).toEqual([]);
  });

  it("follows the brands payload order, not the order deals arrive in", () => {
    const merged = mergeBrandsWithDeals(
      [brand("b", "Beta"), brand("a", "Alpha")],
      [deal({ _id: "a1", brand: brand("a") })],
    );

    expect(merged.map((b) => b._id)).toEqual(["b", "a"]);
  });

  it("prefers the brand record over the copy denormalised onto a deal", () => {
    const merged = mergeBrandsWithDeals(
      [brand("a", "Renamed Alpha")],
      [deal({ _id: "a1", brand: brand("a", "Stale Alpha") })],
    );

    expect(merged[0].companyName).toBe("Renamed Alpha");
  });

  it("appends a brand that only the deals payload knows about", () => {
    const merged = mergeBrandsWithDeals(
      [brand("a", "Alpha")],
      [deal({ _id: "z1", brand: brand("z", "Zeta") })],
    );

    expect(merged.map((b) => b._id)).toEqual(["a", "z"]);
    expect(merged[1].deals.map((d) => d._id)).toEqual(["z1"]);
  });

  it("renders a duplicated brand once, without duplicating its deals", () => {
    const merged = mergeBrandsWithDeals(
      [brand("a", "Alpha"), brand("a", "Alpha")],
      [deal({ _id: "a1", brand: brand("a") })],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].deals.map((d) => d._id)).toEqual(["a1"]);
  });

  it("falls back to the deals payload when no brands are loaded", () => {
    const a1 = deal({ _id: "a1", brand: brand("a", "Alpha") });

    expect(mergeBrandsWithDeals([], [a1])).toEqual(groupDealsByBrand([a1]));
  });
});
