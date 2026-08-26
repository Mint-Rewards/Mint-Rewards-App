/**
 * Helpers, metadata and geocoder-name resolution over the Pakistan location
 * registry.
 *
 * The raw data lives in `pakistan_locations.ts` and is re-exported here, so
 * every existing import of `PAKISTAN_LOCATIONS` from this module keeps working.
 * The split is deliberate: see that file's header for the edit that motivated
 * it. Keep raw data out of this file and logic out of that one.
 */

import {
  PAKISTAN_LOCATIONS,
  type LocationData,
} from "@/utils/pakistan_locations";

export { PAKISTAN_LOCATIONS };
export type { LocationData };

export function getCitiesForProvince(province: string): string[] {
  return PAKISTAN_LOCATIONS.cities[province] ?? [];
}

export function getTownsForCity(city: string): string[] {
  return PAKISTAN_LOCATIONS.towns[city] ?? [];
}

/** Returns true only for cities that have a defined towns list */
export function cityHasTowns(city: string): boolean {
  return city in PAKISTAN_LOCATIONS.towns;
}

/** True when `town` is a canonical town of `city`. */
export function isCanonicalTown(city: string, town: string): boolean {
  if (!city || !town) return false;
  return getTownsForCity(city).includes(town);
}

/**
 * True when a saved location predates the canonical town list and needs the
 * user to re-pick it.
 *
 * Builds before the sub-area work wrote free-text towns straight into `town`,
 * and the town list was later renamed to align with the sub-area data ("F-6"
 * became "Sector F-6"). Either way the result is a non-empty `town` that is not
 * canonical for its city — a state the current client can no longer produce,
 * since free text now goes to `townOther`. So this doubles as the "written by
 * an old build" test.
 */
export function isLegacyTownValue(city: string, town: string): boolean {
  if (!town) return false;
  if (!cityHasTowns(city)) return false; // no list to judge against
  return !isCanonicalTown(city, town);
}

/** Composite key for the subAreas map. Town names repeat across cities. */
export function subAreaKey(city: string, town: string): string {
  return `${city}::${town}`;
}

/**
 * Canonical sub-areas (block / sector / phase) for a town.
 * Returns [] when the town has no sub-area data — callers should skip the
 * sub-area step entirely in that case rather than render an empty dropdown.
 */
export function getSubAreasForTown(city: string, town: string): string[] {
  if (!city || !town) return [];
  return PAKISTAN_LOCATIONS.subAreas[subAreaKey(city, town)] ?? [];
}

/** True when this town has at least one canonical sub-area. */
export function townHasSubAreas(city: string, town: string): boolean {
  return getSubAreasForTown(city, town).length > 0;
}

/**
 * True when a sub-area can be asked for — and therefore required — at this
 * location. False for a free-text town (which arrives here as an empty `town`,
 * since the value lives in `townOther`) and for canonical towns with no
 * sub-area data: neither has a list to choose from, so there is no answer to
 * demand.
 *
 * Single source of truth for the required rule. The edit form and the
 * profile-completeness check both read it so they cannot disagree about
 * whether a blank sub-area is a gap or simply not applicable.
 */
export function requiresSubArea(city: string, town: string): boolean {
  // Both conditions matter. The flag says the step is worth asking; the list
  // says there is something to answer with. A curated `true` on a town whose
  // options were all later deprecated must not render an empty required step.
  return (
    isCanonicalTown(city, town) &&
    townHasSubAreas(city, town) &&
    getAreaMeta(city, town).subAreaRequired
  );
}

/**
 * Folds a name to a comparable form: lowercased, punctuation and spacing
 * removed. Canonical names carry inconsistent punctuation ("Federal B. Area",
 * "DHA (Defence Housing Authority)", "Gulshan-e-Iqbal"), so comparing raw text
 * would miss obvious matches for what a user actually types.
 */
export function foldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Shortest query worth matching on — below this nearly everything matches. */
const MIN_MATCH_QUERY = 2;

/**
 * Canonical names from `options` that look like what the user typed.
 *
 * Suggestions are drawn only from the array passed in, so every one traces back
 * to this file. Ranked exact fold-match, then prefix, then interior: someone
 * who typed "dha" as free text most needs to be shown the canonical "DHA", so
 * an exact match leads rather than being filtered out as redundant.
 *
 * Returns [] for queries shorter than MIN_MATCH_QUERY.
 */
export function matchCanonicalNames(
  options: string[],
  query: string,
  limit = 5,
): string[] {
  const needle = foldName(query || "");
  if (needle.length < MIN_MATCH_QUERY) return [];

  const exact: string[] = [];
  const prefix: string[] = [];
  const interior: string[] = [];

  for (const option of options) {
    const hay = foldName(option);
    if (hay === needle) exact.push(option);
    else if (hay.startsWith(needle)) prefix.push(option);
    else if (hay.includes(needle)) interior.push(option);
  }

  return [...exact, ...prefix, ...interior].slice(0, limit);
}

// ===========================================================================
// Metadata layer (P0.2)
// ===========================================================================
// Additive side-car maps over PAKISTAN_LOCATIONS. Nothing above this line is
// modified, and nothing here changes what `getSubAreasForTown` returns.
//
// WHY SIDE-CAR RATHER THAN RESTRUCTURING: `isLegacyTownValue` treats any stored
// town that is not in the canonical list as stale, which forces that user
// through LocationUpdateModal. Renaming or removing a single string therefore
// invalidates every profile using it. The data above is effectively frozen —
// these maps hang metadata off it by key instead of touching it.

export type CoverageTier = "A" | "B" | "C";

export interface AreaMeta {
  /**
   * Whether the geocoder may PRE-SELECT this area's town dropdown (P0.1c).
   *
   * Gated on precision alone, never on recall. Every derived field stays an
   * editable dropdown, so a missing pre-selection costs the user one tap they
   * would have made anyway — low recall is free. A WRONG pre-selection is not:
   * it is a value someone may accept without reading. Promotion therefore
   * needs precision >=85% over n>=20, and >30% `area_overridden` in live
   * telemetry demotes it again, that being direct evidence the estimate was
   * wrong.
   *
   * Defaults to false for EVERY area and is promoted only on evidence: the
   * spike can only sample areas we actually serve, and defaulting untested
   * areas to true would ship auto-fill into areas never measured.
   */
  geocodePrefill: boolean;
  /**
   * Whether people live here. False for industrial estates, ports and
   * institutional campuses.
   *
   * Not cosmetic, and not inferred from the name: it decides what the house
   * number field ASKS. A plot on a 200-hectare industrial estate has no house
   * or flat number, so where this is false the field renders as "Unit /
   * building name". It stays the same schema field and stays REQUIRED — a
   * collector still needs to know which unit out of two hundred. The original
   * field was unfillable there because it asked the wrong question, not
   * because the information does not exist.
   */
  residential: boolean;
  /**
   * Whether the sub-area step is REQUIRED in this area. Default false.
   *
   * Deliberately NOT derived from "does this town have any sub-areas". That
   * derivation is the most aggressive setting available — one child makes the
   * step required for everyone — so adding a single entry to a childless town
   * silently traps its whole population on a one-option dropdown they cannot
   * use. Inverting the default fails safe: a town can carry partial sub-areas
   * without forcing the question.
   *
   * `subAreaOther` means "required" never actually blocks anyone, so requiring
   * the step where coverage is thin does not produce sub-area data — it
   * produces `subAreaOther` noise. It earns its place only where a resident
   * could genuinely have answered and might otherwise skip.
   *
   * Seeded from the offered lists: true where at least 80% of the options are
   * numbered units (Block 7, Phase 3, Sector 14-A), which is what a systematic
   * subdivision looks like. Curated data from here on, not a live rule — adding
   * one named entry to DHA must not silently flip it.
   */
  subAreaRequired: boolean;
  /**
   * What the sub-area field should call itself in this area — "Block",
   * "Phase", "Sector", "Precinct", "Unit", "Zone", "Sub-sector", or the
   * generic "Area".
   *
   * Derived from the dominant idiom of the area's own sub-area list, never
   * from the city: Karachi alone contains Blocks (Gulshan-e-Iqbal), Phases
   * (DHA), Precincts (Bahria Town) and Sectors (North Karachi). Areas whose
   * list mixes levels, or is made of named places rather than numbered units,
   * get "Area" — asking a Saddar resident for their "Block" reads as a broken
   * form.
   */
  blockLabel: string;
  /** Geocoder strings that resolve to this area. Seeded from the P0.1a unmatched log. */
  aliases?: readonly string[];
}

export const CITY_COVERAGE_TIER: Record<string, CoverageTier> = {
  "Karachi": "A",
  "Lahore": "B",
  "Islamabad": "B",
};

export const AREA_META: Record<string, AreaMeta> = {
  "Lahore::DHA Lahore": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Area" },
  "Lahore::Bahria Town Lahore": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Block" },
  "Lahore::Gulberg": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Block" },
  "Lahore::Model Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::Johar Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::Wapda Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Area" },
  "Lahore::Garden Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::Township": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sector" },
  "Lahore::Cantt": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Lahore::Iqbal Town": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Block" },
  "Lahore::Faisal Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::EME Society": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::Valencia Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::PCSIR Housing Scheme": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Lahore::Punjab Cooperative Housing Society (PCHS)": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::Cavalry Ground": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Lahore::Sui Gas Society": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Lahore::Lake City": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sector" },
  "Lahore::State Life Housing Society": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Lahore::PGEHS (Punjab Govt Employees Housing Scheme)": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Lahore::LDA Avenue": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::Jubilee Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::Sabzazar": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Lahore::Shahdara": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Lahore::Shadman": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  // Google returns the expanded form for every DHA point in Karachi (9 of 29
  // resolvable points in the P0.1 core pilot); no affix rule reaches it.
  // geocodePrefill: true, 2026-08-25 — n=24, 100% (18 direct agreements + 6
  // "Darussalam Society -> Korangi" answers, which are a truth-label error
  // in the original Google sweep, not a candidate error: see the Korangi
  // entry's alias comment below and P0.6-REPORT.md's DHA correction. Clears
  // the n>=20 / >=85% gate; see scripts/geocode-spike/P0.6-REPORT.md.
  "Karachi::DHA": {
    geocodePrefill: true,
    residential: true,
    subAreaRequired: true,
    blockLabel: "Phase",
    // "Zamzama" is mis-parented as a Clifton sub-area (see DEPRECATED_SUB_AREA_VALUES
    // below) but actually sits inside DHA Phase 5. Resolves to the town, not
    // a phase: DHA's sub-area list is phases only, and a project-level entry
    // would put a third granularity into a two-level registry.
    aliases: ["Defence Housing Authority", "Defence", "Zamzama"],
  },
  "Karachi::Clifton": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Block" },
  // OSM carries the society's full registered name; PECHS is its acronym.
  // ("P.E.C.H.S." already folds to a match -- the spelled-out form does not.)
  "Karachi::PECHS": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: true,
    blockLabel: "Block",
    aliases: [
      "Pakistan Employee Co-operative Housing Society",
      "Pakistan Employees Co-operative Housing Society",
    ],
  },
  // "Shanti Nagar" was briefly a top-level town (DEPRECATED_TOWNS) before
  // being re-parented here as its real sub-area. The alias lets the resolver
  // name the town instead of going silent for it.
  "Karachi::Gulshan-e-Iqbal": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: true,
    blockLabel: "Block",
    aliases: ["Shanti Nagar"],
  },
  // Google spells it "Johar"; this registry spells it "Jauhar". Neither is
  // wrong, and no fold or affix rule bridges a vowel swap -- 33 of 1000
  // sampled Karachi points landed here and were counted as unregistered.
  "Karachi::Gulistan-e-Jauhar": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: true,
    blockLabel: "Block",
    aliases: ["Gulistan-e-Johar", "Gulistan e Johar"],
  },
  "Karachi::North Karachi": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sector" },
  "Karachi::North Nazimabad": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Karachi::Nazimabad": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  // "Gulshan-e-Shamim" was briefly a top-level town, re-parented here as its
  // real sub-area — same shape as Shanti Nagar above.
  "Karachi::Federal B. Area": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: true,
    blockLabel: "Block",
    aliases: ["Gulshan-e-Shamim"],
  },
  "Karachi::Liaquatabad": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  // "Darussalam Society" was briefly a top-level town, re-parented here as
  // its real sub-area — same shape as Shanti Nagar above. This is also why
  // OSM's "Darussalam Society" answer at DHA-labelled coordinates counts as
  // correct, not wrong: the label in the original Google sweep was the error.
  // geocodePrefill: true, 2026-08-25 — n=55, 98% (54/55). Clears the
  // n>=20 / >=85% gate; see scripts/geocode-spike/P0.6-REPORT.md.
  "Karachi::Korangi": {
    geocodePrefill: true,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Sector",
    aliases: ["Darussalam Society"],
  },
  "Karachi::Landhi": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Malir": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  // The administrative name is "Shah Faisal Town"; the residential name this
  // registry uses is "Shah Faisal Colony". Stripping the "Town" suffix gets
  // to "Shah Faisal", which still does not reach "...Colony" -- 44 of 1000
  // sampled points turned on this one pairing.
  "Karachi::Shah Faisal Colony": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Shah Faisal Town", "Shah Faisal"],
  },
  "Karachi::Bahria Town Karachi": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Precinct" },
  // NO aliases for the numbered schemes. Askari 1-5 are separate places in
  // different parts of Karachi -- the sweep put Askari 4 at 24.899,67.117 and
  // Askari 5 at 24.940,67.179, some 8 km apart -- and the registry already
  // carries them as sub-areas of this town. Aliasing "Askari 4" onto "Askari"
  // asserts they are the same place and would prefill the wrong one; leaving
  // it unresolved costs a tap and keeps the sub-area that distinguishes them.
  "Karachi::Askari": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Buffer Zone": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sector" },
  "Karachi::Gulshan-e-Hadeed": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  // Garden East and Garden West are sub-areas of this town, not other names
  // for it. Same reasoning as Askari above.
  "Karachi::Garden": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Orangi Town": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Sector" },
  // "Sadder" is Google's spelling; it does not fold to "Saddar".
  "Karachi::Saddar": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Sadder"],
  },
  "Karachi::KAECHS": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Karachi::Gulshan-e-Maymar": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sector" },
  // Gap audit: 10 of Sectors 1-21 listed — partial coverage, so the step is optional.
  // "Memon Nagar" was briefly a top-level town, re-parented here as its real
  // sub-area — same shape as Shanti Nagar above. UNLIKE Darussalam Society
  // (see the Korangi entry), this re-parenting is not independently confirmed
  // against the 2026-08-25 truth-label disagreements: Gulshan-e-Iqbal's
  // recompute has 2 unadjudicated "Memon Nagar -> Scheme 33" points, and no
  // text here says which side of that line Memon Nagar sits on. Parked, not
  // decided — do not reclassify those 2 points the way Darussalam Society's
  // 6 were without the same kind of confirmation. Zero prefill payoff either
  // way (Gulshan-e-Iqbal is at 56%, nowhere near the 85% gate), so this costs
  // nothing to leave open.
  "Karachi::Scheme 33": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Sector",
    aliases: ["Memon Nagar"],
  },
  "Karachi::New Karachi": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sector" },
  "Karachi::Defence View": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: true,
    blockLabel: "Phase",
    aliases: ["Defence View Housing Society"],
  },
  "Karachi::Gulzar-e-Hijri": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Surjani Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sector" },
  // Gap audit: 5 of Blocks 1-13 listed — partial coverage, so the step is optional.
  "Karachi::Naya Nazimabad": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Block" },
  // --- P0.6 registry expansion (2026-08-25) --------------------------
  // Every new area gets blockLabel "Area": none has a sub-area list, and
  // naming a level the dropdown cannot offer reads as a broken form.
  "Karachi::Korangi Industrial Area": {
    geocodePrefill: false,
    residential: false,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Korangi Industrial Estate"],
  },
  // The short forms were dropped as aliases when "S.I.T.E. Town" was added:
  // "SITE" now names either the industrial estate or the administrative town,
  // and an alias that names two places is exactly the mis-resolution the alias
  // rules exist to prevent. Only the full name resolves here.
  "Karachi::Sindh Industrial Trading Estate": {
    geocodePrefill: false,
    residential: false,
    subAreaRequired: false,
    blockLabel: "Area",
  },
  "Karachi::West Wharf": { geocodePrefill: false, residential: false, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Manora": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Lalazar": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Shanti Nagar": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Agra Taj Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Daryabad": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Ramswami": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Sultanabad": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::FC Area": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Baloch Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Jamshed Quarters": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Pathan Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Bath Island": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Machar Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Drigh Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Metroville": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Karsaz": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Gulshan-e-Shamim": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Muslimabad": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Muslim Abad"],
  },
  "Karachi::Sikandarabad": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Gulshan-e-Sikandarabad", "Gulshan e Sikandarabad"],
  },
  "Karachi::Sachal Goth": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Essa Nagri": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Eissa Nagri"],
  },
  "Karachi::Golimar": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Gulbahar"],
  },
  // OSM names "Golimar" and "Old Golimar" at DIFFERENT coordinates, so they are
  // two places, not two spellings. Added rather than aliased.
  "Karachi::Old Golimar": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Askari 1": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Askari 2": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Askari 3": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Askari 4": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Askari 5": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Garden East": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Garden West": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Soldier Bazaar": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Steel Town": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Shah Latif Town": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Bin Qasim Town": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Model Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  // PECHS is a Jamshed Town neighbourhood and is deliberately NOT listed as one
  // of its sub-areas. This registry is two levels deep — city -> town ->
  // subArea — so a town with children cannot become a child without dropping
  // them, and PECHS offers Block 1 through Block 7. Re-parenting it would turn
  // "PECHS / Block 5" into "Jamshed Town / PECHS" and delete block precision
  // across a dense area. Owner decision, 2026-08-25: keep PECHS top-level and
  // accept the structural inconsistency. Locked by test — do not "tidy" this.
  // Bahadurabad, Baloch Colony, Garden East, Garden West, Jamshed Quarters and
  // Soldier Bazaar were all briefly top-level towns, re-parented here as
  // their real sub-areas — same shape as Shanti Nagar above.
  "Karachi::Jamshed Town": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: [
      "Bahadurabad",
      "Baloch Colony",
      "Garden East",
      "Garden West",
      "Jamshed Quarters",
      "Soldier Bazaar",
    ],
  },
  "Karachi::S.I.T.E. Town": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Gulshan-e-Ghazi": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Mahmudabad": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Mehmoodabad", "Mahmoodabad"],
  },
  "Karachi::Darussalam Society": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Jacob Lines": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Central Jacob Lines"],
  },
  "Karachi::Jutland Lines": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Pioneer Park City": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Altaf Town": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Tariq Bin Ziyad Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::New Rizvia Society": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Alamgir Society": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Azam Basti": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Gulshan-e-Umer": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Dawood Cooperative Housing Society": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::P&T Society": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Karli": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Bahadurabad": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Saeedabad": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Goth Dad Muhammad": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Miran Naka": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Memon Nagar": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Rexber Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Khadda Memon": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Kalakot": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Patel Para": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Ibrahim Hyderi": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Qayyumabad": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Karachi::Sher Shah Colony": {
    geocodePrefill: false,
    residential: true,
    subAreaRequired: false,
    blockLabel: "Area",
    aliases: ["Shershah Colony", "Shershah"],
  },
  "Islamabad::Sector E-7": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-8": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-9": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-10": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-11": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-12": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-16": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-17": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-5": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-6": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-7": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-8": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-9 (Fatima Jinnah Park)": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-10": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-11": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-17": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-5": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-6": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-7": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-8": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-9": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-10": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-11": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-12": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-13": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-14": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-15": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-16": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-8": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-9": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-10": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-11": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-12": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-13": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-8": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-9": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-10": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-11": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-12": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-14": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-15": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-16": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Blue Area": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Islamabad::Sector D-12": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector D-17": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector C-14": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector C-15": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sub-sector" },
  "Islamabad::Sector B-17": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Islamabad::DHA Islamabad": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Islamabad::Bahria Town Islamabad": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Islamabad::PWD Housing Scheme": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Islamabad::Pakistan Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Islamabad::CBR Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Islamabad::Gulberg Greens": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Islamabad::Gulberg Residencia": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Islamabad::Top City": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Islamabad::Capital Smart City": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Block" },
  "Rawalpindi::Satellite Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Rawalpindi::Bahria Town Phase 8": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Block" },
  "Rawalpindi::Chaklala Scheme 3": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Rawalpindi::Askari": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Rawalpindi::Westridge": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Rawalpindi::Adiala Road": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Phase" },
  "Rawalpindi::Saddar": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Rawalpindi::Rawalpindi Cantt": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Faisalabad::Peoples Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Faisalabad::Madina Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Faisalabad::Gulberg": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Faisalabad::Samanabad": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Faisalabad::Ghulam Muhammad Abad": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Faisalabad::Batala Colony": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Faisalabad::Jinnah Colony": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Faisalabad::Eden Valley": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Faisalabad::Citi Housing": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Faisalabad::Wapda City": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Peshawar::Hayatabad": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Area" },
  "Peshawar::University Town": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Peshawar::Peshawar Cantt": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Peshawar::DHA Peshawar": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sector" },
  "Peshawar::Regi Model Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Zone" },
  "Peshawar::Warsak Road": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Quetta::Satellite Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Quetta::Cantonment": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Quetta::Samungli": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Multan::DHA Multan": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Sector" },
  "Multan::Bosan Road": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Multan::Shah Rukn-e-Alam Colony": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Multan::Gulgasht Colony": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Multan::Wapda Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Multan::Officers Colony": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Multan::Model Town": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Block" },
  "Multan::Citi Housing Multan": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
  "Hyderabad::Latifabad": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Unit" },
  "Hyderabad::Qasimabad": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Phase" },
  "Hyderabad::Cantonment": { geocodePrefill: false, residential: true, subAreaRequired: false, blockLabel: "Area" },
  "Hyderabad::Gulshan-e-Shahbaz": { geocodePrefill: false, residential: true, subAreaRequired: true, blockLabel: "Phase" },
};

/**
 * Towns hidden from NEW selections, still valid for existing users.
 *
 * The town-level twin of DEPRECATED_SUB_AREA_VALUES, and it exists for the same
 * reason: a registry string can never be edited or deleted, because
 * `isLegacyTownValue` treats any stored town outside the canonical list as
 * stale and force-marches those users through LocationUpdateModal.
 *
 * "Askari" is the first entry. It was never a town — Askari 1 through 5 are
 * five separate places in different parts of Karachi, now registered as towns
 * in their own right. Anyone still holding the bare value has an address that
 * cannot say WHICH Askari, so they are prompted specifically in the P3.1
 * backfill rather than being silently reassigned to one of the five.
 */
export const DEPRECATED_TOWNS: Record<string, readonly string[]> = {
  // "Muslimabad" recurs in several parts of Karachi and collapsed to one entry,
  // which would have made area-based scheduling route two different populations
  // together. Owner-confirmed as not needed rather than disambiguated.
  Karachi: [
    "Askari",
    "Garden",
    "Muslimabad",
    "Mahmudabad",
    "Shanti Nagar",
    // Owner-confirmed mis-levelled, each now a sub-area of its real parent.
    // Lossless: residents pick the parent, then the entry, exactly as before.
    "Memon Nagar",          // -> Scheme 33 (Gulzar-e-Hijri)
    "Gulshan-e-Shamim",     // -> Federal B. Area (Gulberg Town)
    "Darussalam Society",   // -> Korangi
    // Owner-confirmed neighbourhoods of Jamshed Town. None had sub-areas of its
    // own, so the move is lossless — the registry is two levels deep and a town
    // with children cannot become a child without dropping them.
    "Bahadurabad",          // -> Jamshed Town
    "Garden East",          // -> Jamshed Town
    "Jamshed Quarters",     // -> Jamshed Town
    "Baloch Colony",        // -> Jamshed Town
    "Garden West",          // -> Jamshed Town
    "Soldier Bazaar",       // -> Jamshed Town
    // Retired outright, not re-parented — the same call as Sikandarabad. Their
    // parents (S.I.T.E. Town, Model Colony) exist now, but moving one child in
    // alone would make the sub-area step required with a single answer most
    // residents cannot use. Owner decision: retire instead.
    "Golimar",
    "Tariq Bin Ziyad Colony",
    // Sikandarabad is in Keamari, across the harbour from Clifton, and the
    // geocoder returned it for Clifton pins ~8 km away. Retired rather than
    // re-parented: Keamari is not a registry town, so there is nowhere to move
    // it to. Deprecating makes those points resolve to null — silent instead of
    // confidently wrong, which under prefill is strictly better.
    "Sikandarabad",
  ],
};

/**
 * Towns to OFFER in the picker: canonical, minus anything deprecated.
 *
 * `getTownsForCity` remains the VALIDATION view and still returns deprecated
 * values, so no existing profile is invalidated. Only the picker narrows.
 */
export function getSelectableTownsForCity(city: string): string[] {
  const all = getTownsForCity(city);
  const deprecated = DEPRECATED_TOWNS[(city || "").trim()];
  if (!deprecated || deprecated.length === 0) return all;
  return all.filter((town) => !deprecated.includes(town));
}

/** True when a stored town is still valid but no longer offered. */
export function isDeprecatedTown(city: string, town: string): boolean {
  return (DEPRECATED_TOWNS[(city || "").trim()] ?? []).includes(town);
}

const DEPRECATED_SUB_AREA_VALUES: Record<string, readonly string[]> = {
  "Lahore::Gulberg": ["Hussain Chowk", "Liberty Market", "Main Boulevard Gulberg", "MM Alam Road"],
  "Lahore::Model Town": ["Model Town Link Road"],
  "Lahore::Lake City": ["Raiwind Road"],
  "Karachi::PECHS": ["Khalid Bin Walid Road", "Tariq Road"],
  // Zamzama sits inside DHA Phase 5, not Clifton. It cannot be edited or
  // removed — Clifton residents may already hold it — so it is retired here
  // and resolves as an alias on DHA instead (see AREA_META above).
  "Karachi::Clifton": ["Zamzama"],
  // Owner-adjudicated: of Saddar's 17 entries only four are wanted as explicit
  // sub-areas. The rest are markets, bazaars and neighbouring localities that
  // do not need listing — including "Saddar" itself, which was listed as a
  // sub-area of the town of the same name.
  //
  // exception: "I.I. Chundrigar Road", "Ranchore Line" and "Civil Line" are
  // KEPT despite being road names, which the rule below otherwise retires.
  // They are how Karachi actually refers to those areas — I.I. Chundrigar Road
  // is the financial district — so they name a place people live and work in,
  // not merely a street. Do not "finish the job" by deprecating them.
  "Karachi::Saddar": [
    "Saddar",
    "Kharadar",
    "Mithadar",
    "Bombay Bazar",
    "Lee Market",
    "Bohri Bazaar",
    "Nanakwara",
    "Nishtar Road",
    "Pan Mandi",
    "Kagzi Bazar",
    "Kakri Ground",
    "Aram Bagh",
    "Napier Quarter",
  ],
  // Owner-confirmed: DHA Karachi has NO Phase 9. The phases run 1 to 8 plus the
  // Extensions. Creek Vista is a development inside Phase 8, so the entry names
  // a phase that does not exist and files a Phase 8 resident under it.
  //
  // Retired rather than replaced. An earlier pass added a bare "Phase 9"
  // alongside it, which was wrong — it would have put a non-existent phase in
  // the picker permanently, and this registry cannot take an entry back once
  // released. No project-level "Creek Vista" is added either: that would put a
  // third granularity into a two-level registry, the defect DHA Lahore has.
  //
  // Creek Vista residents select Phase 8, which is where Creek Vista is. Anyone
  // already holding the compound almost certainly means Phase 8 too, but P3.1
  // should prompt rather than reassign silently.
  "Karachi::DHA": ["Phase 9 (Creek Vista)"],
  "Karachi::Korangi": ["Korangi Industrial Area"],
  // Same self-referential defect as Orangi: "Federal B. Area -> B Area".
  // Model Colony is now a town in its own right, so the Malir sub-area of the
  // same name is a second way to write one address. Retired, leaving Malir with
  // five options.
  "Karachi::Malir": ["Model Colony"],
  "Karachi::Federal B. Area": ["B Area"],
  "Karachi::Gulshan-e-Iqbal": ["University Road"],
  // Owner-adjudicated 2026-08-25. Steel Town is its own area (now a town);
  // Data Nagar belongs under Orangi (moved there); Gulshan-e-Rehman falls under
  // Surjani Town and needs no explicit entry.
  "Karachi::Gulshan-e-Hadeed": [
    "Mehran Road",
    "Steel Town",
    "Shah Latif Town",
    "Data Nagar",
    "Gulshan-e-Mauzzam",
    "Gulshan-e-Rehman",
  ],
  // Owner-adjudicated: Banaras Town falls under SITE; Bilal Colony and Moria
  // Goth under Korangi; Katti Pahari and Bangla Bazaar under Orangi itself.
  // None needs an explicit entry.
  "Karachi::Orangi Town": [
    // Selecting "Orangi Town -> Orangi" conveys nothing the town did not
    // already say. Caught by the substring lint below.
    "Orangi",
    "Bangla Bazaar",
    "Banaras Town",
    "Bilal Colony",
    "Katti Pahari",
    "Moria Goth",
  ],
  "Hyderabad::Qasimabad": ["Alamdar Chowk"],
};

// ---------------------------------------------------------------------------
// Centroids — P2-6. Sourced 2026-08-26, NOT hand-written.
// ---------------------------------------------------------------------------
//
// WHAT A CENTROID IS FOR HERE, because it decides how good it has to be: it is
// where to point the MAP CAMERA for someone who has picked a city and a town
// but has no pin yet. Nothing is placed, nothing is saved, and the user still
// drags their own marker onto their own roof. `getSelectionRegion` reads these;
// `pinReducer`'s `centroid` event still does not.
//
// PROVENANCE. Generated by `scripts/geocode-spike/centroid-sweep.js`, which
// forward-geocodes every registry name through two independent gazetteers and
// keeps an entry only when they agree:
//
//   - The coordinate is LocationIQ's — hosted Nominatim, so OSM-derived and
//     ODbL, which permits a persistent lookup with attribution. Attribution is
//     owed and is NOT yet surfaced anywhere in the app: see the handoff.
//   - Google geocoded the same name as an independent CHECK and its
//     coordinates are not in this file. Google's terms forbid building a
//     persistent lookup from its output, so it gates acceptance and contributes
//     no value.
//
// Agreement tolerances are sized against the viewport the number feeds, not
// against any idea of correctness: 20km for a city (CITY_DELTA 0.2 degrees is a
// ~22km view) and 5km for an area (AREA_DELTA 0.05 is ~5.5km). A disagreement
// smaller than the viewport cannot push the right rooftops off screen.
//
// COVERAGE IS PARTIAL ON PURPOSE: 54/58 cities, 214/263 areas. Everything the
// two providers disagreed about was DROPPED rather than averaged or guessed. A
// missing centroid costs nothing — an area falls back to its city, and a city
// to PAKISTAN_CENTER, which is exactly today's behaviour. A wrong one opens the
// map on a confident, plausible, wrong neighbourhood, which is why this table
// stayed empty for a release rather than being filled in by hand.
//
// TO REGENERATE (needs both keys in `.env.geocode`, ~10 minutes, resumable):
//   set -a; source .env.geocode; set +a
//   node scripts/geocode-spike/centroid-sweep.js
// then paste `out/centroids.generated.ts` over the two tables below. The
// rejected names and the reason for each are in `out/centroids-report.md`.

/** City name -> [lng, lat], GeoJSON order. */
export const CITY_CENTROIDS: Record<string, readonly [number, number]> = {
  "Abbottabad": [73.213275, 34.143614],
  "Bagh": [73.773788, 33.980008],
  "Bahawalpur": [71.652345, 29.40295],
  "Bhimber": [74.073853, 32.974059],
  "Chaman": [66.44053, 30.924945],
  "Charsadda": [71.759294, 34.150946],
  "Chilas": [74.096314, 35.419503],
  "Dera Ghazi Khan": [70.640111, 30.032137],
  "Dera Ismail Khan": [70.909092, 31.827527],
  "Dera Murad Jamali": [68.220304, 28.548453],
  "Faisalabad": [73.092325, 31.422056],
  "Gilgit": [74.314044, 35.92081],
  "Gujranwala": [74.193375, 32.152531],
  "Gujrat": [74.064535, 32.562785],
  "Gwadar": [62.325455, 25.147982],
  "Hunza": [74.613428, 36.299319],
  "Hyderabad": [68.361346, 25.407536],
  "Islamabad": [73.065151, 33.693812],
  "Jacobabad": [68.436436, 28.281309],
  "Jhang": [72.310307, 31.27288],
  "Karachi": [67.020706, 24.854684],
  "Kasur": [74.447831, 31.117514],
  "Khairpur": [68.738315, 27.520487],
  "Khuzdar": [66.616654, 27.800013],
  "Kohat": [71.439994, 33.596714],
  "Lahore": [74.314183, 31.565682],
  "Larkana": [68.210151, 27.55648],
  "Loralai": [68.600065, 30.366865],
  "Mansehra": [73.199313, 34.328685],
  "Mardan": [72.045147, 34.193797],
  "Mingora": [72.360771, 34.772537],
  "Mirpur": [73.74821, 33.148635],
  "Mirpur Khas": [69.011239, 25.526388],
  "Multan": [71.471968, 30.197838],
  "Muzaffarabad": [73.470241, 34.373475],
  "Nawabshah": [68.404023, 26.245292],
  "Nowshera": [71.981283, 34.015561],
  "Peshawar": [71.578746, 34.012385],
  "Quetta": [67.000756, 30.191627],
  "Rahim Yar Khan": [70.303424, 28.422541],
  "Rawalakot": [73.760575, 33.857228],
  "Rawalpindi": [73.048313, 33.603705],
  "Sahiwal": [73.111057, 30.67151],
  "Sargodha": [72.676461, 32.083651],
  "Sheikhupura": [73.986401, 31.708528],
  "Shikarpur": [68.646748, 27.957908],
  "Sialkot": [74.541157, 32.493538],
  "Sibi": [67.88334, 29.55001],
  "Skardu": [75.640075, 35.286372],
  "Sukkur": [68.866308, 27.700752],
  "Swabi": [72.474316, 34.126214],
  "Thatta": [67.924028, 24.7469],
  "Turbat": [63.050561, 26.002789],
  "Zhob": [69.4477, 31.339706],
};

/** `${city}::${town}` -> [lng, lat], GeoJSON order. */
export const AREA_CENTROIDS: Record<string, readonly [number, number]> = {
  "Faisalabad::Batala Colony": [73.096658, 31.394204],
  "Faisalabad::Civil Lines": [73.088135, 31.43041],
  "Faisalabad::Eden Valley": [73.156594, 31.434792],
  "Faisalabad::Ghulam Muhammad Abad": [73.047399, 31.445419],
  "Faisalabad::Gulberg": [73.061279, 31.424179],
  "Faisalabad::Jinnah Colony": [73.066547, 31.420366],
  "Faisalabad::Millat Town": [73.104215, 31.471563],
  "Faisalabad::Peoples Colony": [73.09572, 31.398556],
  "Faisalabad::Samanabad": [73.065104, 31.391573],
  "Faisalabad::Susan Road": [73.117571, 31.421815],
  "Faisalabad::Tariq Abad": [73.103212, 31.426874],
  "Gujranwala::Cantt": [74.163656, 32.245096],
  "Gujranwala::Civil Lines": [74.191706, 32.174204],
  "Gujranwala::Model Town": [74.178837, 32.174269],
  "Gujranwala::Peoples Colony": [74.208996, 32.137611],
  "Gujranwala::Satellite Town": [74.191182, 32.157126],
  "Gujranwala::Shabbir Colony": [74.18949, 32.159008],
  "Gujranwala::Trust Colony": [74.191357, 32.162395],
  "Hyderabad::Cantonment": [68.361144, 25.379608],
  "Hyderabad::Gulshan-e-Shahbaz": [68.26782, 25.38605],
  "Hyderabad::Hirabad": [68.369411, 25.405079],
  "Hyderabad::Hussainabad": [68.322396, 25.377126],
  "Hyderabad::Kotri": [68.298259, 25.366818],
  "Hyderabad::Latifabad": [68.362903, 25.361738],
  "Hyderabad::Qasimabad": [68.334309, 25.393064],
  "Hyderabad::Saddar": [68.364583, 25.393228],
  "Islamabad::Bahria Town Islamabad": [73.132755, 33.566825],
  "Islamabad::Bani Gala": [73.153595, 33.710059],
  "Islamabad::Blue Area": [73.078794, 33.722053],
  "Islamabad::CBR Town": [73.140936, 33.55735],
  "Islamabad::DHA Islamabad": [73.131408, 33.531288],
  "Islamabad::Gulberg Residencia": [73.167706, 33.607951],
  "Islamabad::PWD Housing Scheme": [73.144914, 33.570744],
  "Islamabad::Sector B-17": [72.828639, 33.690398],
  "Islamabad::Sector D-17": [72.854619, 33.657148],
  "Islamabad::Sector E-11": [72.976575, 33.697181],
  "Islamabad::Sector E-7": [73.045442, 33.725313],
  "Islamabad::Sector E-8": [73.034923, 33.721893],
  "Islamabad::Sector E-9": [73.020068, 33.715527],
  "Islamabad::Sector F-10": [73.006684, 33.691821],
  "Islamabad::Sector F-11": [72.989544, 33.684393],
  "Islamabad::Sector F-6": [73.073524, 33.728621],
  "Islamabad::Sector F-7": [73.056117, 33.720433],
  "Islamabad::Sector F-8": [73.0396, 33.711504],
  "Islamabad::Sector F-9 (Fatima Jinnah Park)": [73.02852, 33.708138],
  "Islamabad::Sector G-10": [73.018701, 33.677722],
  "Islamabad::Sector G-11": [72.995986, 33.665108],
  "Islamabad::Sector G-13": [72.962072, 33.651452],
  "Islamabad::Sector G-14": [72.947512, 33.64185],
  "Islamabad::Sector G-15": [72.923024, 33.632628],
  "Islamabad::Sector G-16": [72.914669, 33.626346],
  "Islamabad::Sector G-5": [73.098264, 33.720807],
  "Islamabad::Sector G-6": [73.085641, 33.715428],
  "Islamabad::Sector G-7": [73.069018, 33.706603],
  "Islamabad::Sector G-8": [73.050897, 33.696678],
  "Islamabad::Sector G-9": [73.03072, 33.691436],
  "Islamabad::Sector H-10": [73.025491, 33.662528],
  "Islamabad::Sector H-11": [73.009154, 33.654391],
  "Islamabad::Sector H-12": [72.991979, 33.643728],
  "Islamabad::Sector H-8": [73.062048, 33.680307],
  "Islamabad::Sector H-9": [73.044367, 33.672762],
  "Islamabad::Sector I-10": [73.036919, 33.648206],
  "Islamabad::Sector I-11": [73.02069, 33.640672],
  "Islamabad::Sector I-12": [73.004736, 33.626956],
  "Islamabad::Sector I-14": [72.967448, 33.61161],
  "Islamabad::Sector I-15": [72.952056, 33.601521],
  "Islamabad::Sector I-16": [72.932944, 33.593578],
  "Islamabad::Sector I-8": [73.077186, 33.668289],
  "Islamabad::Sector I-9": [73.05439, 33.659667],
  "Karachi::Agra Taj Colony": [66.981978, 24.871593],
  "Karachi::Alamgir Society": [67.181921, 24.896377],
  "Karachi::Askari 2": [67.042414, 24.847257],
  "Karachi::Askari 3": [67.041561, 24.850015],
  "Karachi::Askari 5": [67.183153, 24.942931],
  "Karachi::Azam Basti": [67.074683, 24.848104],
  "Karachi::Bahadurabad": [67.067401, 24.88234],
  "Karachi::Bath Island": [67.028183, 24.835255],
  "Karachi::Buffer Zone": [67.067015, 24.955255],
  "Karachi::Clifton": [67.02624, 24.819055],
  "Karachi::DHA": [67.080003, 24.814634],
  "Karachi::Darussalam Society": [67.113181, 24.821405],
  "Karachi::Daryabad": [66.991198, 24.862248],
  "Karachi::Dawood Cooperative Housing Society": [67.069538, 24.88867],
  "Karachi::Defence View": [67.079402, 24.836673],
  "Karachi::Drigh Colony": [67.128388, 24.884372],
  "Karachi::Essa Nagri": [67.060843, 24.890809],
  "Karachi::FC Area": [67.045674, 24.914845],
  "Karachi::Federal B. Area": [67.068957, 24.925649],
  "Karachi::Garden": [67.030918, 24.881994],
  "Karachi::Garden East": [67.030566, 24.883437],
  "Karachi::Garden West": [67.029727, 24.881275],
  "Karachi::Golimar": [67.027426, 24.892661],
  "Karachi::Goth Dad Muhammad": [67.050068, 24.88821],
  "Karachi::Gulistan-e-Jauhar": [67.138213, 24.924016],
  "Karachi::Gulshan-e-Ghazi": [66.968698, 24.933744],
  "Karachi::Gulshan-e-Hadeed": [67.360052, 24.869999],
  "Karachi::Gulshan-e-Iqbal": [67.098657, 24.906729],
  "Karachi::Gulshan-e-Maymar": [67.132281, 25.020894],
  "Karachi::Gulshan-e-Shamim": [67.075607, 24.917355],
  "Karachi::Gulzar-e-Hijri": [67.118223, 24.995593],
  "Karachi::Ibrahim Hyderi": [67.135893, 24.797538],
  "Karachi::Jacob Lines": [67.035794, 24.868189],
  "Karachi::Jamshed Quarters": [67.042236, 24.883518],
  "Karachi::Jamshed Town": [67.046186, 24.876828],
  "Karachi::Jutland Lines": [67.039394, 24.865462],
  "Karachi::KAECHS": [67.081227, 24.862268],
  "Karachi::Kalakot": [67.005619, 24.871542],
  "Karachi::Karli": [66.991302, 24.868685],
  "Karachi::Karsaz": [67.098971, 24.87782],
  "Karachi::Korangi": [67.140373, 24.820693],
  "Karachi::Korangi Industrial Area": [67.135501, 24.845816],
  "Karachi::Lalazar": [67.00293, 24.842943],
  "Karachi::Landhi": [67.211895, 24.850847],
  "Karachi::Liaquatabad": [67.038628, 24.902977],
  "Karachi::Machar Colony": [66.979858, 24.862943],
  "Karachi::Mahmudabad": [67.077995, 24.854376],
  "Karachi::Malir": [67.190242, 24.877305],
  "Karachi::Manora": [66.975174, 24.796572],
  "Karachi::Memon Nagar": [67.103644, 24.953158],
  "Karachi::Metroville": [66.997907, 24.930754],
  "Karachi::Miran Naka": [66.995648, 24.879484],
  "Karachi::Model Colony": [67.189418, 24.906833],
  "Karachi::Muslimabad": [67.049781, 24.87772],
  "Karachi::Naya Nazimabad": [67.024195, 24.97596],
  "Karachi::Nazimabad": [67.030718, 24.905865],
  "Karachi::New Karachi": [67.066952, 24.972536],
  "Karachi::New Rizvia Society": [67.147538, 24.950745],
  "Karachi::North Karachi": [67.084631, 24.943909],
  "Karachi::North Nazimabad": [67.047719, 24.942462],
  "Karachi::Old Golimar": [67.019513, 24.888763],
  "Karachi::Orangi Town": [67.012881, 24.946106],
  "Karachi::P&T Society": [67.119448, 24.829635],
  "Karachi::PECHS": [67.058724, 24.86848],
  "Karachi::Patel Para": [67.038289, 24.881008],
  "Karachi::Pathan Colony": [67.004073, 24.924595],
  "Karachi::Pioneer Park City": [67.156309, 24.925284],
  "Karachi::Qayyumabad": [67.080768, 24.829419],
  "Karachi::Ramswami": [67.015119, 24.868658],
  "Karachi::Rexber Colony": [67.021608, 24.886107],
  "Karachi::Sachal Goth": [67.12886, 24.950657],
  "Karachi::Saddar": [67.031741, 24.860571],
  "Karachi::Saeedabad": [66.999896, 24.879299],
  "Karachi::Shah Faisal Colony": [67.145214, 24.881096],
  "Karachi::Shah Latif Town": [67.268094, 24.846268],
  "Karachi::Shanti Nagar": [67.098796, 24.903623],
  "Karachi::Sher Shah Colony": [66.987179, 24.884204],
  "Karachi::Sindh Industrial Trading Estate": [66.989361, 24.90366],
  "Karachi::Soldier Bazaar": [67.031312, 24.875529],
  "Karachi::Steel Town": [67.363657, 24.863465],
  "Karachi::Sultanabad": [67.018511, 24.841822],
  "Karachi::Surjani Town": [67.061068, 25.033289],
  "Karachi::Tariq Bin Ziyad Colony": [67.175544, 24.893348],
  "Karachi::West Wharf": [66.983817, 24.846711],
  "Lahore::Bahria Town Lahore": [74.182413, 31.358067],
  "Lahore::Cantt": [74.416432, 31.484175],
  "Lahore::Cavalry Ground": [74.362158, 31.501978],
  "Lahore::DHA Lahore": [74.393866, 31.480015],
  "Lahore::Garden Town": [74.331392, 31.502705],
  "Lahore::Gulberg": [74.343018, 31.511996],
  "Lahore::Johar Town": [74.272456, 31.471041],
  "Lahore::LDA Avenue": [74.204855, 31.415968],
  "Lahore::Lake City": [74.233771, 31.362593],
  "Lahore::Model Town": [74.322794, 31.482102],
  "Lahore::Punjab Cooperative Housing Society (PCHS)": [74.408525, 31.483604],
  "Lahore::Raiwind": [74.213813, 31.244358],
  "Lahore::Sabzazar": [74.270126, 31.521793],
  "Lahore::Samanabad": [74.302295, 31.54032],
  "Lahore::Shadman": [74.32933, 31.543656],
  "Lahore::Shahdara": [74.29998, 31.651515],
  "Lahore::State Life Housing Society": [74.401078, 31.441765],
  "Lahore::Sui Gas Society": [74.399351, 31.453794],
  "Lahore::Township": [74.32008, 31.456506],
  "Lahore::Valencia Town": [74.258269, 31.406673],
  "Multan::Bosan Road": [71.478378, 30.227141],
  "Multan::Citi Housing Multan": [71.422849, 30.172254],
  "Multan::DHA Multan": [71.561516, 30.299549],
  "Multan::Gulgasht Colony": [71.474112, 30.230254],
  "Multan::Model Town": [71.460072, 30.217198],
  "Multan::Officers Colony": [71.474877, 30.211095],
  "Multan::Old Multan": [71.444979, 30.159949],
  "Multan::Qasim Bela": [71.399159, 30.191932],
  "Multan::Shah Rukn-e-Alam Colony": [71.471654, 30.199134],
  "Multan::Wapda Town": [71.505647, 30.245504],
  "Peshawar::Chamkani": [71.649159, 34.005406],
  "Peshawar::Gulbahar": [71.596938, 34.010692],
  "Peshawar::Hayatabad": [71.437258, 33.976717],
  "Peshawar::Khyber Bazaar": [71.567047, 34.008969],
  "Peshawar::Pabbi": [71.780929, 34.013374],
  "Peshawar::Peshawar Cantt": [71.550409, 34.002248],
  "Peshawar::Regi Model Town": [71.423233, 34.028442],
  "Peshawar::Saddar": [71.540023, 33.997475],
  "Peshawar::University Town": [71.503799, 34.00462],
  "Peshawar::Warsak Road": [71.533756, 34.028417],
  "Quetta::Adalat Road": [67.011802, 30.198084],
  "Quetta::Airport Road": [66.987268, 30.241043],
  "Quetta::Brewery Road": [66.987015, 30.189796],
  "Quetta::Cantonment": [67.045621, 30.226697],
  "Quetta::Jinnah Town": [67.006023, 30.222349],
  "Quetta::Samungli": [67.009887, 30.207282],
  "Quetta::Satellite Town": [67.001519, 30.166236],
  "Quetta::Spinny Road": [66.994415, 30.191142],
  "Quetta::Zarghoon Road": [66.998821, 30.180279],
  "Rawalpindi::Adiala Road": [73.061297, 33.557412],
  "Rawalpindi::Askari": [73.060432, 33.53949],
  "Rawalpindi::Bahria Town": [73.118366, 33.530822],
  "Rawalpindi::Bahria Town Phase 8": [73.095761, 33.491671],
  "Rawalpindi::Chaklala": [73.096446, 33.600917],
  "Rawalpindi::Chaklala Scheme 3": [73.088704, 33.585757],
  "Rawalpindi::Gulzar-e-Quaid": [73.130041, 33.598912],
  "Rawalpindi::Pirwadhai": [73.039381, 33.632193],
  "Rawalpindi::Raja Bazaar": [73.05634, 33.612309],
  "Rawalpindi::Rawalpindi Cantt": [73.053747, 33.591418],
  "Rawalpindi::Saddar": [73.050101, 33.597885],
  "Rawalpindi::Westridge": [73.021947, 33.61013],
};

// ---------------------------------------------------------------------------
// Province derivation
// ---------------------------------------------------------------------------

/**
 * City -> province, inverted from PAKISTAN_LOCATIONS.cities at module load.
 *
 * Computed rather than written out: a hand-maintained copy is a second source
 * of truth that can silently disagree with the first. Every city sits under
 * exactly one province, so the inversion is lossless (asserted in tests).
 */
export const PROVINCE_BY_CITY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [province, cities] of Object.entries(PAKISTAN_LOCATIONS.cities)) {
    for (const city of cities) map[city] = province;
  }
  return map;
})();

/**
 * The province a city belongs to, or null when the city is not in the registry.
 *
 * The null case is not theoretical. City is a closed list today, so a user
 * whose city is absent has no way through — and if a `cityOther` escape is ever
 * added, this returns null, `province` goes empty, and `isProfileComplete`
 * fails. Callers must handle null rather than assuming a string.
 */
export function getProvinceForCity(city: string): string | null {
  return PROVINCE_BY_CITY[(city || "").trim()] ?? null;
}

// ---------------------------------------------------------------------------
// Metadata accessors — every one is total, defaulting safely on unknown keys
// ---------------------------------------------------------------------------

const DEFAULT_AREA_META: AreaMeta = {
  geocodePrefill: false,
  // Residential is the safe default: it asks for a house number, which a
  // factory can still answer with a plot number. The inverse default would ask
  // a household for its "unit / building name", which most cannot answer.
  residential: true,
  // An area nobody has curated has not demonstrated coverage.
  subAreaRequired: false,
  blockLabel: "Area",
  aliases: [],
};

/**
 * Operational tier for a city: whether collections run there, or are planned.
 *
 * NOT the same axis as registry depth — use `cityHasTowns` for that. A city can
 * have full town data and no operations (Gujranwala), or become tier A the
 * month operations open with no registry change at all. Unlisted cities are C.
 */
export function getCoverageTier(city: string): CoverageTier {
  return CITY_COVERAGE_TIER[(city || "").trim()] ?? "C";
}

/** Metadata for an area, or safe defaults when it has no sub-area data. */
export function getAreaMeta(city: string, town: string): AreaMeta {
  return AREA_META[subAreaKey(city, town)] ?? DEFAULT_AREA_META;
}

/** What to call the sub-area field for this area. Never city-derived. */
export function getBlockLabel(city: string, town: string): string {
  return getAreaMeta(city, town).blockLabel;
}

/**
 * Whether the geocoder may pre-select this area in the CONSUMER app.
 *
 * Two conditions, and the second is independent of any measurement:
 *
 *  1. `geocodePrefill` — the per-area precision gate.
 *  2. `residential` — never prefill a consumer user into an industrial estate,
 *     port or campus.
 *
 * The second is a structural fact, not a statistic. Every consumer user is a
 * household by construction: B2B sites reach us through BrandHub and MintTrace,
 * not through this app. So a prefill naming SITE, West Wharf, Port of Karachi or
 * Korangi Industrial Area is wrong for whoever sees it, however precisely the
 * geocoder placed the coordinate — the pin may genuinely sit on an industrial
 * plot while the person filling the form lives across the road.
 *
 * This settles a whole class of geocoder disagreements without adjudicating any
 * of them: 27 of the 57 sampled disagreements resolve to a non-residential area.
 *
 * The area stays SELECTABLE and stays RESOLVABLE. A user who really is at an
 * industrial site picks it from the dropdown, and the resolver still names it
 * for anything reading `geocodedAreaRaw`. Only the pre-selection is suppressed.
 */
export function shouldPrefillArea(city: string, town: string): boolean {
  const meta = getAreaMeta(city, town);
  return meta.geocodePrefill && meta.residential;
}

/**
 * Whether people live in this area. Unknown areas are treated as residential —
 * see DEFAULT_AREA_META for why that is the safe direction.
 */
export function isResidentialArea(city: string, town: string): boolean {
  return getAreaMeta(city, town).residential;
}

/**
 * Label and placeholder for the house-number field.
 *
 * The field is `structuredAddress.houseNo` either way and is required either
 * way. Only the question changes: an industrial plot has no flat number, but
 * it does have a plot and a building, and the collector needs both.
 */
export function getHouseNoField(
  city: string,
  town: string,
): { label: string; placeholder: string } {
  return isResidentialArea(city, town)
    ? { label: "House / flat no.", placeholder: "14-B" }
    : { label: "Unit / building name", placeholder: "Plot 22, Sector B" };
}

/** Centroid for an area, or null. Null is the common case until P0.1a runs. */
export function getAreaCentroid(
  city: string,
  town: string,
): readonly [number, number] | null {
  return AREA_CENTROIDS[subAreaKey(city, town)] ?? null;
}

/** Centroid for a city, or null. */
export function getCityCentroid(city: string): readonly [number, number] | null {
  return CITY_CENTROIDS[(city || "").trim()] ?? null;
}

// ---------------------------------------------------------------------------
// Deprecated sub-areas
// ---------------------------------------------------------------------------

/**
 * True when a sub-area is hidden from NEW selections.
 *
 * These are entries that name a road or a market rather than an addressable
 * area — "MM Alam Road", "Tariq Road", "Liberty Market". Picking one produces a
 * value that looks structured and is not, which matters under a hard gate.
 *
 * They are hidden, never removed. `getSubAreasForTown` still returns them, so
 * `isLegacyTownValue` and the sub-area validation in utils/profile.ts continue
 * to accept them and no existing user is forced to re-pick. The backfill audit
 * (P3.1) prompts those users specifically instead.
 */
export function isDeprecatedSubArea(
  city: string,
  town: string,
  subArea: string,
): boolean {
  const values = DEPRECATED_SUB_AREA_VALUES[subAreaKey(city, town)];
  return values ? values.includes((subArea || "").trim()) : false;
}

/**
 * Sub-areas to OFFER in the picker: canonical minus deprecated.
 *
 * Distinct from `getSubAreasForTown`, which is the validation view and must
 * keep returning everything. Use this one for rendering, that one for deciding
 * whether a stored value is still valid — conflating them either shows users
 * roads to pick, or invalidates the profiles of users who already picked one.
 */
export function getSelectableSubAreasForTown(
  city: string,
  town: string,
): string[] {
  const all = getSubAreasForTown(city, town);
  const deprecated = DEPRECATED_SUB_AREA_VALUES[subAreaKey(city, town)];
  if (!deprecated || deprecated.length === 0) return all;
  return all.filter((value) => !deprecated.includes(value));
}

// ---------------------------------------------------------------------------
// Coarse administrative units
// ---------------------------------------------------------------------------

/**
 * Parent administrative units a geocoder returns INSTEAD of an area.
 *
 * A third failure mode, distinct from both a wrong answer and a missing
 * registry entry. "Faisal Cantonment" (58 points in the P0.1a sweep),
 * "Karachi Cantonment" (12) and "Gulberg Town" (24) are not absent from the
 * registry — the areas inside them are already registered. The geocoder simply
 * answered a rung too high.
 *
 * An alias cannot fix this, and that is the whole point of a separate set: an
 * alias asserts "this string means that one area", whereas each of these spans
 * MANY registry areas. Aliasing one would pick a single arbitrary child and
 * present it as an answer — the same class of error as reading OSM's `town`
 * field, which resolved every DHA pin to Saddar and cost 33 points of
 * precision.
 *
 * Membership is by folded name so spelling and the "Town" suffix do not matter.
 *
 * The plan proposed a second step here: use the placed pin plus AREA_CENTROIDS
 * to pick the nearest CHILD area and pre-select that, recovering ~82 points
 * without adding an entry. Measured against the sweep, it does not hold up.
 * Nearest-centroid assignment for these three units runs at a 2.4-3.0 km median
 * distance, in a city whose areas are 1-3 km across — because only 16 of
 * Karachi's areas have a sampled centroid at all, so "nearest" usually means a
 * distant area that happened to be in the sample, not the containing one.
 * Faisal Cantonment's 58 points scatter across four areas with no majority.
 *
 * That is nowhere near the >=85% precision a prefill needs, so the recovery is
 * NOT implemented: this set only prevents the mis-resolution. Revisit when
 * area centroids exist for most of Karachi — which needs boundary data or
 * P3.5's collector-verified points, not a wider sweep of the same kind.
 */
export const COARSE_ADMIN_UNITS: Record<string, ReadonlySet<string>> = {
  Karachi: new Set(
    [
      "Faisal Cantonment",
      "Karachi Cantonment",
      "Gulberg Town",
      "Malir Cantonment",
      "Cantonment",
      // Selectable in the picker, but never geocoder-resolved: OSM returns
      // "Bin Qasim Town" as the administrative PARENT of Ibrahim Hyderi, so an
      // unguarded prefill would pull those residents up to it. The picker and
      // the resolver want different answers here, which is the split this set
      // exists to express.
      "Bin Qasim Town",
      "Bin Qasim",
      // Administrative parents, evidenced not assumed: OSM returned these only
      // in the `town` field (SITE Town 50x, Jamshed Town 32x) and never as a
      // suburb or neighbourhood. Selectable so residents who identify with them
      // can pick them; never resolvable, or every PECHS and Bahadurabad pin
      // would prefill to Jamshed Town.
      "Jamshed Town",
      "S.I.T.E. Town",
      "SITE Town",
      "SITE",
      // Districts and divisions, the rungs above a town. LocationIQ returns
      // these in `city_district`, which the live parser already excludes — they
      // are listed anyway so the guard holds if a future parser reads it.
      "Karachi District",
      "Karachi Division",
      "Gulshan District",
      "Korangi District",
      "Keamari District",
      "Malir District",
      "West District",
      "Central District",
      "East District",
      "South District",
    ].map(foldName),
  ),
};

/**
 * True when a geocoder string names an administrative parent rather than an
 * area, IN THIS CITY. Callers fall back to the plain dropdown instead of
 * resolving it.
 *
 * Scoped per city because coarseness is a property of a place, not of a string,
 * and the two genuinely disagree across cities: "Gulberg Town" is an
 * administrative parent spanning many areas in Karachi, while in Lahore
 * "Gulberg" is itself the area a user would pick. A city-blind set breaks the
 * second case to fix the first.
 *
 * With no city, the guard does not apply. That is not a gap: city selection is
 * the first step of the capture flow, so the live path always knows it, and a
 * name ambiguous across cities is already refused by `resolveGeocodedName`.
 */
export function isCoarseAdminUnit(raw: string, city?: string): boolean {
  const set = COARSE_ADMIN_UNITS[(city || "").trim()];
  if (!set) return false;
  const folded = foldName(raw || "");
  if (!folded) return false;
  return set.has(folded);
}

// ---------------------------------------------------------------------------
// Geocoder name resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a raw geocoder locality to a canonical town name, or null.
 *
 * Order: exact -> folded -> alias -> fail. A failed resolution is a MISS, not a
 * partial hit: never write a raw geocoder string into `town`, the same
 * invariant `buildPayload` already enforces for user input. Callers log the
 * miss (it seeds the alias table) and fall back to asking the user.
 *
 * `city` narrows the search when known. Without it a town name that repeats
 * across cities cannot be resolved, so an ambiguous match returns null rather
 * than guessing — the composite "City::Town" key exists precisely because
 * "Cantt", "Model Town" and "Satellite Town" are not unique.
 */
/**
 * Folded spellings a name may legitimately arrive under.
 *
 * Geocoders and this registry disagree on two suffix/prefix conventions, and
 * the disagreement is systematic rather than per-place:
 *
 *   - Administrative "Town" suffix. Google returns "Landhi Town" and
 *     "North Nazimabad Town" for areas this registry calls "Landhi" and
 *     "North Nazimabad". OSM does the same.
 *   - Islamabad "Sector" prefix. OSM returns "E-7"; the registry says
 *     "Sector E-7".
 *
 * Variants are generated for BOTH sides of the comparison, so the rule works
 * whichever side carries the affix -- that symmetry is why this is a variant
 * set and not a one-directional strip of the incoming string.
 *
 * Both strips are floored on the remainder: "Town" alone must not fold to the
 * empty string and then match everything.
 */
function nameVariants(value: string): Set<string> {
  const out = new Set<string>();
  const folded = foldName(value);
  if (!folded) return out;
  out.add(folded);

  const withoutTown = folded.replace(/town$/, "");
  if (withoutTown.length >= 3) out.add(withoutTown);

  const withoutSector = folded.replace(/^sector/, "");
  if (withoutSector.length >= 2) out.add(withoutSector);

  return out;
}

function variantsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

export function resolveGeocodedName(
  raw: string,
  city?: string,
): string | null {
  const value = (raw || "").trim();
  if (!value) return null;

  // An administrative parent spans many registry areas, so there is no single
  // right answer and every available answer is wrong for most of its users.
  // Refuse before matching rather than after: the affix-tolerant pass below
  // would happily fold "Gulberg Town" to "gulberg" and hand back a real,
  // confident, wrong area.
  if (city && isCoarseAdminUnit(value, city)) return null;


  const candidateCities = city?.trim()
    ? [city.trim()]
    : Object.keys(PAKISTAN_LOCATIONS.towns);

  const needle = foldName(value);
  const needleVariants = nameVariants(value);
  // Keyed by "City::Town", not by town name: "Cantt", "Model Town" and
  // "Satellite Town" each exist in several cities, and deduping on the bare
  // name would silently collapse four different places into one confident
  // answer. That is the exact failure the composite key exists to prevent.
  const matches = new Map<string, string>();

  for (const candidateCity of candidateCities) {
    for (const town of getTownsForCity(candidateCity)) {
      const key = subAreaKey(candidateCity, town);
      if (town === value || foldName(town) === needle) {
        matches.set(key, town);
        continue;
      }
      const aliases = AREA_META[key]?.aliases;
      if (aliases?.some((alias) => foldName(alias) === needle)) {
        matches.set(key, town);
        continue;
      }
      // Affix-tolerant pass runs last so an exact or alias hit always wins.
      if (variantsIntersect(needleVariants, nameVariants(town))) {
        matches.set(key, town);
        continue;
      }
      if (aliases?.some((alias) => variantsIntersect(needleVariants, nameVariants(alias)))) {
        matches.set(key, town);
      }
    }
  }

  // A deprecated town's own name can tie with a live parent's alias for it --
  // "Shanti Nagar" is both a hidden town and the alias its real neighbour
  // (Gulshan-e-Iqbal) carries for the same geocoder string, because it was
  // re-parented rather than retired. That is not a genuine ambiguity: the
  // deprecated candidate can never be the answer, so it is dropped before
  // judging ambiguity. A tie between two LIVE towns is left untouched.
  let candidates = [...matches.entries()];
  if (candidates.length > 1) {
    const live = candidates.filter(
      ([key, town]) => !isDeprecatedTown(key.split("::")[0], town),
    );
    if (live.length > 0) candidates = live;
  }

  // Ambiguous across cities is a miss, not a coin flip.
  if (candidates.length !== 1) return null;
  const [resolvedCity, resolved] = candidates[0];

  // A deprecated town is hidden from the picker, so prefilling one would seat a
  // value the user can neither see nor re-pick. Tested on the RESOLVED name,
  // not the input: "Mehmoodabad" is not itself a deprecated string, but it is
  // an alias of one. Storage and validation are untouched — only this geocoder
  // path refuses.
  if (isDeprecatedTown(resolvedCity.split("::")[0], resolved)) return null;
  return resolved;
}

