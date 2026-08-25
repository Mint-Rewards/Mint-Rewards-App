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
import baseline from "./fixtures/pakistan_locations_baseline.json";
import {
  AREA_META,
  CITY_COVERAGE_TIER,
  PAKISTAN_LOCATIONS,
  PROVINCE_BY_CITY,
  foldName,
  getAreaCentroid,
  getAreaMeta,
  getBlockLabel,
  getHouseNoField,
  getCityCentroid,
  getCoverageTier,
  getProvinceForCity,
  getSelectableSubAreasForTown,
  getSubAreasForTown,
  isLegacyTownValue,
  isCanonicalTown,
  getTownsForCity,
  isCoarseAdminUnit,
  isDeprecatedSubArea,
  isDeprecatedTown,
  getSelectableTownsForCity,
  COARSE_ADMIN_UNITS,
  DEPRECATED_TOWNS,
  isResidentialArea,
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

describe("geocodePrefill", () => {
  // Promotion is evidence-only (P0.1c). Shipping any `true` before the spike
  // would enable auto-fill in an area nobody measured.
  it("defaults to false for every area until the spike promotes it", () => {
    for (const [key, meta] of Object.entries(AREA_META)) {
      expect([key, meta.geocodePrefill]).toEqual([key, false]);
    }
  });

  it("defaults to false for areas with no metadata at all", () => {
    expect(getAreaMeta("Nowhere", "Nothing").geocodePrefill).toBe(false);
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
  // The baseline is a committed copy of the registry, captured before P0.6
  // began adding to it. It exists because the invariant here is one-directional
  // and an exact-equality check cannot express it: ADDING a town is routine and
  // safe, while editing or removing one invalidates every profile holding that
  // string and force-marches those users through LocationUpdateModal.
  //
  // A snapshot conflates the two. Any addition makes it fail, the fix is to
  // regenerate, and a rename hidden in the same commit is regenerated right
  // along with it — the guard quietly approves the one thing it was built to
  // catch. A subset assertion cannot be satisfied that way.
  it("has never edited or deleted a string", () => {
    expect(PAKISTAN_LOCATIONS.provinces).toEqual(
      expect.arrayContaining(baseline.provinces),
    );

    for (const [province, cities] of Object.entries(baseline.cities)) {
      expect(PAKISTAN_LOCATIONS.cities[province]).toEqual(
        expect.arrayContaining(cities),
      );
    }

    for (const [city, towns] of Object.entries(baseline.towns)) {
      expect([city, PAKISTAN_LOCATIONS.towns[city]]).toEqual([
        city,
        expect.arrayContaining(towns),
      ]);
    }

    for (const [key, subAreas] of Object.entries(baseline.subAreas)) {
      expect([key, PAKISTAN_LOCATIONS.subAreas[key]]).toEqual([
        key,
        expect.arrayContaining(subAreas),
      ]);
    }
  });

  // The subset check above permits additions by design, so on its own it would
  // let an accidental one through — a stray paste, a merge artefact. This is
  // the deliberate half: the counts move only when someone means them to.
  it("has grown only where declared", () => {
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
      towns: 260,   // 196 + 56 from the P0.6 Karachi expansion
      subAreaKeys: 150,
      subAreas: 1100,   // +2: Data Nagar -> Orangi Town, Shanti Nagar -> Gulshan-e-Iqbal
    });
  });

  it("never lets a town appear twice in one city", () => {
    for (const [city, towns] of Object.entries(PAKISTAN_LOCATIONS.towns)) {
      expect([city, new Set(towns).size]).toEqual([city, towns.length]);
    }
  });

  // A new town whose folded name collides with an existing one in the same city
  // makes `resolveGeocodedName` ambiguous forever after, and neither string can
  // be edited to break the tie.
  it("never lets two towns in one city fold to the same name", () => {
    for (const [city, towns] of Object.entries(PAKISTAN_LOCATIONS.towns)) {
      const folded = towns.map(foldName);
      expect([city, new Set(folded).size]).toEqual([city, folded.length]);
    }
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

describe("COARSE_ADMIN_UNITS", () => {
  it("recognises the parents the sweep actually returned", () => {
    expect(isCoarseAdminUnit("Faisal Cantonment", "Karachi")).toBe(true);
    expect(isCoarseAdminUnit("Karachi Cantonment", "Karachi")).toBe(true);
    expect(isCoarseAdminUnit("Gulberg Town", "Karachi")).toBe(true);
  });

  it("is spelling-insensitive", () => {
    expect(isCoarseAdminUnit("gulberg town", "Karachi")).toBe(true);
    expect(isCoarseAdminUnit("faisal  cantonment", "Karachi")).toBe(true);
    expect(isCoarseAdminUnit("KARACHI DISTRICT", "Karachi")).toBe(true);
  });

  // The case that forced this to be per-city. "Gulberg Town" is an
  // administrative parent in Karachi and the name of a real, pickable area in
  // Lahore. A city-blind set silently broke the Lahore resolution to fix the
  // Karachi one.
  it("does not leak one city's parent onto another city's area", () => {
    expect(isCoarseAdminUnit("Gulberg Town", "Lahore")).toBe(false);
    expect(resolveGeocodedName("Gulberg Town", "Lahore")).toBe("Gulberg");
  });

  it("refuses to resolve a parent to any single area", () => {
    expect(resolveGeocodedName("Gulberg Town", "Karachi")).toBeNull();
    expect(resolveGeocodedName("Faisal Cantonment", "Karachi")).toBeNull();
    expect(resolveGeocodedName("Karachi Cantonment", "Karachi")).toBeNull();
  });

  // The guard's real job is forward-looking. Today "Gulberg Town" fails to
  // resolve anyway, for the incidental reason that no Karachi town folds to
  // "gulberg". The moment anyone adds one — and the sweep's bucket C proposed
  // exactly that, at 24 points — every pin inside Gulberg Town's many child
  // areas would start prefilling to the parent. This asserts the guard, not
  // the accident.
  it("still refuses in Karachi even once a same-folding town is added", () => {
    expect(PAKISTAN_LOCATIONS.towns["Lahore"]).toContain("Gulberg");
    expect(resolveGeocodedName("Gulberg Town", "Karachi")).toBeNull();
  });

  it("does not swallow a legitimate area that merely sounds administrative", () => {
    expect(isCoarseAdminUnit("Orangi Town", "Karachi")).toBe(false);
    expect(isCoarseAdminUnit("Saddar", "Karachi")).toBe(false);
    expect(resolveGeocodedName("Orangi Town", "Karachi")).toBe("Orangi Town");
  });

  it("is total on junk input", () => {
    expect(isCoarseAdminUnit("", "Karachi")).toBe(false);
    expect(isCoarseAdminUnit("   ", "Karachi")).toBe(false);
    expect(isCoarseAdminUnit("Faisal Cantonment", "Quetta")).toBe(false);
    expect(isCoarseAdminUnit("Faisal Cantonment")).toBe(false);
  });
});

describe("residential flag", () => {
  it("defaults an unknown area to residential", () => {
    expect(isResidentialArea("Nowhere", "Nothing")).toBe(true);
  });

  it("asks a household for a house number", () => {
    expect(getHouseNoField("Karachi", "Clifton")).toEqual({
      label: "House / flat no.",
      placeholder: "14-B",
    });
  });

  it("is declared explicitly on every entry, never left undefined", () => {
    // `residential` is a required boolean rather than an optional one on
    // purpose: undefined is falsy, so an entry that merely forgot the field
    // would render a household's form asking for a "unit / building name".
    for (const [key, meta] of Object.entries(AREA_META)) {
      expect([key, typeof meta.residential]).toEqual([key, "boolean"]);
    }
  });
});

describe("P0.6 registry expansion", () => {
  it("resolves the areas the sweep found missing", () => {
    for (const town of [
      "Ibrahim Hyderi",
      "Machar Colony",
      "Bahadurabad",
      "Drigh Colony",
      "Metroville",
      "Bath Island",
    ]) {
      expect([town, resolveGeocodedName(town, "Karachi")]).toEqual([town, town]);
    }
  });

  it("resolves the spelling variants each source actually returned", () => {
    // Every left-hand string below was observed in the sweep, not invented.
    expect(resolveGeocodedName("Eissa Nagri", "Karachi")).toBe("Essa Nagri");
    expect(resolveGeocodedName("Central Jacob Lines", "Karachi")).toBe("Jacob Lines");
    expect(resolveGeocodedName("Shershah Colony", "Karachi")).toBe("Sher Shah Colony");
    expect(resolveGeocodedName("SITE", "Karachi")).toBe("Sindh Industrial Trading Estate");
  });

  // Askari 1-5 are separate places in different parts of Karachi. The sweep
  // itself shows it: Askari 4 at 24.899,67.117 and Askari 5 at 24.940,67.179,
  // ~8 km apart. They are sub-areas of the Askari town, and an alias onto the
  // town would assert they are one place and prefill the wrong one.
  it("registers each Askari as a town in its own right", () => {
    for (const t of ["Askari 1", "Askari 2", "Askari 3", "Askari 4", "Askari 5"]) {
      expect([t, resolveGeocodedName(t, "Karachi")]).toEqual([t, t]);
    }
  });

  it("keeps an alias where both sources named the SAME coordinate", () => {
    // Google said "Central Jacob Lines" and OSM said "Jacob Lines" at the very
    // same points; likewise "Gulshan e Sikandarabad" and "Sikandarabad". Those
    // are two names for one place, which is what an alias is for.
    expect(resolveGeocodedName("Central Jacob Lines", "Karachi")).toBe("Jacob Lines");
  });

  it("treats Old Golimar as its own place, not a spelling of Golimar", () => {
    expect(resolveGeocodedName("Old Golimar", "Karachi")).toBe("Old Golimar");
    expect(resolveGeocodedName("Golimar", "Karachi")).toBe("Golimar");
  });

  it("asks an industrial site for a unit, not a flat number", () => {
    for (const town of [
      "Korangi Industrial Area",
      "Sindh Industrial Trading Estate",
      "West Wharf",
    ]) {
      expect([town, isResidentialArea("Karachi", town)]).toEqual([town, false]);
      expect([town, getHouseNoField("Karachi", town).label]).toEqual([
        town,
        "Unit / building name",
      ]);
    }
  });

  it("keeps every added area residential unless it is an estate", () => {
    const nonResidential = Object.entries(AREA_META)
      .filter(([k, m]) => k.startsWith("Karachi::") && !m.residential)
      .map(([k]) => k.slice("Karachi::".length));
    expect(nonResidential.sort()).toEqual([
      "Korangi Industrial Area",
      "Sindh Industrial Trading Estate",
      "West Wharf",
    ]);
  });

  // Korangi Creek shares a prefix with Korangi and is a DIFFERENT place. It was
  // deliberately NOT added: OSM named plain "Korangi" at those coordinates, so
  // the two sources never actually agreed on it. Aliasing it would reproduce
  // the prefix-collision that resolved DHA pins to Saddar.
  it("did not absorb a prefix-sharing neighbour", () => {
    expect(PAKISTAN_LOCATIONS.towns["Karachi"]).not.toContain("Korangi Creek");
    expect(resolveGeocodedName("Korangi Creek", "Karachi")).toBeNull();
  });

  it("every added area has metadata, and every metadata key a real area", () => {
    const towns = new Set(PAKISTAN_LOCATIONS.towns["Karachi"]);
    for (const key of Object.keys(AREA_META)) {
      if (!key.startsWith("Karachi::")) continue;
      const town = key.slice("Karachi::".length);
      expect([key, towns.has(town)]).toEqual([key, true]);
    }
  });

  it("never prefills a newly added area", () => {
    // Nothing here has a measured precision figure, and prefill is gated on
    // precision alone. They are selectable, not auto-selected.
    for (const [key, meta] of Object.entries(AREA_META)) {
      expect([key, meta.geocodePrefill]).toEqual([key, false]);
    }
  });
});

describe("alias sanity", () => {
  // The rule this encodes, learned the hard way: an alias asserts "these two
  // strings are the SAME PLACE". A sub-area is a finer level INSIDE the town,
  // so aliasing one onto its parent claims a part is the whole — and under
  // prefill it would silently select the wrong one of several dispersed places.
  // Askari 1-5 and Garden East/West are both sub-areas that were briefly, and
  // wrongly, aliased onto their towns.
  it("never aliases a town to one of its own sub-areas", () => {
    for (const [key, meta] of Object.entries(AREA_META)) {
      const [city, town] = key.split("::");
      const subAreas = new Set(getSubAreasForTown(city, town).map(foldName));
      for (const alias of meta.aliases ?? []) {
        expect([key, alias, subAreas.has(foldName(alias))]).toEqual([
          key,
          alias,
          false,
        ]);
      }
    }
  });

  it("never lets one alias point at two different areas", () => {
    const seen = new Map<string, string>();
    for (const [key, meta] of Object.entries(AREA_META)) {
      const city = key.split("::")[0];
      for (const alias of meta.aliases ?? []) {
        const scoped = `${city}::${foldName(alias)}`;
        expect([scoped, seen.get(scoped) ?? key]).toEqual([scoped, key]);
        seen.set(scoped, key);
      }
    }
  });

  it("never aliases a name that is already a canonical town in that city", () => {
    for (const [key, meta] of Object.entries(AREA_META)) {
      const [city, town] = key.split("::");
      const towns = new Set(getTownsForCity(city).map(foldName));
      for (const alias of meta.aliases ?? []) {
        if (foldName(alias) === foldName(town)) continue;
        expect([key, alias, towns.has(foldName(alias))]).toEqual([key, alias, false]);
      }
    }
  });
});

describe("DEPRECATED_TOWNS", () => {
  // "Askari" was never a town: Askari 1-5 are five separate places in different
  // parts of Karachi. The string cannot be deleted — `isLegacyTownValue` would
  // then treat every profile holding it as stale and force those users through
  // LocationUpdateModal, the exact churn the last migration avoided.
  it("hides the bare Askari value from the picker", () => {
    expect(getTownsForCity("Karachi")).toContain("Askari");
    expect(getSelectableTownsForCity("Karachi")).not.toContain("Askari");
    expect(isDeprecatedTown("Karachi", "Askari")).toBe(true);
  });

  it("offers the five real Askari towns instead", () => {
    const picker = getSelectableTownsForCity("Karachi");
    for (const t of ["Askari 1", "Askari 2", "Askari 3", "Askari 4", "Askari 5"]) {
      expect([t, picker.includes(t)]).toEqual([t, true]);
    }
  });

  it("keeps the deprecated value VALID so no profile is invalidated", () => {
    // This is the whole point of deprecating rather than deleting.
    expect(isCanonicalTown("Karachi", "Askari")).toBe(true);
    expect(isLegacyTownValue("Karachi", "Askari")).toBe(false);
  });

  it("never deprecates a town that does not exist", () => {
    for (const [city, towns] of Object.entries(DEPRECATED_TOWNS)) {
      const canonical = new Set(getTownsForCity(city));
      for (const t of towns) expect([city, t, canonical.has(t)]).toEqual([city, t, true]);
    }
  });

  it("leaves cities with no deprecations untouched", () => {
    expect(getSelectableTownsForCity("Lahore")).toEqual(getTownsForCity("Lahore"));
    expect(getSelectableTownsForCity("Nowhere")).toEqual([]);
  });
});

describe("one address, one representation", () => {
  // A name that is BOTH a town and a sub-area of some other town can be written
  // two ways -- `town: "X"` or `town: "Parent", subArea: "X"` -- so two users in
  // the same place store different addresses. Area-based scheduling keys on
  // `town`, so it would route them separately.
  //
  // The exception is deliberate: once the parent town is deprecated, or the
  // sub-area itself is, only one of the two forms is still offered, so there is
  // no ambiguity for anyone choosing today. That is exactly how Askari 1-5 and
  // Garden East/West are allowed to exist as towns.
  it("never offers a name as both a town and another town's sub-area", () => {
    const towns = PAKISTAN_LOCATIONS.towns["Karachi"];
    for (const town of towns) {
      if (isDeprecatedTown("Karachi", town)) continue;
      for (const [key, subs] of Object.entries(PAKISTAN_LOCATIONS.subAreas)) {
        if (!key.startsWith("Karachi::")) continue;
        const parent = key.slice("Karachi::".length);
        if (parent === town) continue;
        if (isDeprecatedTown("Karachi", parent)) continue;
        for (const sub of subs) {
          if (foldName(sub) !== foldName(town)) continue;
          expect([
            `${town} is a town AND a sub-area of ${parent}`,
            isDeprecatedSubArea("Karachi", parent, sub),
          ]).toEqual([`${town} is a town AND a sub-area of ${parent}`, true]);
        }
      }
    }
  });
});

describe("Garden is a container that is not a place", () => {
  it("offers the three real localities instead", () => {
    const picker = getSelectableTownsForCity("Karachi");
    for (const t of ["Garden East", "Garden West", "Soldier Bazaar"]) {
      expect([t, picker.includes(t)]).toEqual([t, true]);
    }
    expect(picker).not.toContain("Garden");
  });

  it("keeps the old value valid so no profile is invalidated", () => {
    expect(isCanonicalTown("Karachi", "Garden")).toBe(true);
    expect(isLegacyTownValue("Karachi", "Garden")).toBe(false);
  });

  // Existing Garden users are not stranded: the town had sub-areas, so
  // `requiresSubArea` forced them to pick one of the three. Their stored
  // sub-area IS the answer, and P3.1 can promote it losslessly.
  it("leaves every existing Garden user a lossless migration", () => {
    const subs = getSubAreasForTown("Karachi", "Garden");
    expect(subs).toEqual(["Garden East", "Garden West", "Soldier Bazaar"]);
    for (const sub of subs) {
      expect([sub, getTownsForCity("Karachi").includes(sub)]).toEqual([sub, true]);
    }
  });

  it("dropped the ambiguous and redundant additions", () => {
    // OSM's "Data Nagar" is at 24.94,67.01; the registry's is a Gulshan-e-Hadeed
    // sub-area at Steel Town. Different places, one name — not addable as a bare
    // town. "Nanakwara" was simply already expressible as a Saddar sub-area.
    expect(PAKISTAN_LOCATIONS.towns["Karachi"]).not.toContain("Data Nagar");
    expect(PAKISTAN_LOCATIONS.towns["Karachi"]).not.toContain("Nanakwara");
  });
});

describe("selectability and resolvability are separate axes", () => {
  // A string may be BOTH a canonical town and a coarse admin unit. That is not
  // a contradiction and must not be "fixed": the picker and the geocoder are
  // answering different questions.
  //
  // A user who picks "Bin Qasim Town" from a list that also offers Ibrahim
  // Hyderi, Steel Town, Shah Latif Town and Gulshan-e-Hadeed has chosen the
  // parent BECAUSE no child fits — Port Qasim, the industrial belt and the
  // villages have no entry. The geocoder returns the same string because OSM's
  // hierarchy hands back the administrative parent; it has ruled nothing out.
  // Same string, different epistemic status.
  //
  // The criterion is: is there territory inside the parent with no child entry?
  // Bin Qasim Town, yes — so selectable. Gulberg Town is dense and its children
  // are registered — so not selectable. One rule, two answers.
  it("lets Bin Qasim Town be selectable but never geocoder-resolved", () => {
    expect(getSelectableTownsForCity("Karachi")).toContain("Bin Qasim Town");
    expect(isCoarseAdminUnit("Bin Qasim Town", "Karachi")).toBe(true);
    expect(resolveGeocodedName("Bin Qasim Town", "Karachi")).toBeNull();
  });

  it("keeps the other coarse units OUT of the picker", () => {
    const picker = getSelectableTownsForCity("Karachi");
    for (const name of ["Faisal Cantonment", "Gulberg Town", "Karachi Cantonment"]) {
      expect([name, picker.includes(name)]).toEqual([name, false]);
    }
  });

  it("documents every intentional overlap", () => {
    // If this list grows, the growth was deliberate and needs the same
    // territory-without-a-child justification written down.
    const both = getSelectableTownsForCity("Karachi")
      .filter((t) => COARSE_ADMIN_UNITS["Karachi"].has(foldName(t)));
    expect(both).toEqual(["Bin Qasim Town"]);
  });
});

describe("sub-areas never restate their parent town", () => {
  // "Orangi Town -> Orangi" and "Federal B. Area -> B Area" say nothing the
  // town has not already said, so they cost the user a required choice and
  // return no information. Hidden rather than deleted, as always.
  it("hides any sub-area whose name is contained in its town's name", () => {
    for (const [key, subs] of Object.entries(PAKISTAN_LOCATIONS.subAreas)) {
      const [city, town] = key.split("::");
      if (isDeprecatedTown(city, town)) continue;
      const tf = foldName(town);
      for (const sub of subs) {
        if (!tf.includes(foldName(sub))) continue;
        expect([`${key} -> ${sub}`, isDeprecatedSubArea(city, town, sub)]).toEqual([
          `${key} -> ${sub}`,
          true,
        ]);
      }
    }
  });
});

describe("a deprecated town may still host live sub-areas", () => {
  // The intended end state for any mis-levelled place: the town entry is
  // retired from the picker while its sub-areas stay selectable for the users
  // who already hold them. Asserted because it WILL recur — Mahmudabad is
  // queued for exactly this shape.
  it("keeps Askari's and Garden's sub-areas selectable", () => {
    for (const town of ["Askari", "Garden"]) {
      expect([town, isDeprecatedTown("Karachi", town)]).toEqual([town, true]);
      expect(getSelectableSubAreasForTown("Karachi", town).length).toBeGreaterThan(0);
    }
  });
});

describe("a deprecated town is never prefilled", () => {
  // Hiding a town from the picker while the resolver still returns it would
  // pre-select a value the user can neither see nor re-pick. Storage and
  // validation are deliberately unaffected.
  it("refuses to resolve a hidden town, by name or alias", () => {
    for (const name of [
      "Mahmudabad",
      "Mehmoodabad",
      "Muslimabad",
      "Askari",
      "Garden",
      "Shanti Nagar",
      // Both alias forms must be refused too, not just the canonical name.
      "Sikandarabad",
      "Gulshan e Sikandarabad",
      "Gulshan-e-Sikandarabad",
    ]) {
      expect([name, resolveGeocodedName(name, "Karachi")]).toEqual([name, null]);
    }
  });

  it("still accepts the hidden value as stored data", () => {
    for (const town of ["Mahmudabad", "Muslimabad", "Askari", "Garden"]) {
      expect([town, isCanonicalTown("Karachi", town)]).toEqual([town, true]);
      expect([town, isLegacyTownValue("Karachi", town)]).toEqual([town, false]);
    }
  });
});

describe("a town is never a block of another town", () => {
  // Sharifabad and Ancholi were added as towns on OSM support, but they are
  // blocks of Federal B. Area — "Block 1 (Sharifabad)", "Block 20 (Ancholi)" —
  // and do not exist on their own. No exact-match invariant caught it: the
  // collision is with a name INSIDE the sub-area string.
  //
  // Matched on the parenthetical specifically, not on substring containment.
  // Containment is too loose — Landhi's "Bagh-e-Korangi" ends in "Korangi"
  // while being an entirely different place, and flagging it would train
  // whoever hits this into ignoring the test.
  it("never lets a live town name appear as another town's block qualifier", () => {
    const live = new Set(
      PAKISTAN_LOCATIONS.towns["Karachi"]
        .filter((t) => !isDeprecatedTown("Karachi", t))
        .map(foldName),
    );
    for (const [key, subs] of Object.entries(PAKISTAN_LOCATIONS.subAreas)) {
      if (!key.startsWith("Karachi::")) continue;
      const parent = key.slice("Karachi::".length);
      for (const sub of subs) {
        const inner = sub.match(/\(([^)]+)\)/)?.[1];
        if (!inner) continue;
        if (isDeprecatedSubArea("Karachi", parent, sub)) continue;
        const label = `${parent} :: "${sub}" names a live town`;
        expect([label, live.has(foldName(inner))]).toEqual([label, false]);
      }
    }
  });
});
