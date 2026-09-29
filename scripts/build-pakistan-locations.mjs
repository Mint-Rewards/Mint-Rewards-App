/**
 * Rebuilds utils/pakistan_locations.ts from an OpenStreetMap extract.
 *
 * The curated list covered 58 cities and, of those, only ten had any towns —
 * so a user in Sialkot picked their city and was then offered nothing. This
 * fills that in from the same data Nominatim serves, taken offline from a
 * country extract rather than through the API: their policy is one request a
 * second, and asking it for a country would both breach that and get the
 * ops console's own search blocked.
 *
 *   node scripts/build-pakistan-locations.mjs <pakistan.osm.pbf> [--write]
 *
 * Needs `osm-pbf-parser` and `through2`, which are NOT app dependencies —
 * this is a generator run by hand when OSM is worth re-reading, not something
 * the app bundles. Install them wherever you run it and point NODE_PATH here.
 *
 * CURATED DATA ALWAYS WINS. Existing names, spellings and orderings are kept
 * exactly; OSM may only add. The curated set carries decisions this cannot
 * see — which towns take a sub-area step, which block labels read as "Sector"
 * rather than "Block" — and regenerating over them would silently undo that.
 */
import fs from "node:fs";
import parseOSM from "osm-pbf-parser";
import through from "through2";

const PBF = process.argv[2];
const WRITE = process.argv.includes("--write");
if (!PBF || !fs.existsSync(PBF)) {
  console.error("usage: node build-pakistan-locations.mjs <pakistan.osm.pbf> [--write]");
  process.exit(1);
}

/** What OSM calls each of our provinces. Anything else is another country. */
const PROVINCES = new Map([
  ["Punjab", "Punjab"],
  ["Sindh", "Sindh"],
  ["Khyber Pakhtunkhwa", "Khyber Pakhtunkhwa"],
  ["Balochistan", "Balochistan"],
  ["Islamabad Capital Territory", "Islamabad Capital Territory"],
  ["Azad Kashmir", "Azad Jammu & Kashmir"],
  ["Azad Jammu and Kashmir", "Azad Jammu & Kashmir"],
  ["Gilgit-Baltistan", "Gilgit-Baltistan"],
]);

/** A place worth offering as a city, and one worth offering as a town. */
const CITY_KINDS = new Set(["city", "town"]);
const TOWN_KINDS = new Set(["suburb", "neighbourhood", "quarter"]);

/*
 * Latin only. 98% of named places have one, and a picker that mixes scripts
 * cannot be scanned — a user looking for "Gulberg" will not find گلبرگ.
 * The remainder stay reachable through the free-text "Other" path.
 */
const LATIN = /^[\p{Script=Latin}0-9 .,'’\-\/()&]+$/u;

/**
 * How far a suburb may be from a city and still belong to it.
 *
 * 25km covers Karachi end to end. Beyond that the nearest city is a guess
 * rather than a parent, and a wrong parent is worse than no entry: it puts a
 * Hyderabad neighbourhood in Karachi's list, where someone will pick it.
 */
const MAX_PARENT_KM = 25;

const read = (label, onItem) =>
  new Promise((resolve) => {
    let n = 0;
    fs.createReadStream(PBF)
      .pipe(parseOSM())
      .pipe(
        through.obj((items, _e, next) => {
          for (const it of items) {
            n++;
            onItem(it);
          }
          next();
        }),
      )
      .on("finish", () => {
        console.error(`  ${label}: ${n.toLocaleString()} elements`);
        resolve();
      });
  });

// ── pass 1: province relations, and every place worth offering ─────────────
const provinceWays = new Map(); // canonical province -> Set(way id)
const places = [];

console.error("pass 1/3 — provinces and places");
await read("pass 1", (it) => {
  if (
    it.type === "relation" &&
    it.tags?.boundary === "administrative" &&
    it.tags?.admin_level === "4"
  ) {
    const canonical = PROVINCES.get(it.tags["name:en"]) ?? PROVINCES.get(it.tags.name);
    if (canonical) {
      const set = provinceWays.get(canonical) ?? new Set();
      for (const m of it.members ?? []) {
        // Outer rings only; an inner ring is a hole and never a border here.
        if (m.type === "way" && m.role !== "inner") set.add(m.id);
      }
      provinceWays.set(canonical, set);
    }
    return;
  }
  if (it.type !== "node") return;
  const kind = it.tags?.place;
  if (!kind || (!CITY_KINDS.has(kind) && !TOWN_KINDS.has(kind))) return;
  const name = (it.tags["name:en"] || it.tags.name || "").trim();
  if (!name || !LATIN.test(name)) return;
  places.push({ name, kind, lat: it.lat, lon: it.lon });
});
console.error(`  provinces with a boundary: ${provinceWays.size}`);
console.error(`  places: ${places.length}`);

// ── pass 2: the ways those relations are made of ──────────────────────────
const wanted = new Set();
for (const set of provinceWays.values()) for (const id of set) wanted.add(id);
const wayRefs = new Map();

console.error("pass 2/3 — boundary ways");
await read("pass 2", (it) => {
  if (it.type === "way" && wanted.has(it.id)) wayRefs.set(it.id, it.refs ?? []);
});
console.error(`  ways resolved: ${wayRefs.size} of ${wanted.size}`);

// ── pass 3: the coordinates of their nodes ────────────────────────────────
const neededNodes = new Set();
for (const refs of wayRefs.values()) for (const r of refs) neededNodes.add(r);
const coords = new Map();

console.error("pass 3/3 — boundary coordinates");
await read("pass 3", (it) => {
  if (it.type === "node" && neededNodes.has(it.id)) coords.set(it.id, [it.lon, it.lat]);
});
console.error(`  coordinates: ${coords.size} of ${neededNodes.size}`);

fs.writeFileSync(
  new URL("./.pak-osm-cache.json", import.meta.url),
  JSON.stringify({
    places,
    provinceWays: [...provinceWays].map(([p, s]) => [p, [...s]]),
    wayRefs: [...wayRefs],
    coords: [...coords],
  }),
);
console.error("cached to scripts/.pak-osm-cache.json");
