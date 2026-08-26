/**
 * Province as a FILTER, not a field.
 *
 * P2.1 removed the province dropdown because an independently-chosen province
 * lets someone save Karachi/Punjab, a pair the registry says cannot exist. It
 * is back only to narrow the city list; `buildLocationPayload` still derives
 * the saved value from the city. These tests pin that distinction, and the
 * degrade-to-everything rule that keeps the picker from ever being empty.
 */
import { describe, expect, it } from "@jest/globals";
import {
  getAllCities,
  getAllProvinces,
  getCitiesForPicker,
  resolveProvinceForPayload,
} from "@/utils/locationForm";
import { getProvinceForCity } from "@/utils/pakistan_areas";

describe("getAllProvinces", () => {
  it("returns every province, sorted", () => {
    const provinces = getAllProvinces();
    expect(provinces.length).toBeGreaterThan(1);
    expect([...provinces].sort((a, b) => a.localeCompare(b))).toEqual(provinces);
  });

  it("covers every city — no city is unreachable through the filter", () => {
    // If a city's province were missing from the list, that city could only be
    // found by clearing the filter, which most users will not think to do.
    const reachable = new Set(getAllProvinces().flatMap(getCitiesForPicker));
    for (const city of getAllCities()) expect(reachable.has(city)).toBe(true);
  });
});

describe("getCitiesForPicker", () => {
  it("narrows to the province's own cities", () => {
    const sindh = getCitiesForPicker("Sindh");
    expect(sindh).toContain("Karachi");
    expect(sindh).not.toContain("Lahore");
  });

  it("offers every city when no province is chosen", () => {
    expect(getCitiesForPicker("")).toEqual(getAllCities());
    expect(getCitiesForPicker(undefined)).toEqual(getAllCities());
  });

  it("degrades to every city for a province the registry does not know", () => {
    // Never an empty picker: that is a dead end the user cannot get out of.
    expect(getCitiesForPicker("Atlantis")).toEqual(getAllCities());
  });

  it("returns each province's cities sorted", () => {
    const punjab = getCitiesForPicker("Punjab");
    expect([...punjab].sort((a, b) => a.localeCompare(b))).toEqual(punjab);
  });
});

describe("the filter cannot create an impossible pair", () => {
  it("every offered city derives back to the province that offered it", () => {
    for (const province of getAllProvinces()) {
      for (const city of getCitiesForPicker(province)) {
        expect(getProvinceForCity(city)).toBe(province);
      }
    }
  });

  it("the SAVED province still comes from the city, never from the filter", () => {
    // The whole reason the field was removed. Picking "Punjab" and then
    // Karachi cannot persist Karachi/Punjab, because nothing saves the filter.
    expect(resolveProvinceForPayload("Karachi")).toBe("Sindh");
  });
});
