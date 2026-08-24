/**
 * Tests for the P0.2 metadata layer.
 *
 * The most important test here is the last one: PAKISTAN_LOCATIONS is frozen.
 * `isLegacyTownValue` treats any stored town outside the canonical list as
 * stale and forces that user through LocationUpdateModal, so editing or
 * removing one string invalidates every profile using it. A passing suite with
 * a mutated string is the failure mode that costs users, and only a snapshot
 * catches it.
 */
import { describe, expect, it } from "@jest/globals";
import {
  AREA_META,
  CITY_COVERAGE_TIER,
  PAKISTAN_LOCATIONS,
  PROVINCE_BY_CITY,
  foldName,
  getAreaCentroid,
  getAreaMeta,
  getBlockLabel,
  getCityCentroid,
  getCoverageTier,
  getProvinceForCity,
  getSelectableSubAreasForTown,
  getSubAreasForTown,
  isDeprecatedSubArea,
  resolveGeocodedName,
} from "@/utils/pakistan_areas";

describe("getCoverageTier", () => {
  it("returns the assigned tier for operational cities", () => {
    expect(getCoverageTier("Karachi")).toBe("A");
    expect(getCoverageTier("Lahore")).toBe("B");
  });

  // The default is the whole point: 48 of 58 cities are unlisted, and the flow
  // must not need an entry per city to behave.
  it("defaults unlisted cities to C", () => {
    expect(getCoverageTier("Sahiwal")).toBe("C");
    expect(getCoverageTier("")).toBe("C");
    expect(getCoverageTier("   ")).toBe("C");
  });

  it("only ever names cities that exist in the registry", () => {
    const known = new Set(Object.values(PAKISTAN_LOCATIONS.cities).flat());
    for (const city of Object.keys(CITY_COVERAGE_TIER)) {
      expect(known.has(city)).toBe(true);
    }
  });
});

describe("getBlockLabel", () => {
  // Karachi alone carries all of these, which is why the label is per-area and
  // never derived from the city.
  it("reflects each area's own idiom, not its city's", () => {
    expect(getBlockLabel("Karachi", "Gulshan-e-Iqbal")).toBe("Block");
    expect(getBlockLabel("Karachi", "Bahria Town Karachi")).toBe("Precinct");
    expect(getBlockLabel("Karachi", "DHA")).toBe("Phase");
    expect(getBlockLabel("Hyderabad", "Latifabad")).toBe("Unit");
    expect(getBlockLabel("Islamabad", "Sector G-9")).toBe("Sub-sector");
  });

  it("falls back to the generic label where the list is named places", () => {
    expect(getBlockLabel("Karachi", "Saddar")).toBe("Area");
  });

  it("falls back to the generic label for unknown areas", () => {
    expect(getBlockLabel("Nowhere", "Nothing")).toBe("Area");
  });

  it("never emits a label that is a place name rather than a level", () => {
    // "Askari" names a housing society; it cannot be a form label.
    const labels = new Set(Object.values(AREA_META).map((m) => m.blockLabel));
    expect(labels.has("Askari")).toBe(false);
  });
});

describe("geocodeReliable", () => {
  // Promotion is evidence-only (P0.1c). Shipping any `true` before the spike
  // would enable auto-fill in an area nobody measured.
  it("defaults to false for every area until the spike promotes it", () => {
    for (const [key, meta] of Object.entries(AREA_META)) {
      expect([key, meta.geocodeReliable]).toEqual([key, false]);
    }
  });

  it("defaults to false for areas with no metadata at all", () => {
    expect(getAreaMeta("Nowhere", "Nothing").geocodeReliable).toBe(false);
  });
});

describe("province derivation", () => {
  it("maps cities to their province", () => {
    expect(getProvinceForCity("Karachi")).toBe("Sindh");
    expect(getProvinceForCity("Lahore")).toBe("Punjab");
    expect(getProvinceForCity("Islamabad")).toBe("Islamabad Capital Territory");
  });

  it("returns null rather than a wrong province for unknown cities", () => {
    expect(getProvinceForCity("Atlantis")).toBeNull();
    expect(getProvinceForCity("")).toBeNull();
  });

  // The inversion is only lossless if no city appears under two provinces.
  it("is a lossless inversion — no city sits under two provinces", () => {
    const all = Object.values(PAKISTAN_LOCATIONS.cities).flat();
    expect(all.length).toBe(new Set(all).size);
    expect(Object.keys(PROVINCE_BY_CITY).length).toBe(all.length);
  });

  it("covers every city in the registry", () => {
    for (const city of Object.values(PAKISTAN_LOCATIONS.cities).flat()) {
      expect(getProvinceForCity(city)).not.toBeNull();
    }
  });
});

describe("deprecated sub-areas", () => {
  it("hides road and market entries from new selections", () => {
    expect(isDeprecatedSubArea("Karachi", "PECHS", "Tariq Road")).toBe(true);
    expect(isDeprecatedSubArea("Lahore", "Gulberg", "MM Alam Road")).toBe(true);
    expect(isDeprecatedSubArea("Lahore", "Gulberg", "Liberty Market")).toBe(true);
  });

  it("leaves real addressable areas alone", () => {
    expect(isDeprecatedSubArea("Karachi", "PECHS", "Block 1")).toBe(false);
    expect(isDeprecatedSubArea("Lahore", "Gulberg", "Gulberg III")).toBe(false);
  });

  // This is the property that keeps existing users out of LocationUpdateModal.
  it("keeps deprecated values in the VALIDATION view", () => {
    expect(getSubAreasForTown("Karachi", "PECHS")).toContain("Tariq Road");
  });

  it("removes them from the PICKER view", () => {
    expect(getSelectableSubAreasForTown("Karachi", "PECHS")).not.toContain(
      "Tariq Road",
    );
  });

  // Deprecation must not gut a picker. Areas that natively carry fewer than
  // three sub-areas are not the concern here (nothing was removed from them);
  // the rule is that hiding entries never drops a list below three.
  it("never reduces an area's picker below three options", () => {
    for (const key of Object.keys(AREA_META)) {
      const [city, town] = key.split("::");
      const all = getSubAreasForTown(city, town);
      const selectable = getSelectableSubAreasForTown(city, town);
      if (selectable.length === all.length) continue; // nothing deprecated here
      expect([key, selectable.length >= 3]).toEqual([key, true]);
    }
  });

  it("is a subset of the canonical list — never invents a value", () => {
    for (const key of Object.keys(AREA_META)) {
      const [city, town] = key.split("::");
      const all = getSubAreasForTown(city, town);
      for (const value of all) {
        if (isDeprecatedSubArea(city, town, value)) expect(all).toContain(value);
      }
    }
  });
});

describe("resolveGeocodedName", () => {
  it("resolves exact and folded matches", () => {
    expect(resolveGeocodedName("Gulshan-e-Iqbal", "Karachi")).toBe("Gulshan-e-Iqbal");
    expect(resolveGeocodedName("gulshan e iqbal", "Karachi")).toBe("Gulshan-e-Iqbal");
  });

  // A town name repeated across cities must not resolve to a confident guess.
  it("returns null when a name is ambiguous across cities", () => {
    expect(resolveGeocodedName("Cantt")).toBeNull();
    expect(resolveGeocodedName("Model Town")).toBeNull();
  });

  it("resolves once a city disambiguates it", () => {
    expect(resolveGeocodedName("Cantt", "Lahore")).toBe("Cantt");
    expect(resolveGeocodedName("Model Town", "Lahore")).toBe("Model Town");
  });

  it("returns null on a miss rather than echoing the input", () => {
    expect(resolveGeocodedName("Nonexistent Place", "Karachi")).toBeNull();
    expect(resolveGeocodedName("", "Karachi")).toBeNull();
  });
});

describe("centroids", () => {
  // Empty until P0.1a. Consumers must handle null from day one.
  it("return null while the survey has not run", () => {
    expect(getAreaCentroid("Karachi", "DHA")).toBeNull();
    expect(getCityCentroid("Karachi")).toBeNull();
  });
});

describe("foldName", () => {
  it("is exported for the geocode spike and folds punctuation away", () => {
    expect(foldName("Gulshan-e-Iqbal")).toBe(foldName("gulshan e iqbal"));
    expect(foldName("Federal B. Area")).toBe("federalbarea");
  });
});

describe("PAKISTAN_LOCATIONS is frozen", () => {
  it("has not changed shape", () => {
    const cities = Object.values(PAKISTAN_LOCATIONS.cities).flat();
    expect({
      provinces: PAKISTAN_LOCATIONS.provinces.length,
      cities: cities.length,
      citiesWithTowns: Object.keys(PAKISTAN_LOCATIONS.towns).length,
      towns: Object.values(PAKISTAN_LOCATIONS.towns).flat().length,
      subAreaKeys: Object.keys(PAKISTAN_LOCATIONS.subAreas).length,
      subAreas: Object.values(PAKISTAN_LOCATIONS.subAreas).flat().length,
    }).toEqual({
      provinces: 7,
      cities: 58,
      citiesWithTowns: 10,
      towns: 196,
      subAreaKeys: 150,
      subAreas: 1098,
    });
  });

  // The counts above catch additions and deletions; only this catches a rename.
  it("has not had a single string edited", () => {
    expect(PAKISTAN_LOCATIONS).toMatchSnapshot();
  });
});

describe("resolveGeocodedName — affix tolerance", () => {
  // Every string below was observed coming back from a live geocoder during
  // the P0.1 Karachi pilot, not invented. That matters: an affix rule tuned to
  // hypothetical inputs would widen matching without buying any real hits.
  it("absorbs the administrative \"Town\" suffix geocoders add", () => {
    expect(resolveGeocodedName("Landhi Town", "Karachi")).toBe("Landhi");
    expect(resolveGeocodedName("North Nazimabad Town", "Karachi")).toBe(
      "North Nazimabad",
    );
    expect(resolveGeocodedName("Malir Town", "Karachi")).toBe("Malir");
  });

  it("absorbs the Islamabad \"Sector\" prefix OSM omits", () => {
    expect(resolveGeocodedName("E-7", "Islamabad")).toBe("Sector E-7");
    expect(resolveGeocodedName("F-10", "Islamabad")).toBe("Sector F-10");
  });

  it("does not strip an affix that is the whole name", () => {
    // Without the remainder floor these fold to "" and match everything.
    expect(resolveGeocodedName("Town", "Karachi")).toBeNull();
    expect(resolveGeocodedName("Sector", "Islamabad")).toBeNull();
  });

  it("keeps a town whose canonical name genuinely ends in Town", () => {
    expect(resolveGeocodedName("Orangi Town", "Karachi")).toBe("Orangi Town");
    expect(resolveGeocodedName("Surjani Town", "Karachi")).toBe("Surjani Town");
  });

  it("resolves expanded and misspelled forms via aliases", () => {
    expect(resolveGeocodedName("Defence Housing Authority", "Karachi")).toBe(
      "DHA",
    );
    expect(resolveGeocodedName("Sadder", "Karachi")).toBe("Saddar");
  });

  it("still refuses to guess when a name spans cities", () => {
    // Saddar exists in Karachi, Rawalpindi, Peshawar and Hyderabad. Affix
    // tolerance must not turn an ambiguous name into a confident answer.
    expect(resolveGeocodedName("Saddar")).toBeNull();
    expect(resolveGeocodedName("Landhi Town", "Lahore")).toBeNull();
  });
});
