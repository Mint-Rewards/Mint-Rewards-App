#!/usr/bin/env node
/**
 * P2-6 — sources the centroid dataset for `CITY_CENTROIDS` / `AREA_CENTROIDS`.
 *
 * THE QUESTION THIS ANSWERS is narrower than it looks. A centroid here is not
 * "where the area is" in any survey sense — it is **where to point the map
 * camera** for someone who has a city and a town but no pin. Nothing is placed,
 * nothing is saved, and the user still drags their own marker. So the bar is
 * "close enough that the right rooftops are on screen", not "correct".
 *
 * That bar is what sets the tolerances below, and it is why a REJECT is cheap:
 * a missing centroid falls back to PAKISTAN_CENTER, exactly as today. A WRONG
 * one is not cheap — it opens the map on a confident, plausible, wrong
 * neighbourhood, which is the failure mode that kept this dataset empty rather
 * than guessed. Every rule here is therefore biased towards rejecting.
 *
 * METHOD — two providers, one of which may not be persisted:
 *
 *   LocationIQ  forward-geocodes the name. Its answer is the value that ships.
 *               It is hosted Nominatim, so the coordinate is OSM-derived: ODbL,
 *               which permits building a persistent lookup with attribution.
 *   Google      forward-geocodes the same name as an INDEPENDENT CHECK ONLY.
 *               Its coordinates are never written into the registry. Google's
 *               terms forbid building a persistent lookup from its output —
 *               see the ToS notes in README.md — so it gates acceptance and
 *               contributes nothing to the shipped value.
 *
 * An entry is accepted only when both providers answer, both land inside
 * Pakistan, and they AGREE to within a tolerance sized against the map's own
 * zoom. Anything else is dropped with a recorded reason. Two independent
 * gazetteers converging on the same point is the closest thing to sourcing
 * available without a field survey; one gazetteer alone is a guess with a URL.
 *
 * Resumable: every raw response is cached in `out/centroid-cache.json`, so an
 * interrupted run (or a quota wall) costs nothing to restart.
 *
 *   set -a; source .env.geocode; set +a
 *   node scripts/geocode-spike/centroid-sweep.js
 *   node scripts/geocode-spike/centroid-sweep.js --cities-only
 */

const fs = require("fs");
const path = require("path");
const { loadRegistry } = require("./loadRegistry");
const { fetchWithPolicy } = require("./fetchWithPolicy");
const { assertNotPublicEnv } = require("./providers");

const OUT_DIR = path.join(__dirname, "out");
const CACHE_PATH = path.join(OUT_DIR, "centroid-cache.json");
const RESULT_PATH = path.join(OUT_DIR, "centroids.jsonl");
const REPORT_PATH = path.join(OUT_DIR, "centroids-report.md");
const GENERATED_PATH = path.join(OUT_DIR, "centroids.generated.ts");

// ---------------------------------------------------------------------------
// Thresholds — each one sized against what the value is actually used for
// ---------------------------------------------------------------------------

/**
 * Pakistan's bounding box, generously drawn. A forward geocode that lands
 * outside it did not find the place asked for, whatever it returned.
 */
const PK_BBOX = { minLng: 60.5, maxLng: 77.9, minLat: 23.5, maxLat: 37.2 };

/**
 * How far the two providers may disagree, in km, before the entry is dropped.
 *
 * Read these against `locationForm.ts`'s camera deltas, which are what the
 * number feeds: CITY_DELTA 0.2° is roughly a 22 km viewport, AREA_DELTA 0.05°
 * roughly 5.5 km. A disagreement smaller than the viewport cannot move the
 * right rooftops off screen; a larger one can, so it is not usable.
 */
const AGREE_KM = { city: 20, area: 5 };

/**
 * How far a town centroid may sit from its own city's, in km.
 *
 * Town names repeat nationally — "Model Town", "Satellite Town", "Cantt" exist
 * in a dozen cities — so the single most likely failure is a confident answer
 * for the RIGHT name in the WRONG city, which cross-provider agreement cannot
 * catch because both providers make it. 60 km is drawn around Karachi, the
 * largest city in the registry at roughly 40 km from centre to edge.
 */
const CITY_CONTAINMENT_KM = 60;

/** Free-tier pacing: LocationIQ caps at ~2 req/s. */
const DELAY_MS = { locationiq: 600, google: 150 };

// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Great-circle distance in km. Haversine; the earth is close enough here. */
function distanceKm([lngA, latA], [lngB, latB]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const inPakistan = ([lng, lat]) =>
  lng >= PK_BBOX.minLng &&
  lng <= PK_BBOX.maxLng &&
  lat >= PK_BBOX.minLat &&
  lat <= PK_BBOX.maxLat;

/** Six decimals is ~11cm. Anything beyond it is noise dressed as precision. */
const round6 = (n) => Number(n.toFixed(6));

// ---------------------------------------------------------------------------
// Forward geocoders. Both are SEARCH endpoints — the sweep's other scripts use
// the REVERSE ones, which is why these are not reused from providers.js.
// ---------------------------------------------------------------------------

function liqUrl(query, key) {
  return (
    "https://us1.locationiq.com/v1/search" +
    `?key=${encodeURIComponent(key)}` +
    `&q=${encodeURIComponent(query)}` +
    "&countrycodes=pk&format=json&limit=1&accept-language=en&normalizecity=1"
  );
}

function googleUrl(query, key) {
  return (
    "https://maps.googleapis.com/maps/api/geocode/json" +
    `?address=${encodeURIComponent(query)}` +
    "&components=country:PK&language=en" +
    `&key=${encodeURIComponent(key)}`
  );
}

/** `[lng, lat]` from a LocationIQ search hit, or null. */
function parseLiq(body) {
  const first = Array.isArray(body) ? body[0] : null;
  if (!first) return null;
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { point: [lng, lat], label: first.display_name ?? null };
}

/** `[lng, lat]` from a Google geocode hit, or null. */
function parseGoogleSearch(body) {
  if (body?.status === "ZERO_RESULTS") return null;
  const first = body?.results?.[0];
  const loc = first?.geometry?.location;
  if (!loc) return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { point: [lng, lat], label: first.formatted_address ?? null };
}

// ---------------------------------------------------------------------------

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

let cache = loadCache();
let cacheDirty = false;

function flushCache() {
  if (!cacheDirty) return;
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  cacheDirty = false;
}

/**
 * One geocode, cached by provider+query.
 *
 * A cached MISS is kept too. Re-asking a provider that has already said "no
 * such place" burns quota to learn nothing, and the run must be restartable
 * without paying for the whole thing again.
 */
async function geocode(provider, query, keys) {
  const cacheKey = `${provider}::${query}`;
  if (cacheKey in cache) return cache[cacheKey];

  const url =
    provider === "locationiq"
      ? liqUrl(query, keys.locationiq)
      : googleUrl(query, keys.google);

  const res = await fetchWithPolicy(url);
  await sleep(DELAY_MS[provider]);

  let value;
  if (res.fatal) {
    flushCache();
    throw new Error(`${provider}: ${res.reason}`);
  } else if (res.error) {
    // Transport failures are NOT cached — they say nothing about the place, and
    // caching one would bake a network blip into the dataset as a rejection.
    return { error: res.error };
  } else {
    const parsed =
      provider === "locationiq" ? parseLiq(res.body) : parseGoogleSearch(res.body);
    value = parsed ?? { miss: true };
  }

  cache[cacheKey] = value;
  cacheDirty = true;
  return value;
}

// ---------------------------------------------------------------------------

/**
 * The names to ask for, in order of preference. The first that both providers
 * agree on wins.
 *
 * The second form exists because of a real, systematic failure in the first
 * run: EVERY "Sector F-6, Islamabad, Pakistan" style query returned the SAME
 * LocationIQ coordinate — a "Sector G, DHA Phase 2" 25km from any of them.
 * The word "Sector" was matching a generic feature and swamping the
 * discriminating part of the name. Google answered all of them correctly, so
 * the whole of Islamabad would have been dropped over phrasing rather than
 * coverage.
 *
 * Dropping the level word is not loosening the query — "F-6" is how Islamabad
 * addresses are actually written, and the city and country still scope it. The
 * agreement check is unchanged and still decides.
 */
function queryVariants(name, city) {
  const suffix = city ? `, ${city}, Pakistan` : ", Pakistan";
  const variants = [`${name}${suffix}`];
  const bare = name.replace(/^(Sector|Block|Phase|Scheme)\s+/i, "");
  if (bare !== name) variants.push(`${bare}${suffix}`);
  return variants;
}

async function resolveVariants({ queries, kind, keys, cityCentroid }) {
  let last = null;
  for (const query of queries) {
    const out = await resolveOne({ query, kind, keys, cityCentroid });
    if (out.decision === "accept") return { ...out, query };
    // An error is a network fact, not a verdict on the name — stop rather than
    // let a blip promote the next, less preferred phrasing.
    if (out.decision === "error") return { ...out, query };
    last = { ...out, query };
  }
  return last;
}

async function resolveOne({ query, kind, keys, cityCentroid }) {
  const liq = await geocode("locationiq", query, keys);
  if (liq.error) return { decision: "error", reason: `locationiq: ${liq.error}` };
  if (liq.miss) return { decision: "reject", reason: "locationiq: no result" };
  if (!inPakistan(liq.point))
    return { decision: "reject", reason: "locationiq: outside Pakistan" };

  const google = await geocode("google", query, keys);
  if (google.error) return { decision: "error", reason: `google: ${google.error}` };
  if (google.miss)
    return { decision: "reject", reason: "google: no result (unconfirmed)" };
  if (!inPakistan(google.point))
    return { decision: "reject", reason: "google: outside Pakistan" };

  const gap = distanceKm(liq.point, google.point);
  const tolerance = AGREE_KM[kind];
  if (gap > tolerance) {
    return {
      decision: "reject",
      reason: `providers disagree by ${gap.toFixed(1)}km (max ${tolerance})`,
      gapKm: gap,
      liq: liq.point,
      google: google.point,
      liqLabel: liq.label,
      googleLabel: google.label,
    };
  }

  if (kind === "area" && cityCentroid) {
    const fromCity = distanceKm(liq.point, cityCentroid);
    if (fromCity > CITY_CONTAINMENT_KM) {
      return {
        decision: "reject",
        reason: `${fromCity.toFixed(1)}km from its own city (max ${CITY_CONTAINMENT_KM}) — probably the same name elsewhere`,
        gapKm: gap,
        liq: liq.point,
        liqLabel: liq.label,
      };
    }
  }

  return {
    decision: "accept",
    // The SHIPPED value is LocationIQ's, always. Google agreed; it did not
    // contribute. Averaging the two would embed a Google-derived number in the
    // registry, which its terms do not allow.
    point: [round6(liq.point[0]), round6(liq.point[1])],
    gapKm: gap,
    liqLabel: liq.label,
    googleLabel: google.label,
  };
}

async function main() {
  const citiesOnly = process.argv.includes("--cities-only");

  assertNotPublicEnv("LOCATIONIQ_API_KEY");
  const keys = {
    locationiq: process.env.LOCATIONIQ_API_KEY,
    google: process.env.GOOGLE_GEOCODING_API_KEY,
  };
  for (const [name, env] of [
    ["locationiq", "LOCATIONIQ_API_KEY"],
    ["google", "GOOGLE_GEOCODING_API_KEY"],
  ]) {
    if (!keys[name]) {
      console.error(
        `${env} is not set. Both providers are required: one sources the value, ` +
          `the other is the independent check that makes it sourced rather than guessed.`,
      );
      process.exit(1);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const registry = loadRegistry();
  const L = registry.PAKISTAN_LOCATIONS;
  const cities = Object.values(L.cities).flat().sort();

  const rows = [];
  const cityCentroids = {};

  console.error(`Cities: ${cities.length}`);
  for (const [i, city] of cities.entries()) {
    const out = await resolveVariants({
      queries: queryVariants(city, null),
      kind: "city",
      keys,
    });
    rows.push({ kind: "city", key: city, ...out });
    if (out.decision === "accept") cityCentroids[city] = out.point;
    flushCache();
    process.stderr.write(
      `\r  ${i + 1}/${cities.length}  ${out.decision.padEnd(6)} ${city}`.padEnd(70),
    );
  }
  process.stderr.write("\n");

  const areaCentroids = {};
  if (!citiesOnly) {
    const pairs = [];
    for (const [city, towns] of Object.entries(L.towns)) {
      for (const town of towns) pairs.push([city, town]);
    }
    console.error(`Areas: ${pairs.length}`);
    for (const [i, [city, town]] of pairs.entries()) {
      const out = await resolveVariants({
        queries: queryVariants(town, city),
        kind: "area",
        keys,
        // Containment is checked against an ACCEPTED city centroid only. An
        // unverified city point would be a rejection rule resting on a value
        // this run itself declined to trust.
        cityCentroid: cityCentroids[city] ?? null,
      });
      const key = `${city}::${town}`;
      rows.push({ kind: "area", key, ...out });
      if (out.decision === "accept") areaCentroids[key] = out.point;
      flushCache();
      process.stderr.write(
        `\r  ${i + 1}/${pairs.length}  ${out.decision.padEnd(6)} ${key}`.padEnd(70),
      );
    }
    process.stderr.write("\n");
  }

  flushCache();
  dropSharedPoints(rows, cityCentroids, areaCentroids);
  fs.writeFileSync(
    RESULT_PATH,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );

  writeReport(rows);
  writeGenerated(cityCentroids, areaCentroids, rows);

  const tally = (kind, decision) =>
    rows.filter((r) => r.kind === kind && r.decision === decision).length;
  console.error(
    `\ncities  accept ${tally("city", "accept")}  reject ${tally("city", "reject")}  error ${tally("city", "error")}` +
      `\nareas   accept ${tally("area", "accept")}  reject ${tally("area", "reject")}  error ${tally("area", "error")}` +
      `\n\n${RESULT_PATH}\n${REPORT_PATH}\n${GENERATED_PATH}`,
  );
}

/**
 * Revokes any coordinate that more than one name claims.
 *
 * Two distinct areas cannot share a centroid to six decimal places (~11cm). A
 * repeated point means the geocoder fell back to some generic feature for a
 * whole class of names — which is precisely what happened on the first run,
 * where one "Sector G, DHA Phase 2" point came back for every Islamabad sector.
 * Cross-provider agreement did catch that instance, but only because Google
 * happened to be far away; had the shared fallback landed near one of the real
 * answers, that one would have been accepted for the wrong reason.
 *
 * This runs at the END, over the whole run, because a duplicate is invisible
 * from inside any single lookup. Both claimants are revoked, not just the
 * second: nothing here says which name the point belongs to, and keeping the
 * one that happened to be geocoded first would be a coin toss recorded as data.
 */
function dropSharedPoints(rows, cityCentroids, areaCentroids) {
  const claimants = new Map();
  for (const r of rows) {
    if (r.decision !== "accept") continue;
    const at = r.point.join(",");
    if (!claimants.has(at)) claimants.set(at, []);
    claimants.get(at).push(r);
  }
  for (const [at, sharing] of claimants) {
    if (sharing.length < 2) continue;
    const others = sharing.map((r) => r.key).join(", ");
    for (const r of sharing) {
      r.decision = "reject";
      r.reason = `shares its coordinate (${at}) with: ${others} — a generic geocoder fallback, not ${sharing.length} answers`;
      delete cityCentroids[r.key];
      delete areaCentroids[r.key];
      delete r.point;
    }
  }
}

function writeReport(rows) {
  const lines = ["# Centroid sweep", ""];
  for (const kind of ["city", "area"]) {
    const of = rows.filter((r) => r.kind === kind);
    if (!of.length) continue;
    const accepted = of.filter((r) => r.decision === "accept");
    lines.push(
      `## ${kind} — ${accepted.length}/${of.length} accepted`,
      "",
      `Agreement tolerance: ${AGREE_KM[kind]}km.`,
      "",
    );
    const gaps = accepted.map((r) => r.gapKm).sort((a, b) => a - b);
    if (gaps.length) {
      const pct = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))];
      lines.push(
        `Provider gap among accepted: median ${pct(0.5).toFixed(2)}km, ` +
          `p90 ${pct(0.9).toFixed(2)}km, max ${gaps[gaps.length - 1].toFixed(2)}km.`,
        "",
      );
    }
    const bad = of.filter((r) => r.decision !== "accept");
    if (bad.length) {
      lines.push("### Not accepted", "", "| key | why |", "| --- | --- |");
      for (const r of bad) lines.push(`| ${r.key} | ${r.reason} |`);
      lines.push("");
    }
  }
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
}

function writeGenerated(cityCentroids, areaCentroids, rows) {
  const stamp = new Date().toISOString().slice(0, 10);
  const entries = (obj) =>
    Object.keys(obj)
      .sort()
      .map((k) => `  ${JSON.stringify(k)}: [${obj[k][0]}, ${obj[k][1]}],`)
      .join("\n");
  const cityTotal = rows.filter((r) => r.kind === "city").length;
  const areaTotal = rows.filter((r) => r.kind === "area").length;

  fs.writeFileSync(
    GENERATED_PATH,
    `// GENERATED by scripts/geocode-spike/centroid-sweep.js on ${stamp}.
// Source: LocationIQ forward geocode (OSM/ODbL), accepted only where an
// independent Google geocode of the same name agreed within ${AGREE_KM.city}km (city) /
// ${AGREE_KM.area}km (area). Google coordinates are NOT in this file.
// Cities ${Object.keys(cityCentroids).length}/${cityTotal}, areas ${Object.keys(areaCentroids).length}/${areaTotal}.

export const CITY_CENTROIDS: Record<string, readonly [number, number]> = {
${entries(cityCentroids)}
};

export const AREA_CENTROIDS: Record<string, readonly [number, number]> = {
${entries(areaCentroids)}
};
`,
  );
}

main().catch((e) => {
  flushCache();
  console.error(`\n${e.message}`);
  process.exit(1);
});
