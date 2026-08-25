#!/usr/bin/env -S npx tsx
/**
 * Exports the Pakistan location registry — cities, towns, tiers and aliases —
 * as a JSON artifact for the backend to consume.
 *
 * The app repo stays the single source of truth for this data (`utils/
 * pakistan_areas.ts` / `pakistan_locations.ts`); the backend has no registry
 * knowledge of its own and instead commits a copy of this script's output
 * (`lib/data/locationRegistry.json`). Staleness is visible by diffing the
 * committed artifact against a fresh run of this script, and drift between
 * the two repos fails loudly rather than silently — the PC-2 pattern.
 *
 * READ-ONLY over the registry: this script only reads from
 * `utils/pakistan_areas.ts` and its helpers. It must never write to, or
 * suggest edits of, any registry string.
 *
 * Deliberately excludes: `AreaMeta` fields other than `aliases`
 * (geocodePrefill, residential, subAreaRequired, blockLabel), and full
 * per-town sub-area lists. None of those are asked for by any backend
 * consumer to date; the artifact only needs to answer "what
 * city/tier/town/alias/coarse-unit does this belong to", not reproduce the
 * full app-side form logic.
 *
 * `coarseAdminUnits` IS included (added in the Task 1 fix round): the
 * resolver guard that refuses to resolve an administrative parent (e.g.
 * "Gulberg Town" in Karachi, which spans many registered areas) needs it to
 * avoid a confident wrong answer, and the geocoding consumer in a later task
 * depends on that refusal.
 *
 * `deprecatedSubAreas` and `areaCentroids` were added for the P3.1
 * backfill-audit script:
 *
 *   - `deprecatedSubAreas` is keyed `"City::Town"` (the same composite key
 *     `subAreaKey` uses everywhere else in this module) -> a SORTED array of
 *     the sub-area strings hidden from new selections for that town, i.e.
 *     the export of the app's private `DEPRECATED_SUB_AREA_VALUES` map. It
 *     is reconstructed via `getSubAreasForTown` minus
 *     `getSelectableSubAreasForTown` rather than importing the private const
 *     directly, so this generator only ever depends on the module's public
 *     surface.
 *   - `areaCentroids` exports `AREA_CENTROIDS` (`"City::Town"` -> `[lng,
 *     lat]`) and `CITY_CENTROIDS` (`"City"` -> `[lng, lat]`) verbatim. Both
 *     are EMPTY as of this writing — the P0.1a geocoder sweep produces a
 *     `centroids.json` by-product (`scripts/geocode-spike/report.js`) that
 *     was searched for across both repos (working tree and full git
 *     history) and does not exist anywhere: `report.js` requires
 *     `scripts/geocode-spike/out/results.jsonl`, which was never generated
 *     (`out/` is gitignored and holds no such file), so `centroids.json`
 *     itself was never produced. The audit script therefore ships a
 *     `--centroids <path>` override flag so a future run of the sweep can
 *     supply real coverage without a registry edit or a re-export here.
 *
 * No timestamp or other non-deterministic field is written: the artifact must
 * be byte-stable, so running this script twice with no registry change
 * produces a no-op diff.
 *
 * SYNC DISCIPLINE (IMPORTANT-3): any change to `utils/pakistan_areas.ts` (or
 * `pakistan_locations.ts`) that touches a city, tier, town, alias, or
 * `COARSE_ADMIN_UNITS` entry requires regenerating BOTH committed copies of
 * this export, not just one:
 *
 *   1. THIS repo's own regression fixture,
 *      `utils/__generated__/locationRegistry.json` — run
 *      `npm run export:registry -- --out utils/__generated__/locationRegistry.json`
 *      and commit the diff. `__tests__/exportLocationRegistry.test.ts`
 *      fails if the in-process export and this fixture drift apart, but it
 *      cannot catch a `pakistan_areas.ts` edit that never got exported at
 *      all — only a stale fixture that was regenerated incorrectly.
 *   2. The BACKEND repo's `lib/data/locationRegistry.json` — run this same
 *      command against that repo's checkout (or copy the freshly generated
 *      file over) and commit it there. Nothing in either repo's test suite
 *      can catch a forgotten backend regeneration automatically: the
 *      backend has no live view of this repo, by design (see
 *      `lib/locationRegistry.ts`'s own header in the backend repo). Staying
 *      in sync is a discipline this comment documents, not a check either
 *      CI enforces across the repo boundary.
 *
 * Usage:
 *   npx tsx scripts/export_location_registry.ts            # writes to stdout
 *   npx tsx scripts/export_location_registry.ts --out FILE  # writes to FILE
 */

import * as fs from "fs";

import {
  AREA_CENTROIDS,
  AREA_META,
  CITY_CENTROIDS,
  COARSE_ADMIN_UNITS,
  DEPRECATED_TOWNS,
  PAKISTAN_LOCATIONS,
  cityHasTowns,
  getCoverageTier,
  getProvinceForCity,
  getSelectableSubAreasForTown,
  getSelectableTownsForCity,
  getSubAreasForTown,
  getTownsForCity,
  subAreaKey,
  townHasSubAreas,
} from "@/utils/pakistan_areas";

const REGISTRY_VERSION = 1;

interface CityExport {
  province: string;
  tier: string;
  hasTowns: boolean;
  towns: string[];
  selectableTowns: string[];
  deprecatedTowns: string[];
  /** Alias string -> canonical town, inverted from `AREA_META[...].aliases`. */
  aliases: Record<string, string>;
  /**
   * Already-folded strings (via the app's `foldName`) naming administrative
   * parents in this city — sourced directly from `COARSE_ADMIN_UNITS[city]`,
   * which the app itself stores pre-folded. A raw geocoder string whose
   * `foldName(...)` is a member must never be resolved to a single area: see
   * `isCoarseAdminUnit` in `utils/pakistan_areas.ts` for why.
   */
  coarseAdminUnits: string[];
}

/** `[lng, lat]`, GeoJSON order — mirrors `AREA_CENTROIDS`/`CITY_CENTROIDS`. */
type Centroid = readonly [number, number];

interface AreaCentroidsExport {
  /** `${city}::${town}` -> `[lng, lat]`, verbatim from `AREA_CENTROIDS`. */
  areas: Record<string, Centroid>;
  /** `${city}` -> `[lng, lat]`, verbatim from `CITY_CENTROIDS`. */
  cities: Record<string, Centroid>;
}

interface RegistryExport {
  version: number;
  cities: Record<string, CityExport>;
  /**
   * `${city}::${town}` -> sorted array of sub-area strings hidden from new
   * selections for that town (the export of the app's private
   * `DEPRECATED_SUB_AREA_VALUES`). A town with nothing deprecated is simply
   * absent as a key — see `buildDeprecatedSubAreas`.
   */
  deprecatedSubAreas: Record<string, string[]>;
  /** See `AreaCentroidsExport`. Both maps are empty until P0.1a ships real coverage. */
  areaCentroids: AreaCentroidsExport;
}

/**
 * Alias -> town for one city, inverted from `AREA_META`.
 *
 * `AREA_META` keys are sorted first so the resulting object's insertion order
 * — and therefore `JSON.stringify`'s output order — is deterministic and
 * independent of `Object.keys` enumeration order, which is what byte-stability
 * across regenerations depends on.
 */
export function buildAliasesForCity(city: string): Record<string, string> {
  const prefix = `${city}::`;
  const keys = Object.keys(AREA_META)
    .filter((key) => key.startsWith(prefix))
    .sort();

  const aliases: Record<string, string> = {};
  for (const key of keys) {
    const town = key.slice(prefix.length);
    for (const alias of AREA_META[key].aliases ?? []) {
      // MINOR-2: two different towns in the same city both claiming the same
      // alias string would otherwise collapse silently — the second `for`
      // iteration overwrites the first with no signal, and the export ships
      // whichever town happened to sort last. That is exactly the kind of
      // silent divergence this whole export exists to make loud instead: fail
      // the export so the collision gets fixed in AREA_META, not baked into
      // the artifact both repos then trust.
      if (aliases[alias] !== undefined && aliases[alias] !== town) {
        throw new Error(
          `Duplicate alias "${alias}" in city "${city}": claimed by both ` +
            `"${aliases[alias]}" and "${town}". Aliases must be unique per city.`,
        );
      }
      aliases[alias] = town;
    }
  }
  return aliases;
}

/**
 * `${city}::${town}` -> sorted deprecated sub-area strings, for every town
 * (across every city) that has at least one.
 *
 * Reconstructed from the module's PUBLIC surface rather than importing the
 * private `DEPRECATED_SUB_AREA_VALUES` const directly: `getSubAreasForTown`
 * is the validation view (everything, deprecated included) and
 * `getSelectableSubAreasForTown` is the picker view (deprecated filtered
 * out), so their set difference is exactly the deprecated list —
 * `isDeprecatedSubArea`'s own definition, computed the other way round. A
 * town with nothing deprecated contributes no key at all, so a consumer
 * checking `deprecatedSubAreas[key]` for undefined behaves the same as
 * checking membership in an empty array would.
 */
export function buildDeprecatedSubAreas(): Record<string, string[]> {
  const allCities = Object.values(PAKISTAN_LOCATIONS.cities).flat().sort();

  const out: Record<string, string[]> = {};
  for (const city of allCities) {
    for (const town of getTownsForCity(city)) {
      if (!townHasSubAreas(city, town)) continue;

      const all = getSubAreasForTown(city, town);
      const selectable = new Set(getSelectableSubAreasForTown(city, town));
      const deprecated = all.filter((value) => !selectable.has(value)).sort();

      if (deprecated.length > 0) {
        out[subAreaKey(city, town)] = deprecated;
      }
    }
  }
  return out;
}

/**
 * `AREA_CENTROIDS`/`CITY_CENTROIDS`, copied verbatim (both empty as of this
 * writing — see this file's header). Re-keyed into a stable sorted order the
 * same way `buildAliasesForCity` sorts its keys, so the artifact stays
 * byte-stable across regenerations independent of `Object.keys` enumeration
 * order.
 */
export function buildAreaCentroids(): AreaCentroidsExport {
  const sortEntries = (
    map: Record<string, Centroid>,
  ): Record<string, Centroid> => {
    const out: Record<string, Centroid> = {};
    for (const key of Object.keys(map).sort()) {
      out[key] = map[key];
    }
    return out;
  };

  return {
    areas: sortEntries(AREA_CENTROIDS as Record<string, Centroid>),
    cities: sortEntries(CITY_CENTROIDS as Record<string, Centroid>),
  };
}

export function buildRegistry(): RegistryExport {
  const allCities = Object.values(PAKISTAN_LOCATIONS.cities).flat().sort();

  const cities: Record<string, CityExport> = {};
  for (const city of allCities) {
    const province = getProvinceForCity(city);
    if (!province) {
      // PROVINCE_BY_CITY is inverted from the very same PAKISTAN_LOCATIONS.cities
      // map being iterated here, so every city must resolve. A null here means
      // the registry itself is inconsistent — fail loudly rather than emit a
      // partial artifact.
      throw new Error(`No province found for city "${city}" — registry is inconsistent.`);
    }

    cities[city] = {
      province,
      tier: getCoverageTier(city),
      hasTowns: cityHasTowns(city),
      towns: getTownsForCity(city),
      selectableTowns: getSelectableTownsForCity(city),
      deprecatedTowns: [...(DEPRECATED_TOWNS[city] ?? [])],
      aliases: buildAliasesForCity(city),
      coarseAdminUnits: [...(COARSE_ADMIN_UNITS[city] ?? [])].sort(),
    };
  }

  return {
    version: REGISTRY_VERSION,
    cities,
    deprecatedSubAreas: buildDeprecatedSubAreas(),
    areaCentroids: buildAreaCentroids(),
  };
}

function parseOutPath(argv: string[]): string | undefined {
  const flagIndex = argv.indexOf("--out");
  if (flagIndex === -1) return undefined;
  const value = argv[flagIndex + 1];
  if (!value) {
    throw new Error("--out requires a file path argument.");
  }
  return value;
}

function main() {
  const outPath = parseOutPath(process.argv.slice(2));
  const json = JSON.stringify(buildRegistry(), null, 2) + "\n";

  if (outPath) {
    fs.writeFileSync(outPath, json);
  } else {
    process.stdout.write(json);
  }
}

// Guarded so the regression test (IMPORTANT-3,
// __tests__/exportLocationRegistry.test.ts) can `import { buildRegistry }`
// from this module without also re-running the CLI's stdout/file-write path
// as a side effect of the import.
if (require.main === module) {
  main();
}
