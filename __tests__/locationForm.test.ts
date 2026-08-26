/**
 * P2.1 — searchable pickers + province removal. Pins the form-shaping rules
 * that no longer have a UI to ask them: which cities are offered (all of them,
 * province-independent), which towns are offered (selectable only), and what
 * `province` value leaves the client now that nobody picks it.
 */
import { describe, expect, it, jest } from "@jest/globals";
import {
  ALL_CITIES,
  OTHER_OPTION,
  buildTownOptions,
  getAllCities,
  getSelectionRegion,
  resolveProvinceForPayload,
} from "@/utils/locationForm";
import {
  PAKISTAN_LOCATIONS,
  getSelectableTownsForCity,
  isDeprecatedTown,
  requiresSubArea,
} from "@/utils/pakistan_areas";
import { isProfileComplete } from "@/utils/profile";

describe("getAllCities", () => {
  it("contains every city from every province exactly once", () => {
    const expected = Object.values(PAKISTAN_LOCATIONS.cities).flat();
    expect(getAllCities()).toHaveLength(expected.length);
    expect(new Set(getAllCities()).size).toBe(expected.length);
    for (const city of expected) expect(getAllCities()).toContain(city);
  });

  it("is sorted, so the searchable picker reads predictably", () => {
    const sorted = [...ALL_CITIES].sort((a, b) => a.localeCompare(b));
    expect(ALL_CITIES).toEqual(sorted);
  });

  it("is not scoped by province — the province dropdown is gone", () => {
    // Cities from at least two different provinces are offered together.
    expect(getAllCities()).toContain("Karachi"); // Sindh
    expect(getAllCities()).toContain("Lahore"); // Punjab
  });
});

describe("buildTownOptions", () => {
  it("returns nothing until a city is chosen", () => {
    expect(buildTownOptions("")).toEqual([]);
    expect(buildTownOptions("   ")).toEqual([]);
  });

  it("offers the selectable towns plus the Other escape, in that order", () => {
    const towns = getSelectableTownsForCity("Karachi");
    expect(buildTownOptions("Karachi")).toEqual([...towns, OTHER_OPTION]);
  });

  it("never offers a deprecated town", () => {
    const options = buildTownOptions("Karachi");
    // "Bahadurabad" was re-parented under Jamshed Town; still valid on stored
    // profiles, but must not be re-selectable.
    expect(isDeprecatedTown("Karachi", "Bahadurabad")).toBe(true);
    expect(options).not.toContain("Bahadurabad");
  });

  it("gives an unknown city just the Other escape rather than throwing", () => {
    expect(buildTownOptions("Nowhereabad")).toEqual([OTHER_OPTION]);
  });
});

describe("resolveProvinceForPayload", () => {
  it("derives the province from the city", () => {
    expect(resolveProvinceForPayload("Karachi")).toBe("Sindh");
    expect(resolveProvinceForPayload("Lahore")).toBe("Punjab");
  });

  it("derives a province for every offered city — no city can strand a save", () => {
    for (const city of getAllCities()) {
      expect(resolveProvinceForPayload(city)).not.toBe("");
    }
  });

  it("returns \"\" for a city outside the registry (the P0.2d null path)", () => {
    expect(resolveProvinceForPayload("Nowhereabad")).toBe("");
    expect(resolveProvinceForPayload("")).toBe("");
  });

  // Issue 8: "" here overwrote a legacy user's stored province on every save,
  // so they came out of an edit less complete than they went in.
  it("falls back for an off-registry city rather than wiping the stored value", () => {
    expect(resolveProvinceForPayload("Nowhereabad", "Sindh")).toBe("Sindh");
    expect(resolveProvinceForPayload("Nowhereabad", "  Sindh  ")).toBe("Sindh");
  });

  it("still lets the registry win over a fallback that disagrees", () => {
    expect(resolveProvinceForPayload("Lahore", "Sindh")).toBe("Punjab");
  });

  it("yields \"\" when neither the registry nor the fallback knows", () => {
    expect(resolveProvinceForPayload("Nowhereabad", "")).toBe("");
    expect(resolveProvinceForPayload("Nowhereabad", "   ")).toBe("");
  });
});

describe("province removal keeps isProfileComplete satisfiable", () => {
  it("a city-picked save still counts as complete", () => {
    // A town with no sub-area requirement, so the fixture stays minimal.
    // Picked from the registry rather than hard-coded: which towns require a
    // sub-area is curated data that moves.
    const city = "Lahore";
    const town = getSelectableTownsForCity(city).find(
      (t) => !requiresSubArea(city, t),
    )!;
    expect(town).toBeDefined();
    expect(
      isProfileComplete({
        phone: "03001234567",
        province: resolveProvinceForPayload(city),
        city,
        town,
        subArea: "",
        subAreaOther: "",
        // Required since the coordinate became part of completeness.
        latitude: "31.5204",
        longitude: "74.3587",
        address: "12 Main Street",
        // Required since the house number became part of completeness
        // (owner ruling, 2026-08-25).
        structuredAddress: { houseNo: "12" },
      } as any),
    ).toBe(true);
  });

  it("is still false when the derived province comes back empty", () => {
    // Guards the null path: an off-registry city must not silently look complete.
    expect(
      isProfileComplete({
        phone: "03001234567",
        province: resolveProvinceForPayload("Nowhereabad"),
        city: "Nowhereabad",
        town: "",
        townOther: "Somewhere",
      } as any),
    ).toBe(false);
  });
});

describe("getSelectionRegion", () => {
  it("returns null when no city is chosen", () => {
    expect(getSelectionRegion("", "")).toBeNull();
    expect(getSelectionRegion(undefined, undefined)).toBeNull();
    expect(getSelectionRegion("   ", "DHA")).toBeNull();
  });

  it("opens on the area when the registry has its centroid", () => {
    // This replaces the tripwire that asserted null everywhere while
    // CITY_CENTROIDS and AREA_CENTROIDS were empty. The dataset landed
    // (P2-6), the tripwire fired, and the fallback assumptions were revisited
    // here on purpose — which is exactly what it was for.
    const region = getSelectionRegion("Karachi", "DHA");
    expect(region).not.toBeNull();
    // DHA Karachi, to within a viewport. Asserted loosely: the value is
    // regenerated from a geocoder sweep, so pinning six decimals here would
    // make every refresh of the dataset a test edit.
    expect(region!.latitude).toBeCloseTo(24.81, 1);
    expect(region!.longitude).toBeCloseTo(67.08, 1);
  });

  it("still falls back to null for a name the sweep could not confirm", () => {
    // Coverage is partial by design — every name the two providers disagreed
    // about was dropped. A free-text town has no registry key at all, so this
    // path is live and the caller must keep handling it.
    expect(getSelectionRegion("Karachi", "Not A Real Town")).not.toBeNull(); // city rung answers
    expect(getSelectionRegion("Nowhereabad", "Anywhere")).toBeNull();
  });

  it("puts latitude and longitude the right way round", () => {
    // The registry stores [lng, lat]; a region reads latitude first. Proven
    // through the real accessor by stubbing the registry's centroid table.
    jest.isolateModules(() => {
      jest.doMock("@/utils/pakistan_areas", () => {
        const actual = jest.requireActual<typeof import("@/utils/pakistan_areas")>(
          "@/utils/pakistan_areas",
        );
        return {
          ...actual,
          // Karachi: 67.0 East, 24.86 North.
          getCityCentroid: () => [67.0011, 24.8607] as const,
          getAreaCentroid: () => null,
        };
      });
      const { getSelectionRegion: subject } =
        require("@/utils/locationForm") as typeof import("@/utils/locationForm");

      const region = subject("Karachi", "");
      expect(region).not.toBeNull();
      // Latitude is the ~24 value, not the ~67 one. Swapped, this lands in
      // Somalia and nothing else in the app would notice.
      expect(region!.latitude).toBeCloseTo(24.8607, 4);
      expect(region!.longitude).toBeCloseTo(67.0011, 4);
    });
  });

  it("zooms tighter for an area centroid than for a city one", () => {
    jest.isolateModules(() => {
      jest.doMock("@/utils/pakistan_areas", () => {
        const actual = jest.requireActual<typeof import("@/utils/pakistan_areas")>(
          "@/utils/pakistan_areas",
        );
        return {
          ...actual,
          getAreaCentroid: () => [67.03, 24.8] as const,
          getCityCentroid: () => [67.0011, 24.8607] as const,
        };
      });
      const { getSelectionRegion: subject } =
        require("@/utils/locationForm") as typeof import("@/utils/locationForm");

      const area = subject("Karachi", "DHA")!;
      expect(area.latitudeDelta).toBeLessThan(0.2);
      // An area centroid wins over the city one — it is the better guess.
      expect(area.longitude).toBeCloseTo(67.03, 4);
    });
  });
});
