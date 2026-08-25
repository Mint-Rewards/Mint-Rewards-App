/**
 * Stage 3 of P0.1a: score the sweep and emit its by-products.
 *
 *   node scripts/geocode-spike/report.js
 *
 * Produces:
 *   report.md       per-town table, city-resolution figure, Nominatim/Google comparison
 *   unmatched.log   localities that returned but failed canonical resolution (alias seed)
 *   centroids.json  mean coordinate + max sample radius per town (see caveat below)
 *
 * The report deliberately does NOT write geocodeReliable flags. Promotion is a
 * reviewed decision that also needs P0.1b, and a script that edits the registry
 * would make an unreviewed promotion a one-command mistake.
 */
const fs = require("fs");
const path = require("path");
const { PROMOTION, PROMOTION_MIN_SAMPLES } = require("./strata");

const OUT = path.join(__dirname, "out");
const RESULTS = path.join(OUT, "results.jsonl");

const pct = (n, d) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);
const ratio = (n, d) => (d === 0 ? 0 : n / d);

function main() {
  if (!fs.existsSync(RESULTS)) {
    throw new Error(`No results at ${RESULTS} — run sweep.js first.`);
  }
  const rows = fs
    .readFileSync(RESULTS, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  const townRows = rows.filter((r) => r.level === "town");
  const cityRows = rows.filter((r) => r.level === "city");

  // ---- per-town ----------------------------------------------------------
  const byTown = new Map();
  for (const r of townRows) {
    const key = `${r.city}::${r.town}`;
    if (!byTown.has(key)) {
      byTown.set(key, { n: 0, gotLocality: 0, resolved: 0, unmatched: 0,
                        cityOnly: 0, nothing: 0, errored: 0, block: 0, road: 0, house: 0,
                        boundaryN: 0, boundaryResolved: 0, lats: [], lngs: [] });
    }
    const t = byTown.get(key);
    t.n++;
    t.lats.push(r.lat); t.lngs.push(r.lng);
    if (r.position === "boundary") t.boundaryN++;

    const n = r.nominatim;
    // A transport/server failure is NOT the geocoder saying "nothing here".
    // Scoring the two together would let an outage or a rate limit look like
    // poor coverage and push a good area below the promotion threshold.
    if (r.nominatimError) { t.errored++; }
    else if (!n || (!n.areaRaw && !n.cityRaw)) { t.nothing++; }
    else if (!n.areaRaw) { t.cityOnly++; }
    else {
      t.gotLocality++;
      if (r.nominatimResolved) {
        t.resolved++;
        if (r.position === "boundary") t.boundaryResolved++;
      } else t.unmatched++;
    }
    if (n?.blockHint) t.block++;
    if (n?.road) t.road++;
    if (n?.houseNumber) t.house++;
  }

  // ---- unmatched log (alias seed) ---------------------------------------
  const unmatched = new Map();
  for (const r of townRows) {
    const raw = r.nominatim?.areaRaw;
    if (raw && !r.nominatimResolved) {
      const k = `${r.city}\t${raw}`;
      unmatched.set(k, (unmatched.get(k) ?? 0) + 1);
    }
  }
  const unmatchedLines = [...unmatched.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => `${c}\t${k}`);
  fs.writeFileSync(
    path.join(OUT, "unmatched.log"),
    "# count\tcity\treturned-locality\n" +
      "# Each line is an alias candidate. Under Nominatim this list grows\n" +
      "# continuously — treat it as an ongoing feed with a named owner, not a\n" +
      "# one-time import.\n" +
      unmatchedLines.join("\n") + "\n",
  );

  // ---- centroids ---------------------------------------------------------
  const centroids = {};
  for (const [key, t] of byTown) {
    const mLat = t.lats.reduce((a, b) => a + b, 0) / t.lats.length;
    const mLng = t.lngs.reduce((a, b) => a + b, 0) / t.lngs.length;
    // Rough metres; fine for a spread figure, not for geodesy.
    const radius = Math.max(
      ...t.lats.map((lat, i) =>
        Math.hypot((lat - mLat) * 111000,
                   (t.lngs[i] - mLng) * 111000 * Math.cos((mLat * Math.PI) / 180))),
    );
    centroids[key] = {
      centroid: [Number(mLng.toFixed(6)), Number(mLat.toFixed(6))],
      maxSampleRadiusMeters: Math.round(radius),
      samples: t.n,
    };
  }
  fs.writeFileSync(
    path.join(OUT, "centroids.json"),
    JSON.stringify(
      {
        _CAVEAT: [
          "These centroids are only as good as the hand-drawn extents they came",
          "from. For full-grid strata they are a usable viewport anchor. For",
          "small-grid and city-only strata they are not a centroid in any",
          "meaningful sense — say so wherever they are used.",
          "",
          "maxSampleRadiusMeters IS NOT A CONTAINMENT THRESHOLD. It is the spread",
          "of where someone chose to draw a box, not the extent of the town.",
          "Using it for the P2.4 containment check would fire on correct pins and",
          "stay silent on wrong ones. Derive that threshold from the P0.1b",
          "boundary sample instead.",
        ],
        centroids,
      },
      null,
      2,
    ),
  );

  // ---- city-level --------------------------------------------------------
  const byCity = new Map();
  for (const r of cityRows) {
    if (!byCity.has(r.city)) byCity.set(r.city, { n: 0, correct: 0, any: 0 });
    const c = byCity.get(r.city);
    c.n++;
    const raw = r.nominatim?.cityRaw;
    if (raw) {
      c.any++;
      if (raw.trim().toLowerCase() === r.city.toLowerCase()) c.correct++;
    }
  }

  // ---- Google comparison (only where both were queried) ------------------
  const bothQueried = townRows.filter((r) => r.google !== null);
  const nomHit = bothQueried.filter((r) => r.nominatimResolved).length;
  const gooHit = bothQueried.filter((r) => r.googleResolved).length;

  // ---- write report ------------------------------------------------------
  const L = [];
  const providers = [...new Set(rows.map((r) => r.provider ?? "unknown"))];
  const stamps = rows.map((r) => r.at).filter(Boolean).sort();
  const errored = rows.filter((r) => r.nominatimError).length;

  L.push("# P0.1a Coverage Sweep\n");
  L.push(`Provider: **${providers.join(", ")}**`);
  if (stamps.length) L.push(`Run: ${stamps[0].slice(0, 16)}Z to ${stamps[stamps.length - 1].slice(0, 16)}Z`);
  L.push(`Points: ${rows.length} (town-level ${townRows.length}, city-level ${cityRows.length})`);
  L.push(`Transport/server errors: ${errored} — excluded from scoring, not counted as misses\n`);
  if (providers.some((p) => p === "locationiq" || p === "google")) {
    L.push("> **Not reproducible.** This ran against a hosted provider whose data");
    L.push("> moves independently of us, so a later re-run is a different");
    L.push("> measurement. The run window above is the only version marker there is.\n");
  }

  L.push("\n## Per-town canonical resolution\n");
  L.push("| Area | n | errors | resolves to canonical | unmatched | city only | nothing | block | road | house# | boundary ok | meets 1a floor |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  const sorted = [...byTown.entries()].sort((a, b) => ratio(b[1].resolved, b[1].n) - ratio(a[1].resolved, a[1].n));
  for (const [key, t] of sorted) {
    // Scored against answers actually received. An area whose points mostly
    // errored has not been measured, however its percentage reads.
    const answered = t.n - t.errored;
    const meets =
      answered >= PROMOTION_MIN_SAMPLES &&
      ratio(t.resolved, answered) >= PROMOTION.canonicalResolution;
    const why =
      answered < PROMOTION_MIN_SAMPLES
        ? `no (answered ${answered}<${PROMOTION_MIN_SAMPLES})`
        : meets ? "yes" : "no";
    L.push(
      `| ${key} | ${t.n} | ${t.errored} | ${pct(t.resolved, answered)} | ${pct(t.unmatched, answered)} | ` +
      `${pct(t.cityOnly, answered)} | ${pct(t.nothing, answered)} | ${pct(t.block, answered)} | ` +
      `${pct(t.road, answered)} | ${pct(t.house, answered)} | ${pct(t.boundaryResolved, t.boundaryN)} | ${why} |`,
    );
  }

  L.push("\n> `meets 1a floor` is ONLY the first of three promotion conditions.");
  L.push("> P0.1b must also clear 70% labelled-correct and 50% boundary-correct");
  L.push("> before `geocodeReliable` may be set true for an area.\n");
  L.push("> The boundary share of a gridded box is high by geometry — the outer");
  L.push("> ring of a grid is most of it. That makes this test conservative, and");
  L.push("> it must NOT be read as representative of where users live.\n");

  L.push("\n## City resolution (cities with no town data)\n");
  L.push("This is the number that decides whether the tier-C flow is viable at all.\n");
  L.push("| City | n | returned a city | correct city |");
  L.push("|---|---|---|---|");
  for (const [city, c] of byCity) {
    L.push(`| ${city} | ${c.n} | ${pct(c.any, c.n)} | ${pct(c.correct, c.n)} |`);
  }
  const cityTot = [...byCity.values()].reduce((a, c) => a + c.n, 0);
  const cityOk = [...byCity.values()].reduce((a, c) => a + c.correct, 0);
  L.push(`\n**Overall city resolution: ${pct(cityOk, cityTot)}** (${cityOk}/${cityTot})\n`);

  if (bothQueried.length) {
    L.push(`\n## ${providers.join("/")} vs Google (same points)\n`);
    L.push(`Compared on ${bothQueried.length} point(s).\n`);
    L.push("| Provider | resolves to canonical |");
    L.push("|---|---|");
    L.push(`| ${providers.join("/")} | ${pct(nomHit, bothQueried.length)} |`);
    L.push(`| Google | ${pct(gooHit, bothQueried.length)} |`);
    L.push("\nIf Google substantially outperforms, decide whether a narrow paid");
    L.push("fallback (tier-A areas, cache-miss only) is worth reintroducing.\n");
  } else {
    L.push("\n## Provider comparison\n\nNot run — pass `--baseline` to the sweep.\n");
  }

  const overallResolved = townRows.filter((r) => r.nominatimResolved).length;
  L.push("\n## Branch decision\n");
  L.push(`Overall town-level canonical resolution: **${pct(overallResolved, townRows.length)}**\n`);
  L.push("- **>=70%** → auto-fill-primary flow.");
  L.push("- **40–70%** → auto-fill with always-visible override controls.");
  L.push("- **<40%** → manual three-field entry is PRIMARY; geocoding becomes");
  L.push("  background label enrichment, not an onboarding mechanism.\n");
  L.push("Applied per area via `geocodeReliable`, not as one global switch.\n");

  fs.writeFileSync(path.join(OUT, "report.md"), L.join("\n"));

  console.log(`report      -> ${path.join(OUT, "report.md")}`);
  console.log(`unmatched   -> ${path.join(OUT, "unmatched.log")} (${unmatchedLines.length} candidates)`);
  console.log(`centroids   -> ${path.join(OUT, "centroids.json")} (${Object.keys(centroids).length} areas)`);
  console.log(`\noverall town-level resolution: ${pct(overallResolved, townRows.length)}`);
  console.log(`overall city resolution:       ${pct(cityOk, cityTot)}`);
}

main();
