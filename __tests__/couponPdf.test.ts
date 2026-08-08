import { describe, expect, it } from "@jest/globals";
import type { Deal } from "@/store/store";
import { buildCouponHtml } from "@/utils/couponHtml";

/**
 * The printable voucher a claimed Deal produces. The template itself is
 * unchanged from the campaign-coupon era — same A4 layout, same hero, seal,
 * code box and terms — so these assertions are about the Deal's data reaching
 * the right slots.
 *
 * downloadCoupon claims the code BEFORE rendering this, so `code` here is
 * always one the backend actually issued.
 */

const deal = (overrides: Partial<Deal> = {}): Deal => ({
  _id: "665f1e2a9c4b3d2a1e8f7a6b",
  title: "Exclusive deal from Dawlance",
  description: "",
  discountPercentage: 15,
  discountAmount: null,
  minimumPurchase: null,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  brand: {
    _id: "brand-1",
    companyName: "Dawlance",
    logo: "https://example.com/logo.png",
    themeColor: "#449EB2",
    category: "Retail",
  },
  isAvailed: true,
  code: "FLOW-001",
  soldOut: false,
  ...overrides,
});

describe("buildCouponHtml", () => {
  it("prints the issued code in the code box", () => {
    const html = buildCouponHtml(deal(), "FLOW-001", "8F7A6B");

    expect(html).toContain("COUPON CODE");
    expect(html).toContain('<div class="code-value">FLOW-001</div>');
  });

  it("renders a percentage deal as the big headline", () => {
    const html = buildCouponHtml(deal({ discountPercentage: 15 }), "C", "R");

    expect(html).toContain('<h1 class="offer-headline">15<span class="pct">%</span></h1>');
    expect(html).toContain("off your next order");
  });

  // discountAmount could be displayed but never created before; a fixed-amount
  // deal must not render a blank headline.
  it("renders a fixed-amount deal instead of an empty percentage", () => {
    const html = buildCouponHtml(
      deal({ discountPercentage: null, discountAmount: 500 }),
      "C",
      "R",
    );

    expect(html).toContain("Rs 500 off");
    expect(html).not.toContain('<span class="pct">%</span>');
  });

  it("falls back to the deal title when it is neither", () => {
    const html = buildCouponHtml(
      deal({ discountPercentage: null, discountAmount: null }),
      "C",
      "R",
    );

    expect(html).toContain("Exclusive deal from Dawlance");
  });

  it("states the minimum purchase in the terms when the deal has one", () => {
    const html = buildCouponHtml(deal({ minimumPurchase: 2000 }), "C", "R");

    expect(html).toContain("Minimum purchase Rs 2000.");
  });

  it("omits the minimum-purchase sentence when there is none", () => {
    expect(buildCouponHtml(deal(), "C", "R")).not.toContain("Minimum purchase");
  });

  it("carries the brand identity and expiry", () => {
    const html = buildCouponHtml(deal(), "C", "R");

    expect(html).toContain("DEAL FROM");
    expect(html).toContain("Dawlance");
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).toContain("December 31, 2026");
    expect(html).toContain("SINGLE USE");
  });

  // A deal need not be date-bounded, unlike a campaign coupon.
  it("omits the expiry block for a deal with no end date", () => {
    const html = buildCouponHtml(deal({ endDate: null }), "C", "R");

    expect(html).not.toContain("EXPIRES");
  });

  it("falls back to a lettermark when the brand has no logo", () => {
    const html = buildCouponHtml(
      deal({ brand: { _id: "b", companyName: "Dawlance" } }),
      "C",
      "R",
    );

    expect(html).toContain('class="brand-logo is-placeholder">D<');
  });
});
