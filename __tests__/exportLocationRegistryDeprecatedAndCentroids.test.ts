/**
 * P3.1 artifact extension: `deprecatedSubAreas` and `areaCentroids`, the two
 * datasets the backend's location-backfill-audit script needs that the
 * original registry export (IMPORTANT-3) did not carry.
 *
 * `exportLocationRegistry.test.ts` already asserts the whole artifact
 * (these two fields included) is deep-equal to the committed fixture and
 * byte-stable. This file asserts the CONTENT is actually right — that
 * `buildDeprecatedSubAreas` reconstructs the app's private
 * `DEPRECATED_SUB_AREA_VALUES` correctly via the public
 * `getSubAreasForTown`/`getSelectableSubAreasForTown` surface, and that
 * `buildAreaCentroids` copies `AREA_CENTROIDS`/`CITY_CENTROIDS` verbatim
 * (whatever their current contents — empty today, real once P0.1a ships).
 */
import { describe, expect, it } from "@jest/globals";

import {
  buildAreaCentroids,
  buildDeprecatedSubAreas,
  buildRegistry,
} from "../scripts/export_location_registry";
import {
  AREA_CENTROIDS,
  CITY_CENTROIDS,
  getSelectableSubAreasForTown,
  getSubAreasForTown,
  townHasSubAreas,
} from "../utils/pakistan_areas";

describe("buildDeprecatedSubAreas", () => {
  it("matches the app's own deprecated/selectable sub-area accessors for a known town", () => {
    const deprecated = buildDeprecatedSubAreas();

    // Karachi::PECHS deprecates two road names (utils/pakistan_areas.ts).
    expect(deprecated["Karachi::PECHS"]).toEqual(
      ["Khalid Bin Walid Road", "Tariq Road"].sort(),
    );
  });

  it("returns sorted arrays", () => {
    const deprecated = buildDeprecatedSubAreas();
    for (const [key, values] of Object.entries(deprecated)) {
      expect(values).toEqual([...values].sort());
      expect(key).toContain("::");
    }
  });

  it("omits any town with nothing deprecated", () => {
    const deprecated = buildDeprecatedSubAreas();
    // Karachi::Landhi has sub-area data and nothing hidden from it.
    expect(deprecated["Karachi::Landhi"]).toBeUndefined();
  });

  it("agrees with getSubAreasForTown minus getSelectableSubAreasForTown for every entry it emits", () => {
    const deprecated = buildDeprecatedSubAreas();
    for (const key of Object.keys(deprecated)) {
      const [city, town] = key.split("::");
      expect(townHasSubAreas(city, town)).toBe(true);

      const all = new Set(getSubAreasForTown(city, town));
      const selectable = new Set(getSelectableSubAreasForTown(city, town));
      const expected = [...all].filter((v) => !selectable.has(v)).sort();

      expect(deprecated[key]).toEqual(expected);
    }
  });
});

describe("buildAreaCentroids", () => {
  it("copies AREA_CENTROIDS and CITY_CENTROIDS verbatim", () => {
    const centroids = buildAreaCentroids();
    expect(centroids.areas).toEqual(AREA_CENTROIDS);
    expect(centroids.cities).toEqual(CITY_CENTROIDS);
  });

  it("always has both keys present, even when both maps are empty", () => {
    const centroids = buildAreaCentroids();
    expect(centroids).toHaveProperty("areas");
    expect(centroids).toHaveProperty("cities");
    expect(typeof centroids.areas).toBe("object");
    expect(typeof centroids.cities).toBe("object");
  });
});

describe("buildRegistry — extended fields", () => {
  it("includes deprecatedSubAreas and areaCentroids alongside the existing cities map", () => {
    const registry = buildRegistry();
    expect(registry.deprecatedSubAreas).toEqual(buildDeprecatedSubAreas());
    expect(registry.areaCentroids).toEqual(buildAreaCentroids());
    // The pre-existing shape is untouched.
    expect(registry.version).toBe(1);
    expect(typeof registry.cities).toBe("object");
  });
});
