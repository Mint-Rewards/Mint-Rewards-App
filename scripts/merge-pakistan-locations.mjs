/**
 * Turns the OSM cache into merged location data, and says what it changed.
 *
 * Second half of build-pakistan-locations.mjs, kept separate so this can be
 * re-run and adjusted without three more passes over 27 million elements.
 *
 *   node scripts/merge-pakistan-locations.mjs [--write]
 *
 * CURATED DATA ALWAYS WINS. The existing file carries decisions this cannot
 * see — which towns take a sub-area step, whether a block is labelled "Block"
 * or "Sector" — so OSM may only ADD. Nothing curated is renamed, reordered or
 * removed.
 */
import fs from "node:fs";
import { PAKISTAN_LOCATIONS as CURATED } from "../utils/pakistan_locations.ts";

/**
 * Mirrors `foldName` in utils/pakistan_areas.ts.
 *
 * Copied rather than imported: that module reaches the "@/" alias graph, which
 * a plain node script cannot resolve without dragging in the bundler. Four
 * lines, and the invariant tests compare against the real one — so if these
 * ever disagree, the suite says so rather than this quietly admitting a
 * duplicate.
 */
const foldName = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Mirrors `nameVariants` in utils/pakistan_areas.ts.
 *
 * Resolution is affix-tolerant on BOTH sides, because geocoders and this
 * registry disagree systematically rather than per place: OSM says "E-7"
 * where the registry says "Sector E-7", and "Landhi Town" where it says
 * "Landhi". So a candidate does not have to equal a curated town to collide
 * with it — it only has to share a variant.
 *
 * Without this, importing OSM's "F-10" as a town of Islamabad left
 * resolveGeocodedName("F-10") matching both it and "Sector F-10", and
 * therefore resolving to neither.
 */
const nameVariants = (value) => {
  const out = new Set();
  const folded = foldName(value);
  if (!folded) return out;
  out.add(folded);
  const withoutTown = folded.replace(/town$/, "");
  if (withoutTown.length >= 3) out.add(withoutTown);
  const withoutSector = folded.replace(/^sector/, "");
  if (withoutSector.length >= 2) out.add(withoutSector);
  return out;
};

const WRITE = process.argv.includes("--write");
const cache = JSON.parse(
  fs.readFileSync(new URL("./.pak-osm-cache.json", import.meta.url), "utf8"),
);

const CITY_KINDS = new Set(["city", "town"]);
const MAX_PARENT_KM = 25;

// ── province polygons ─────────────────────────────────────────────────────
const coords = new Map(cache.coords);
const wayRefs = new Map(cache.wayRefs);

/**
 * Stitches member ways into closed rings.
 *
 * A boundary relation is an unordered bag of ways; a ring is found by walking
 * from one way's end to whichever way starts there. Ways the extract did not
 * carry — 109 of 742, mostly shared with a neighbouring country — leave a
 * ring open, so an open ring is closed by joining its ends. At province scale
 * that shortcut is a straight line across a gap of a few kilometres, which
 * cannot move a city from one province to another.
 */
function ringsFor(wayIds) {
  const segments = wayIds
    .map((id) => wayRefs.get(id))
    .filter(Boolean)
    .map((refs) => refs.map((r) => coords.get(r)).filter(Boolean))
    .filter((pts) => pts.length > 1);

  const rings = [];
  const unused = new Set(segments.keys());
  while (unused.size) {
    const first = unused.values().next().value;
    unused.delete(first);
    const ring = [...segments[first]];
    let grew = true;
    while (grew) {
      grew = false;
      for (const i of unused) {
        const seg = segments[i];
        const head = ring[0];
        const tail = ring[ring.length - 1];
        const same = (a, b) => a[0] === b[0] && a[1] === b[1];
        if (same(tail, seg[0])) { ring.push(...seg.slice(1)); unused.delete(i); grew = true; break; }
        if (same(tail, seg[seg.length - 1])) { ring.push(...seg.slice(0, -1).reverse()); unused.delete(i); grew = true; break; }
        if (same(head, seg[seg.length - 1])) { ring.unshift(...seg.slice(0, -1)); unused.delete(i); grew = true; break; }
        if (same(head, seg[0])) { ring.unshift(...seg.slice(1).reverse()); unused.delete(i); grew = true; break; }
      }
    }
    if (ring.length > 3) rings.push(ring);
  }
  return rings;
}

const provinces = new Map();
for (const [name, wayIds] of cache.provinceWays) {
  const rings = ringsFor(wayIds);
  provinces.set(name, rings);
  const pts = rings.reduce((n, r) => n + r.length, 0);
  console.error(`  ${name.padEnd(30)} ${String(rings.length).padStart(3)} rings, ${pts} points`);
}

/** Ray casting. Odd crossings across every ring means inside. */
function inside(lon, lat, rings) {
  let crossings = 0;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) crossings++;
    }
  }
  return crossings % 2 === 1;
}

const provinceOf = (lon, lat) => {
  for (const [name, rings] of provinces) if (inside(lon, lat, rings)) return name;
  return null;
};

// ── cities ────────────────────────────────────────────────────────────────
const osmCities = [];
const osmAreas = [];
for (const p of cache.places) {
  (CITY_KINDS.has(p.kind) ? osmCities : osmAreas).push(p);
}

/*
 * A city may not be named after the administrative unit containing it.
 *
 * Reverse geocoding strips a trailing "Division", "District" or "Tehsil"
 * before matching, so a registry city literally called "Daultala Tehsil"
 * makes the stripped form collide with the real "Daultala" — and the
 * backend asserts no such city exists. OSM tags a few this way.
 */
const ADMIN_SUFFIX = /\s+(Division|District|Tehsil|Taluka|Agency|Sub-?division)$/i;

const cityProvince = new Map(); // "City" -> province
const cityPoint = new Map();
let unplaced = 0;
let suffixed = 0;
for (const c of osmCities) {
  if (ADMIN_SUFFIX.test(c.name)) { suffixed++; continue; }
  const prov = provinceOf(c.lon, c.lat);
  if (!prov) { unplaced++; continue; }
  // First wins; duplicates of a name are the same settlement mapped twice.
  if (!cityProvince.has(c.name)) {
    cityProvince.set(c.name, prov);
    cityPoint.set(c.name, [c.lon, c.lat]);
  }
}
console.error(`\ncities placed: ${cityProvince.size}, outside every province: ${unplaced}, named after an admin unit: ${suffixed}`);

// Curated cities keep their curated province, whatever OSM thinks.
for (const [prov, list] of Object.entries(CURATED.cities)) {
  for (const city of list) cityProvince.set(city, prov);
}

// ── towns, by nearest city ────────────────────────────────────────────────
const R = 6371;
const km = (a, b) => {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const cityList = [...cityPoint.entries()];
const townsByCity = new Map();
let orphan = 0;
for (const a of osmAreas) {
  let best = null;
  let bestKm = Infinity;
  for (const [name, pt] of cityList) {
    const d = km([a.lon, a.lat], pt);
    if (d < bestKm) { bestKm = d; best = name; }
  }
  if (!best || bestKm > MAX_PARENT_KM) { orphan++; continue; }
  const set = townsByCity.get(best) ?? new Set();
  set.add(a.name);
  townsByCity.set(best, set);
}
console.error(`areas placed: ${[...townsByCity.values()].reduce((n, s) => n + s.size, 0)}, too far from any city: ${orphan}`);

// ── merge, curated first ──────────────────────────────────────────────────
const mergedCities = {};
for (const prov of CURATED.provinces) {
  const curated = CURATED.cities[prov] ?? [];
  const extra = [...cityProvince.entries()]
    .filter(([name, p]) => p === prov && !curated.includes(name))
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
  mergedCities[prov] = [...curated, ...extra];
}

/*
 * What an added town must not collide with.
 *
 * The registry is governed by invariants that cost real debugging to arrive
 * at, and the suite states them: no two towns in a city may FOLD to the same
 * name, and a name may not be both a town and another town's sub-area. The
 * second is the Zamzama rule — Zamzama is a sub-area of DHA, and adding it as
 * a town of Clifton is precisely the mis-parenting a test is named after.
 *
 * Folded, not lowercased. "Begumpura" and "Begampura" are the same place to
 * everyone except a string comparison, and the app's own matcher folds before
 * it compares — so a pair that differs only in punctuation or a vowel would
 * make one of them unreachable in search.
 */
/*
 * Aliases a city already resolves.
 *
 * An alias exists so a name a user types reaches exactly one place — "Defence"
 * means Karachi's DHA. Adding a town literally called "Defence" leaves that
 * alias naming two places and therefore none, which is what the suite means
 * by "unable to name exactly one place".
 *
 * Read from a JSON the build step extracts, because utils/pakistan_areas.ts
 * cannot be imported here without the bundler's alias graph.
 */
const ALIAS_FOLDS = (() => {
  const url = new URL("./.pak-aliases.json", import.meta.url);
  if (!fs.existsSync(url)) return new Map();
  const raw = JSON.parse(fs.readFileSync(url, "utf8"));
  return new Map(
    Object.entries(raw).map(([city, list]) => [city, new Set(list.map(foldName))]),
  );
})();

/*
 * Bare administrative words that name no particular place.
 *
 * OSM tags a "Cantonment" in most cities, and several within one. As a picker
 * entry it asks a resident to choose between things it cannot tell apart, and
 * as a geocoder target it resolves to whichever the sweep happened to see
 * first. A real cantonment area reaches the same place through the free-text
 * "Other" box with the name people actually use.
 */
const GENERIC = new Set(
  ["cantonment", "cantt", "city", "town", "municipalcorporation", "tehsil", "district", "union", "unioncouncil", "sadar"].map(foldName),
);

function subAreaFoldsFor(city) {
  const folds = new Set();
  for (const [key, subs] of Object.entries(CURATED.subAreas)) {
    if (!key.startsWith(`${city}::`)) continue;
    for (const sub of subs) folds.add(foldName(sub));
  }
  return folds;
}

/*
 * Every variant the CURATED towns answer to, across all cities.
 *
 * `resolveGeocodedName` can be called unscoped, with no city to narrow by,
 * and then it searches the whole registry and must still name exactly one
 * place. "Bin Qasim Town" resolved to Karachi until an import added a town
 * elsewhere that folds to the same "binqasim" — after which it resolved to
 * nothing at all.
 *
 * So a candidate is refused if it collides with a curated town ANYWHERE, not
 * merely in its own city. Coverage is worth less than the resolution the
 * registry already provides.
 */
const CURATED_TOWN_VARIANTS = new Set(
  Object.values(CURATED.towns).flat().flatMap((t) => [...nameVariants(t)]),
);

const mergedTowns = {};
const allCities = Object.values(mergedCities).flat();
const rejected = { folded: 0, subArea: 0, sameAsCity: 0, alias: 0, generic: 0, crossCity: 0 };
for (const city of allCities) {
  const curated = CURATED.towns[city] ?? [];
  // Every variant the curated towns already answer to, not just their folds.
  const taken = new Set(curated.flatMap((t) => [...nameVariants(t)]));
  const subFolds = subAreaFoldsFor(city);
  const cityFold = foldName(city);

  const aliasFolds = ALIAS_FOLDS.get(city) ?? new Set();

  const extra = [];
  for (const t of [...(townsByCity.get(city) ?? [])].sort((a, b) => a.localeCompare(b))) {
    const f = foldName(t);
    const variants = nameVariants(t);
    if (f === cityFold) { rejected.sameAsCity++; continue; }
    if (GENERIC.has(f)) { rejected.generic++; continue; }
    if ([...variants].some((v) => CURATED_TOWN_VARIANTS.has(v))) {
      rejected.crossCity++;
      continue;
    }
    if ([...variants].some((v) => taken.has(v))) { rejected.folded++; continue; }
    if (subFolds.has(f)) { rejected.subArea++; continue; }
    if (aliasFolds.has(f)) { rejected.alias++; continue; }
    for (const v of variants) taken.add(v);
    extra.push(t);
  }
  if (curated.length || extra.length) mergedTowns[city] = [...curated, ...extra];
}
console.error(
  `rejected — folds onto an existing town: ${rejected.folded}, ` +
    `is already a sub-area: ${rejected.subArea}, names its own city: ${rejected.sameAsCity}, ` +
    `collides with an alias: ${rejected.alias}, names no particular place: ${rejected.generic}, ` +
    `would make a curated town ambiguous: ${rejected.crossCity}`,
);

// ── report ────────────────────────────────────────────────────────────────
const before = {
  cities: Object.values(CURATED.cities).flat().length,
  townCities: Object.keys(CURATED.towns).length,
  towns: Object.values(CURATED.towns).flat().length,
};
const after = {
  cities: Object.values(mergedCities).flat().length,
  townCities: Object.keys(mergedTowns).length,
  towns: Object.values(mergedTowns).flat().length,
};
console.error(`\n            before   after`);
console.error(`cities      ${String(before.cities).padStart(6)}  ${String(after.cities).padStart(6)}`);
console.error(`with towns  ${String(before.townCities).padStart(6)}  ${String(after.townCities).padStart(6)}`);
console.error(`towns       ${String(before.towns).padStart(6)}  ${String(after.towns).padStart(6)}`);
console.error(`sub-areas   ${String(Object.values(CURATED.subAreas).flat().length).padStart(6)}  (untouched)`);

if (!WRITE) {
  console.error("\ndry run — pass --write to update utils/pakistan_locations.ts");
  const sample = Object.entries(mergedTowns).filter(([c]) => !CURATED.towns[c]).slice(0, 5);
  console.error("\nnewly covered cities, first five:");
  for (const [city, towns] of sample)
    console.error(`  ${city}: ${towns.slice(0, 6).join(", ")}${towns.length > 6 ? ` … (${towns.length})` : ""}`);
  process.exit(0);
}

/**
 * Replaces two blocks in place, leaving the rest of the file byte-identical.
 *
 * Not a regenerate. `subAreas` is 1,109 curated entries and the file carries
 * comments explaining decisions nobody wrote down twice; rewriting it whole
 * would lose both. Brace-matched from the key rather than regexed, because a
 * name containing a brace would end a lazy match in the wrong place.
 */
function replaceBlock(source, key, rendered) {
  const at = source.indexOf(`\n  ${key}: {`);
  if (at === -1) throw new Error(`could not find ${key} in the source`);
  const open = source.indexOf("{", at);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error(`unbalanced braces in ${key}`);
  return source.slice(0, open) + rendered + source.slice(end + 1);
}

const quote = (v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const renderMap = (obj, indent = "    ") => {
  const body = Object.entries(obj)
    .map(([k, list]) => {
      const items = list.map((v) => `${indent}  ${quote(v)},`).join("\n");
      return `${indent}${quote(k)}: [\n${items}\n${indent}],`;
    })
    .join("\n");
  return `{\n${body}\n  }`;
};

const file = new URL("../utils/pakistan_locations.ts", import.meta.url);
let source = fs.readFileSync(file, "utf8");
source = replaceBlock(source, "cities", renderMap(mergedCities));
source = replaceBlock(source, "towns", renderMap(mergedTowns));
fs.writeFileSync(file, source);
console.error("\nwrote utils/pakistan_locations.ts");

/*
 * CITY_CENTROIDS is deliberately NOT written here.
 *
 * That set is the output of a measured sweep, and its absences are findings
 * rather than gaps: Hub and Kotli are missing because two providers disagreed
 * about where they are, and a test asserts they stay missing. It also feeds
 * `isFixWithinCity`, which REJECTS a user's pin that sits too far from the
 * centroid — so an unverified OSM point would not merely centre a map badly,
 * it would refuse a legitimate address.
 *
 * The imported cities therefore have no centroid and fall back, which every
 * consumer already handles. Running the sweep over them is the follow-up.
 */
