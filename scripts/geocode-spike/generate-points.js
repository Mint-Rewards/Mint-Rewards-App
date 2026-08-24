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
const geo = require("./geo");

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
 * An area may be described by SEVERAL SHAPES — freehand polygons, boxes, or a
 * mix. Most of these places are not rectangles: a box around Korangi or Orangi
 * swallows a slice of the neighbouring area, and every point landing in the
 * spill is one the geocoder answers CORRECTLY while the scorer counts it as a
 * miss, pushing a good area below the promotion threshold.
 *
 * Boxes are still first-class. The regular grids (Islamabad sectors, planned
 * blocks) genuinely are rectangles, and a box says so more honestly than a
 * hand-traced outline pretending to precision it does not have.
 */
const normalizeShapes = geo.normalizeShapes;

/**
 * Splits `total` points across shapes in proportion to true area.
 *
 * Proportional rather than equal: an equal split would give a small sliver the
 * same weight as the main body, over-sampling one corner. Largest-remainder so
 * the parts sum to exactly `total`, with a floor of one point per shape.
 */
function allocate(shapes, total) {
  const areas = shapes.map((s) => geo.areaM2(s));
  const sum = areas.reduce((a, b) => a + b, 0) || 1;
  const exact = areas.map((a) => (a / sum) * total);
  const alloc = exact.map((e) => Math.max(1, Math.floor(e)));
  let diff = total - alloc.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (diff > 0) { alloc[order[k % order.length].i]++; diff--; k++; }
  while (diff < 0) {
    const cand = order[k % order.length].i;
    if (alloc[cand] > 1) { alloc[cand]--; diff++; }
    k++;
  }
  return alloc;
}

/**
 * Boundary means "near the edge of the AREA", not "near the edge of a shape".
 *
 * Where two shapes abut or overlap, that seam is internal. Judging each shape
 * alone would flood the boundary sample with points nowhere near the real edge
 * — and boundary-correct is one of the three promotion conditions, so the
 * distortion would feed straight into whether an area is trusted for auto-fill.
 *
 * The band scales with shape size (a fraction of the equal-area radius) rather
 * than being an absolute distance, which would swallow a compact area whole
 * while barely touching a large one.
 */
function classify(shapes, shape, lat, lng) {
  const band = BOUNDARY_BAND * geo.effectiveRadiusM(shape);
  if (geo.distanceToEdgeM(shape, lat, lng) > band) return "interior";
  for (const other of shapes) {
    if (other === shape) continue;
    // Inside a sibling, or comfortably within it, means this edge is internal.
    if (geo.contains(other, lat, lng) &&
        geo.distanceToEdgeM(other, lat, lng) > band) return "interior";
  }
  return "boundary";
}

/**
 * Jittered grid over a shape's bounding box, keeping only points that fall
 * inside the shape itself.
 *
 * The grid is over-provisioned by the bbox-fill ratio so a thin or L-shaped
 * polygon still yields its allocation; without that, rejection sampling would
 * quietly under-deliver exactly for the awkward shapes polygons exist to
 * describe.
 */
function gridPoints(shape, count, seed, allShapes) {
  const bb = geo.bboxOf(shape);
  const rand = mulberry32(seed);
  const bboxArea =
    geo.areaM2({ minLat: bb.minLat, maxLat: bb.maxLat, minLng: bb.minLng, maxLng: bb.maxLng });
  const fill = Math.max(0.05, geo.areaM2(shape) / bboxArea);
  const latSpan = bb.maxLat - bb.minLat;
  const lngSpan = bb.maxLng - bb.minLng;

  const points = [];
  // Densify until the quota is met, capped so a degenerate shape cannot spin.
  for (let mult = 1.3; mult <= 12 && points.length < count; mult *= 1.7) {
    points.length = 0;
    const target = Math.ceil((count / fill) * mult);
    const cols = Math.max(1, Math.ceil(Math.sqrt(target)));
    const rows = Math.max(1, Math.ceil(target / cols));
    for (let r = 0; r < rows && points.length < count; r++) {
      for (let c = 0; c < cols && points.length < count; c++) {
        const lat = bb.minLat + ((r + 0.5 + (rand() - 0.5) * 0.6) / rows) * latSpan;
        const lng = bb.minLng + ((c + 0.5 + (rand() - 0.5) * 0.6) / cols) * lngSpan;
        if (!geo.contains(shape, lat, lng)) continue;
        points.push({
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          position: classify(allShapes ?? [shape], shape, lat, lng),
        });
      }
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

  for (const [key, raw] of Object.entries(extents)) {
    const boxes = normalizeShapes(raw);
    if (!boxes.length) {
      problems.push(`${key}: no usable shape (need a bbox or a polygon of >=3 points)`);
      continue;
    }
    const bad = boxes.filter(
      (b) => !geo.isPolygon(b) && (b.minLat >= b.maxLat || b.minLng >= b.maxLng),
    );
    if (bad.length) {
      problems.push(`${key}: ${bad.length} inverted bbox(es)`);
      continue;
    }
    const tiny = boxes.filter((b) => geo.areaM2(b) < 10000); // < 1 hectare
    if (tiny.length) {
      problems.push(`${key}: ${tiny.length} shape(s) under 1 hectare — likely a misclick`);
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
      const split = allocate(boxes, plan.pointsPerTown);
      boxes.forEach((box, bi) => {
        for (const p of gridPoints(box, split[bi], hashSeed(`${key}#${bi}`), boxes)) {
          points.push({ ...p, level: "town", stratum: plan.stratum, city, town, box: bi });
        }
      });
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
      const splitC = allocate(boxes, CITY_LEVEL_POINTS);
      boxes.forEach((box, bi) => {
        for (const p of gridPoints(box, splitC[bi], hashSeed(`${key}#${bi}`), boxes)) {
          points.push({ ...p, level: "city", stratum: "city-only", city, town: null, box: bi });
        }
      });
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(points, null, 2));

  const townTotal = Object.keys(PAKISTAN_LOCATIONS.subAreas).length;
  console.log(`points written : ${points.length} -> ${outPath}`);
  console.log(`  town-level   : ${points.filter((p) => p.level === "town").length}`);
  console.log(`  city-level   : ${points.filter((p) => p.level === "city").length}`);
  console.log(`  boundary     : ${points.filter((p) => p.position === "boundary").length}`);
  const multi = Object.entries(extents).filter(([, v]) => normalizeShapes(v).length > 1);
  console.log(`towns covered  : ${covered.town.size}`);
  if (multi.length) {
    console.log(`multi-shape areas: ${multi.length} (${multi.map(([k, v]) => `${k.split("::").pop()}×${normalizeShapes(v).length}`).join(", ")})`);
  }
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
