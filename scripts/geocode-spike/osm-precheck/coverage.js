/**
 * Scores OSM name coverage against the registry — the P0.1a lower bound.
 *
 *   node scripts/geocode-spike/osm-precheck/coverage.js out/pk-places.json
 *
 * Reports three columns because the naive one is misleading: matching registry
 * strings as-is puts Islamabad at 3%, which is a NAMING artifact (registry
 * "Sector E-7" vs OSM "E-7") rather than a coverage gap. The alias column shows
 * what a small rewrite table recovers; the prefix column is a deliberate
 * over-count and is a ceiling, never an estimate.
 *
 * This measures name PRESENCE, not geocoding accuracy. It can lower the
 * ceiling on what auto-fill can achieve; it cannot raise it, and it cannot set
 * geocodeReliable.
 */
const path = require("path");
const { loadRegistry } = require(path.join(__dirname, "..", "loadRegistry.js"));
const raw = require(path.resolve(process.argv[2] || "out/pk-places.json"));
const { PAKISTAN_LOCATIONS, getTownsForCity, foldName } = loadRegistry();

const folded = new Set();
const foldedList = [];
for (const el of raw.elements) {
  for (const n of [el.tags?.name, el.tags?.["name:en"], el.tags?.alt_name, el.tags?.official_name]) {
    if (!n) continue;
    const f = foldName(n);
    if (!folded.has(f)) { folded.add(f); foldedList.push(f); }
  }
}

/** Candidate alias forms for a registry name — the kind of rules an alias table holds. */
function variants(name) {
  const v = new Set([name]);
  v.add(name.replace(/^Sector\s+/i, ""));            // "Sector E-7" -> "E-7"
  v.add(name.replace(/^(DHA|Bahria Town)\s+\w+$/i, "$1")); // "DHA Lahore" -> "DHA"
  v.add(name.replace(/\s*\(.*\)\s*/g, ""));          // drop parentheticals
  v.add(name.replace(/\bColony\b/i, "").trim());
  return [...v].filter(Boolean);
}

/** Strict: an exact folded match on some variant. */
function strictHit(name) {
  return variants(name).some((v) => folded.has(foldName(v)));
}
/** Loose: some OSM name STARTS WITH the registry name as a whole token run. */
function looseHit(name) {
  if (strictHit(name)) return true;               // superset by construction
  const cands = variants(name).map(foldName).filter((f) => f.length >= 4);
  return cands.some((c) => foldedList.some((f) => f.startsWith(c)));
}

console.log("city".padEnd(13) + "exact".padEnd(8) + "+alias".padEnd(9) + "+prefix".padEnd(9) + "of");
console.log("-".repeat(52));
let e = 0, a = 0, l = 0, tot = 0;
for (const city of Object.keys(PAKISTAN_LOCATIONS.towns)) {
  const towns = getTownsForCity(city);
  const ce = towns.filter((t) => folded.has(foldName(t))).length;
  const ca = towns.filter(strictHit).length;
  const cl = towns.filter(looseHit).length;
  e += ce; a += ca; l += cl; tot += towns.length;
  console.log(
    city.padEnd(13) +
      `${Math.round((ce / towns.length) * 100)}%`.padEnd(8) +
      `${Math.round((ca / towns.length) * 100)}%`.padEnd(9) +
      `${Math.round((cl / towns.length) * 100)}%`.padEnd(9) +
      towns.length,
  );
}
console.log("-".repeat(52));
console.log("TOTAL".padEnd(13) +
  `${Math.round((e / tot) * 100)}%`.padEnd(8) +
  `${Math.round((a / tot) * 100)}%`.padEnd(9) +
  `${Math.round((l / tot) * 100)}%`.padEnd(9) + tot);
console.log(`\nexact  = registry string folded, matched as-is`);
console.log(`+alias = a handful of rewrite rules (drop "Sector ", parentheticals, ...)`);
console.log(`+prefix= an OSM name begins with the registry name — UPPER BOUND, will`);
console.log(`         over-count ("Garden" matches "Garden East")`);
