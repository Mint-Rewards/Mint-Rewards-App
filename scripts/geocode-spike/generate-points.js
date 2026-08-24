/**
 * Stage 1 of the P0.1a sweep: turn hand-drawn extents into sample points.
 *
 *   node scripts/geocode-spike/generate-points.js \
 *     --extents=scripts/geocode-spike/extents.json \
 *     --out=scripts/geocode-spike/out/points.json
 *
 * WHY EXTENTS ARE HAND-DRAWN. The repo has no centroids and no boundaries, and
 * the plan explicitly forbids sampling from existing user coordinates:
 * coordinate provenance is unknown, so a disagreement between a stored pin and
 * a stored address tells you something disagrees, not which side is wrong.
 * Measuring the geocoder against that would report a false negative and kill a
 * path that may work. Someone draws a bounding box per town off satellite
 * imagery; this script does the rest.
 *
 * Points are placed on a jittered grid rather than uniformly at random, so a
 * town is covered evenly instead of clumping, and INTERIOR vs BOUNDARY is
 * recorded per point. That split matters: geocoders fail at edges, and uniform
 * sampling over-reports accuracy because most points land comfortably inside.
 */
const fs = require("fs");
const path = require("path");
const { loadRegistry } = require("./loadRegistry");
const { TOWN_LEVEL_STRATA, CITY_LEVEL_POINTS } = require("./strata");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

// Fraction of a bbox's shorter side treated as the boundary band.
const BOUNDARY_BAND = 0.15;

/** Deterministic PRNG so a rerun produces the same points. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Jittered grid over a bbox. Returns `count` points, each tagged interior or
 * boundary by how close it sits to the bbox edge.
 */
function gridPoints(bbox, count, seed) {
  const { minLat, maxLat, minLng, maxLng } = bbox;
  const rand = mulberry32(seed);
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;

  const points = [];
  for (let r = 0; r < rows && points.length < count; r++) {
    for (let c = 0; c < cols && points.length < count; c++) {
      const lat = minLat + ((r + 0.5 + (rand() - 0.5) * 0.6) / rows) * latSpan;
      const lng = minLng + ((c + 0.5 + (rand() - 0.5) * 0.6) / cols) * lngSpan;

      const latEdge = Math.min(lat - minLat, maxLat - lat) / latSpan;
      const lngEdge = Math.min(lng - minLng, maxLng - lng) / lngSpan;
      const position =
        Math.min(latEdge, lngEdge) <= BOUNDARY_BAND ? "boundary" : "interior";

      points.push({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        position,
      });
    }
  }
  return points;
}

function main() {
  const extentsPath = arg("extents", path.join(__dirname, "extents.json"));
  const outPath = arg("out", path.join(__dirname, "out", "points.json"));

  if (!fs.existsSync(extentsPath)) {
    throw new Error(
      `No extents file at ${extentsPath}.\n` +
        `Copy extents.example.json and draw a bbox per town off satellite imagery.\n` +
        `Without it there is nothing to sample — see the header of this file for why.`,
    );
  }

  const registry = loadRegistry();
  const { PAKISTAN_LOCATIONS, getTownsForCity, cityHasTowns } = registry;
  const extents = JSON.parse(fs.readFileSync(extentsPath, "utf8"));

  const points = [];
  const problems = [];
  const covered = { town: new Set(), city: new Set() };

  for (const [key, bbox] of Object.entries(extents)) {
    if (!bbox || typeof bbox.minLat !== "number") {
      problems.push(`${key}: malformed bbox`);
      continue;
    }
    if (bbox.minLat >= bbox.maxLat || bbox.minLng >= bbox.maxLng) {
      problems.push(`${key}: inverted bbox`);
      continue;
    }

    const isTownKey = key.includes("::");
    if (isTownKey) {
      const [city, town] = key.split("::");
      // A bbox for a town the registry does not list can never resolve to a
      // canonical key, so it would silently depress the hit rate.
      if (!getTownsForCity(city).includes(town)) {
        problems.push(`${key}: not a canonical town for "${city}"`);
        continue;
      }
      const plan = TOWN_LEVEL_STRATA[city];
      if (!plan) {
        problems.push(`${key}: "${city}" has no town-level sampling plan`);
        continue;
      }
      covered.town.add(key);
      for (const p of gridPoints(bbox, plan.pointsPerTown, hashSeed(key))) {
        points.push({ ...p, level: "town", stratum: plan.stratum, city, town });
      }
    } else {
      const city = key;
      if (!PROVINCE_HAS(registry, city)) {
        problems.push(`${key}: not a city in the registry`);
        continue;
      }
      if (cityHasTowns(city)) {
        problems.push(
          `${key}: has town data — give it "City::Town" extents instead of a city bbox`,
        );
        continue;
      }
      covered.city.add(city);
      for (const p of gridPoints(bbox, CITY_LEVEL_POINTS, hashSeed(key))) {
        points.push({ ...p, level: "city", stratum: "city-only", city, town: null });
      }
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(points, null, 2));

  const townTotal = Object.keys(PAKISTAN_LOCATIONS.subAreas).length;
  console.log(`points written : ${points.length} -> ${outPath}`);
  console.log(`  town-level   : ${points.filter((p) => p.level === "town").length}`);
  console.log(`  city-level   : ${points.filter((p) => p.level === "city").length}`);
  console.log(`  boundary     : ${points.filter((p) => p.position === "boundary").length}`);
  console.log(`towns covered  : ${covered.town.size}`);
  console.log(`cities covered : ${covered.city.size}`);

  if (problems.length) {
    console.log(`\n${problems.length} problem(s) — these produced NO points:`);
    for (const p of problems) console.log(`  - ${p}`);
  }
  console.log(
    `\nReminder: ${townTotal} town keys exist. Any town without an extent is` +
      ` unmeasured, and stays geocodeReliable:false regardless of how the rest score.`,
  );
}

/** True when `city` appears under some province in the registry. */
function PROVINCE_HAS(registry, city) {
  return Object.values(registry.PAKISTAN_LOCATIONS.cities)
    .flat()
    .includes(city);
}

main();
