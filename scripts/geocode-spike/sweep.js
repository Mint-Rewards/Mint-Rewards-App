/**
 * Stage 2 of P0.1a: query the geocoder for every sample point.
 *
 *   node scripts/geocode-spike/sweep.js --nominatim=http://HOST:8080
 *   node scripts/geocode-spike/sweep.js --nominatim=http://HOST:8080 --google --google-cap=200
 *
 * Answers ONE question per point: does the geocoder return a locality that
 * resolves to a canonical registry key? That is "did we get a usable answer",
 * not "was the answer correct" — correctness is P0.1b and needs labels. This
 * stage needs none, which is why it can run first and may settle the branch on
 * its own: if canonical resolution is low everywhere, correctness is academic
 * because the auto-fill path does not exist regardless.
 *
 * Results append to results.jsonl as they arrive, so an interrupted run
 * resumes instead of restarting. A country-scale sweep is long enough that
 * losing it to a dropped connection is a real cost.
 */
const fs = require("fs");
const path = require("path");
const { loadRegistry } = require("./loadRegistry");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const OUT_DIR = path.join(__dirname, "out");
const RESULTS = path.join(OUT_DIR, "results.jsonl");

// Even self-hosted. The box is ours and unmetered, but a tight loop still
// buries it, and pacing costs nothing on a run measured in hours.
const NOMINATIM_DELAY_MS = Number(arg("delay", "120"));
const REQUEST_TIMEOUT_MS = 10000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "mint-rewards-geocode-spike/1.0" },
    });
    if (!res.ok) return { __error: `http ${res.status}` };
    return await res.json();
  } catch (e) {
    return { __error: e.name === "AbortError" ? "timeout" : String(e.message) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Nominatim's address object does not use Google's field names, and is
 * inconsistent about which key carries the locality — so all three candidates
 * are tried before declaring a miss. Reading only `suburb` would under-report
 * the hit rate and could sink the whole provider decision on a field-name
 * detail.
 */
function readNominatim(body) {
  const a = body?.address ?? {};
  return {
    areaRaw: a.suburb ?? a.city_district ?? a.neighbourhood ?? null,
    cityRaw: a.city ?? a.town ?? a.municipality ?? null,
    blockHint: a.neighbourhood ?? a.residential ?? null,
    road: a.road ?? null,
    houseNumber: a.house_number ?? null,
  };
}

function readGoogle(body) {
  const first = body?.results?.[0];
  const get = (type) =>
    first?.address_components?.find((c) => c.types.includes(type))?.long_name ?? null;
  return {
    areaRaw: get("sublocality") ?? get("sublocality_level_1") ?? null,
    cityRaw: get("locality") ?? null,
    blockHint: get("sublocality_level_2") ?? null,
    road: get("route") ?? null,
    houseNumber: get("street_number") ?? null,
  };
}

async function main() {
  const base = arg("nominatim");
  if (!base) {
    throw new Error(
      "--nominatim=http://HOST:PORT is required.\n" +
        "This is the self-hosted instance (PC-3). Do NOT point it at " +
        "nominatim.openstreetmap.org: the public instance caps at 1 req/sec " +
        "and its usage policy prohibits bulk work like this sweep.",
    );
  }

  const pointsPath = arg("points", path.join(OUT_DIR, "points.json"));
  if (!fs.existsSync(pointsPath)) {
    throw new Error(`No points at ${pointsPath} — run generate-points.js first.`);
  }
  const points = JSON.parse(fs.readFileSync(pointsPath, "utf8"));

  const useGoogle = flag("google");
  const googleCap = Number(arg("google-cap", "200"));
  const googleKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (useGoogle && !googleKey) {
    throw new Error("--google given but GOOGLE_GEOCODING_API_KEY is not set.");
  }
  if (useGoogle) {
    // The only metered spend in the plan. Capped, and only as a baseline to
    // show what self-hosting gives up.
    console.log(`Google baseline ENABLED, hard cap ${googleCap} calls.`);
  }

  const { resolveGeocodedName } = loadRegistry();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const done = new Set();
  if (fs.existsSync(RESULTS)) {
    for (const line of fs.readFileSync(RESULTS, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { done.add(JSON.parse(line).id); } catch { /* skip partial line */ }
    }
    console.log(`resuming: ${done.size} point(s) already done`);
  }
  const sink = fs.createWriteStream(RESULTS, { flags: "a" });

  let googleUsed = 0;
  let i = 0;
  for (const p of points) {
    const id = `${p.city}|${p.town ?? ""}|${p.lat},${p.lng}`;
    i++;
    if (done.has(id)) continue;

    const nomUrl =
      `${base.replace(/\/$/, "")}/reverse` +
      `?format=jsonv2&addressdetails=1&zoom=16&lat=${p.lat}&lon=${p.lng}`;
    const nomBody = await getJson(nomUrl);
    const nom = nomBody.__error ? null : readNominatim(nomBody);

    // Town-level points resolve against their own city; city-level points have
    // no town to resolve, so only city correctness is scored for them.
    const nomResolved =
      nom?.areaRaw && p.level === "town"
        ? resolveGeocodedName(nom.areaRaw, p.city)
        : null;

    let goog = null;
    let googResolved = null;
    if (useGoogle && googleUsed < googleCap) {
      googleUsed++;
      const gUrl =
        `https://maps.googleapis.com/maps/api/geocode/json` +
        `?latlng=${p.lat},${p.lng}&key=${googleKey}`;
      const gBody = await getJson(gUrl);
      goog = gBody.__error ? null : readGoogle(gBody);
      googResolved =
        goog?.areaRaw && p.level === "town"
          ? resolveGeocodedName(goog.areaRaw, p.city)
          : null;
    }

    sink.write(
      JSON.stringify({
        id,
        city: p.city,
        town: p.town,
        level: p.level,
        stratum: p.stratum,
        position: p.position,
        lat: p.lat,
        lng: p.lng,
        nominatim: nom,
        nominatimError: nomBody.__error ?? null,
        nominatimResolved: nomResolved,
        google: goog,
        googleResolved: googResolved,
      }) + "\n",
    );

    if (i % 25 === 0) {
      process.stdout.write(`  ${i}/${points.length}\r`);
    }
    await sleep(NOMINATIM_DELAY_MS);
  }

  sink.end();
  console.log(`\nsweep complete -> ${RESULTS}`);
  if (useGoogle) console.log(`Google calls used: ${googleUsed}/${googleCap}`);
  console.log("Next: node scripts/geocode-spike/report.js");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
