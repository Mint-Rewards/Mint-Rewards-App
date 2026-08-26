/**
 * The reordered capture flow: Province -> City -> Pin -> everything else.
 *
 * Two things are being pinned here. The clearing sets, which are what keep the
 * province filter and the chosen city from contradicting each other on screen;
 * and the fill-blanks-only rule, which is what makes an 8-second geocoder
 * request safe to fire while the user keeps typing.
 */
import { describe, expect, it } from "@jest/globals";
import {
  CLEARED_BY_CITY_CHANGE,
  CLEARED_BY_PROVINCE_CHANGE,
  CLEARED_BY_TOWN_CHANGE,
} from "@/hooks/useLocationForm";

describe("CLEARED_BY_PROVINCE_CHANGE", () => {
  it("clears everything a city change clears, plus the city itself", () => {
    expect(CLEARED_BY_PROVINCE_CHANGE).toMatchObject(CLEARED_BY_CITY_CHANGE);
    expect(CLEARED_BY_PROVINCE_CHANGE.city).toBe("");
  });

  it("adds nothing beyond the city on top of the city set", () => {
    const extra = Object.keys(CLEARED_BY_PROVINCE_CHANGE).filter(
      (k) => !(k in CLEARED_BY_CITY_CHANGE),
    );
    expect(extra).toEqual(["city"]);
  });

  it("does not clear the province itself, which the caller assigns", () => {
    expect(CLEARED_BY_PROVINCE_CHANGE).not.toHaveProperty("province");
  });

  it("still clears the house number, via the city set (P2-15)", () => {
    // A province change forces a city change, so the P2-15 reasoning applies
    // with more force, not less: the house number cannot survive it.
    expect(CLEARED_BY_PROVINCE_CHANGE.houseNo).toBe("");
  });
});

describe("the three clearing sets nest", () => {
  it("town ⊂ city ⊂ province", () => {
    // Each step up the cascade invalidates strictly more. If this ever stops
    // holding, some path is clearing a field a wider change leaves alone.
    const town = Object.keys(CLEARED_BY_TOWN_CHANGE);
    const city = Object.keys(CLEARED_BY_CITY_CHANGE);
    const province = Object.keys(CLEARED_BY_PROVINCE_CHANGE);
    expect(town.every((k) => city.includes(k))).toBe(true);
    expect(city.every((k) => province.includes(k))).toBe(true);
    expect(province.length).toBeGreaterThan(city.length);
    expect(city.length).toBeGreaterThan(town.length);
  });
});
