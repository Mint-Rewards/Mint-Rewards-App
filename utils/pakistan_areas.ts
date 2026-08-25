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
// Centroids — populated by the P0.1a sweep. Empty until it runs.
// ---------------------------------------------------------------------------
// Deliberately empty rather than guessed. Every consumer must handle a missing
// centroid anyway (the registry will always outrun the survey), so shipping
// them empty exercises that path from day one instead of hiding it.

/** City name -> [lng, lat], GeoJSON order. */
export const CITY_CENTROIDS: Record<string, readonly [number, number]> = {};

/** `${city}::${town}` -> [lng, lat], GeoJSON order. */
export const AREA_CENTROIDS: Record<string, readonly [number, number]> = {};

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

