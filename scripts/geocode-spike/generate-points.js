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
 * An area may be described by SEVERAL boxes, because most of these places are
 * not rectangles. One box around an irregular area (Korangi, DHA) swallows a
 * large slice of its neighbours, and every point that lands there is one the
 * geocoder answers correctly and the scorer counts as a miss — which pushes a
 * good area below the promotion threshold. Several tighter boxes approximate
 * the real footprint far better.
 *
 * A bare object is still accepted so older extents files keep working.
 */
function normalizeBoxes(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((b) => b && typeof b.minLat === "number");
}

/** Rough relative area, cos-corrected so boxes at different latitudes compare fairly. */
function boxArea(b) {
  const midLat = (b.minLat + b.maxLat) / 2;
  return (
    (b.maxLat - b.minLat) *
    (b.maxLng - b.minLng) *
    Math.cos((midLat * Math.PI) / 180)
  );
}

/**
 * Splits `total` points across boxes in proportion to their area.
 *
 * Proportional rather than equal: an equal split would give a small sliver the
 * same weight as the main body, over-sampling one corner of the area and
 * under-sampling everything else. Largest-remainder so the parts sum to
 * exactly `total`, and every box gets at least one point.
 */
function allocate(boxes, total) {
  const areas = boxes.map(boxArea);
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

function inside(b, lat, lng, pad = 0) {
  return (
    lat >= b.minLat - pad && lat <= b.maxLat + pad &&
    lng >= b.minLng - pad && lng <= b.maxLng + pad
  );
}

/**
 * Boundary means "near the edge of the AREA", not "near the edge of a box".
 *
 * Where two boxes abut, the shared edge is interior to the area. Judging each
 * box in isolation would label those points boundary, inflating the boundary
 * sample with points that are nowhere near the real edge — and boundary-correct
 * is one of the three promotion conditions, so that distortion would feed
 * straight into whether an area is trusted for auto-fill.
 */
function classify(boxes, box, lat, lng) {
  const latSpan = box.maxLat - box.minLat;
  const lngSpan = box.maxLng - box.minLng;
  const latEdge = Math.min(lat - box.minLat, box.maxLat - lat) / latSpan;
  const lngEdge = Math.min(lng - box.minLng, box.maxLng - lng) / lngSpan;
  if (Math.min(latEdge, lngEdge) > BOUNDARY_BAND) return "interior";

  // Near this box's edge — but if a sibling box covers the point, that edge is
  // internal to the area.
  const pad = Math.min(latSpan, lngSpan) * BOUNDARY_BAND;
  for (const other of boxes) {
    if (other === box) continue;
    if (inside(other, lat, lng, pad)) return "interior";
  }
  return "boundary";
}

/**
 * Jittered grid over a bbox. Returns `count` points; each is classified against
 * the whole box set, not this box alone.
 */
function gridPoints(bbox, count, seed, allBoxes) {
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

      const position = classify(allBoxes ?? [bbox], bbox, lat, lng);

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

  for (const [key, raw] of Object.entries(extents)) {
    const boxes = normalizeBoxes(raw);
    if (!boxes.length) {
      problems.push(`${key}: malformed bbox`);
      continue;
    }
    const inverted = boxes.filter(
      (b) => b.minLat >= b.maxLat || b.minLng >= b.maxLng,
    );
    if (inverted.length) {
      problems.push(`${key}: ${inverted.length} inverted bbox(es)`);
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
  const multi = Object.entries(extents).filter(([, v]) => normalizeBoxes(v).length > 1);
  console.log(`towns covered  : ${covered.town.size}`);
  if (multi.length) {
    console.log(`multi-box areas: ${multi.length} (${multi.map(([k, v]) => `${k.split("::").pop()}×${normalizeBoxes(v).length}`).join(", ")})`);
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
