/**
 * Whether a GPS fix is allowed to move the camera off the selected city.
 *
 * The map opens on the city centroid, then asks for a fix. A fix is the best
 * possible viewport for someone standing at the address they are entering, and
 * a bad one for anyone else — a relative's address, a trip, or a simulator,
 * whose default fix is in California. That last case is what surfaced this:
 * the camera flew from Karachi to Cupertino on every open.
 */
import { describe, expect, it } from "@jest/globals";
import { isFixWithinCity } from "@/utils/locationForm";

const KARACHI = { lat: 24.8607, lng: 67.0011 };
const LAHORE = { lat: 31.5497, lng: 74.3436 };
const CUPERTINO = { lat: 37.3349, lng: -122.009 };

describe("isFixWithinCity", () => {
  it("accepts a fix in the selected city", () => {
    expect(isFixWithinCity(KARACHI.lat, KARACHI.lng, "Karachi")).toBe(true);
  });

  it("accepts a fix across a large city — 60km covers Karachi end to end", () => {
    // Gulshan-e-Hadeed, the far south-east industrial edge.
    expect(isFixWithinCity(24.8, 67.35, "Karachi")).toBe(true);
  });

  it("rejects a fix in a different Pakistani city", () => {
    expect(isFixWithinCity(LAHORE.lat, LAHORE.lng, "Karachi")).toBe(false);
  });

  it("rejects the simulator's default fix", () => {
    // The actual bug: an iOS Simulator reports Apple HQ unless told otherwise.
    expect(isFixWithinCity(CUPERTINO.lat, CUPERTINO.lng, "Karachi")).toBe(false);
  });

  it("accepts anything when no city is selected", () => {
    // Nothing to judge against, and the only alternative viewport is the whole
    // country — which a fix beats wherever it is.
    expect(isFixWithinCity(CUPERTINO.lat, CUPERTINO.lng, "")).toBe(true);
    expect(isFixWithinCity(CUPERTINO.lat, CUPERTINO.lng, undefined)).toBe(true);
  });

  it("accepts anything for a city the sweep never confirmed", () => {
    // Hub and Kotli were rejected by the centroid sweep, so they have no
    // centroid to compare against and keep the pre-centroid behaviour.
    expect(isFixWithinCity(CUPERTINO.lat, CUPERTINO.lng, "Hub")).toBe(true);
    expect(isFixWithinCity(CUPERTINO.lat, CUPERTINO.lng, "Nowhereabad")).toBe(true);
  });

  it("rejects a non-finite fix rather than treating it as valid", () => {
    expect(isFixWithinCity(NaN, 67, "Karachi")).toBe(false);
    expect(isFixWithinCity(24.86, Infinity, "Karachi")).toBe(false);
  });
});
