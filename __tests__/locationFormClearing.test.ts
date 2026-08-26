/**
 * The city/town clearing asymmetry (P2-15).
 *
 * These two objects ARE the decision about what a place change invalidates, and
 * every path that changes a place spreads one of them. Asserting on them
 * directly is how the rule stays testable without a renderer — this repo has no
 * component-test harness, and the four town paths have historically drifted.
 */

import { describe, expect, it } from "@jest/globals";
import {
  CLEARED_BY_CITY_CHANGE,
  CLEARED_BY_TOWN_CHANGE,
} from "@/hooks/useLocationForm";

describe("CLEARED_BY_TOWN_CHANGE", () => {
  it("clears the town, its Other escape and the sub-area", () => {
    expect(CLEARED_BY_TOWN_CHANGE).toEqual({
      town: "",
      townOther: "",
      subArea: "",
      subAreaOther: "",
    });
  });

  it("KEEPS the pin — owner ruling, 2026-08-26", () => {
    // It used to clear it, from when the town was chosen BEFORE the pin. Under
    // Province -> City -> Pin the pin is placed first and PRODUCES the town, so
    // clearing it on a town edit destroyed the source of the value being
    // corrected and left no way to save a town the geocoder disagreed with.
    expect(CLEARED_BY_TOWN_CHANGE).not.toHaveProperty("latitude");
    expect(CLEARED_BY_TOWN_CHANGE).not.toHaveProperty("longitude");
  });

  it("KEEPS the house number — it is relative to an area, not wrong within one", () => {
    expect(CLEARED_BY_TOWN_CHANGE).not.toHaveProperty("houseNo");
  });

  it("does not touch the city", () => {
    expect(CLEARED_BY_TOWN_CHANGE).not.toHaveProperty("city");
  });
});

describe("CLEARED_BY_CITY_CHANGE", () => {
  it("clears everything a town change clears", () => {
    expect(CLEARED_BY_CITY_CHANGE).toMatchObject(CLEARED_BY_TOWN_CHANGE);
  });

  it("also clears the house number (P2-15)", () => {
    expect(CLEARED_BY_CITY_CHANGE.houseNo).toBe("");
  });

  it("adds the pin and the house number on top of the town set", () => {
    const extra = Object.keys(CLEARED_BY_CITY_CHANGE)
      .filter((k) => !(k in CLEARED_BY_TOWN_CHANGE))
      .sort();
    // A different city makes the coordinate provably wrong, which a different
    // town within one city does not — that asymmetry IS the ruling.
    expect(extra).toEqual(["houseNo", "latitude", "longitude"]);
  });

  it("still clears the pin", () => {
    expect(CLEARED_BY_CITY_CHANGE.latitude).toBe("");
    expect(CLEARED_BY_CITY_CHANGE.longitude).toBe("");
  });

  it("leaves the city itself to the caller, which assigns it after the spread", () => {
    expect(CLEARED_BY_CITY_CHANGE).not.toHaveProperty("city");
  });
});
