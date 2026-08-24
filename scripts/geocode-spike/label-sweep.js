/**
 * Label-first sweep: get LABELLED ground truth without drawing extents.
 *
 *   GOOGLE_GEOCODING_API_KEY=... LOCATIONIQ_API_KEY=... \
 *     node scripts/geocode-spike/label-sweep.js \
 *       --bbox=24.77,66.95,25.05,67.35 --city=Karachi --count=2000
 *
 * WHY THIS EXISTS. The extents pipeline generates UNLABELLED points, so it can
 * only answer P0.1a ("did anything resolvable come back"). This one scatters
 * random points over one bounding box, has Google name each, and keeps the ones
 * Google can place. That yields labelled points — which answers P0.1b too
 * ("did it resolve to the CORRECT area"), the number promotion actually needs,
 * for roughly zero human effort.
 *
 * WHAT IT MEASURES, STATED HONESTLY. Agreement with Google, not truth. Where
 * both providers are wrong the same way, this cannot see it. Calibrate against
 * a small set of genuinely known points (truth.json — see label-report.js)
 * before trusting the bulk numbers.
 *
 * Google is doing the labelling here. That is a MEASUREMENT role only; none of
 * the terms problems that rule it out as the production provider apply, since
 * nothing from it is cached, shipped, or built into a lookup.
 *
 * Points landing in the sea, on industrial land or in empty desert cost one
 * call and are dropped: if Google cannot name it, it was not a useful sample.
 */
const fs = require("fs");
const path = require("path");
const { loadRegistry } = require("./loadRegistry");
const { resolveProvider } = require("./providers");
const { fetchWithPolicy } = require("./fetchWithPolicy");

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : d;
};
const OUT_DIR = path.join(__dirname, "out");
const RESULTS = path.join(OUT_DIR, "labelled.jsonl");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const bboxRaw = arg("bbox");
  if (!bboxRaw) {
    throw new Error(
      "--bbox=minLat,minLng,maxLat,maxLng is required.\n" +
        "One box around the city is all this needs — draw it in draw-extents.js " +
        "if you want it off imagery.",
    );
  }
  const [minLat, minLng, maxLat, maxLng] = bboxRaw.split(",").map(Number);
  if ([minLat, minLng, maxLat, maxLng].some((n) => !Number.isFinite(n))) {
    throw new Error("--bbox must be four numbers: minLat,minLng,maxLat,maxLng");
  }
  if (minLat >= maxLat || minLng >= maxLng) throw new Error("--bbox is inverted");

  const city = arg("city");
  if (!city) throw new Error("--city=Karachi is required (scopes name resolution)");

  const count = Number(arg("count", "2000"));
  // Google is metered. A typo in --count should not become a surprise bill.
  const cap = Number(arg("cap", String(count)));
  if (count > cap) throw new Error(`--count ${count} exceeds --cap ${cap}`);

  const labeller = resolveProvider("google", { base: arg("labeller-base") });
  const candidate = resolveProvider(arg("provider", "locationiq"), { base: arg("base") });
  const delay = Number(arg("delay", String(candidate.defaultDelayMs)));

  const { resolveGeocodedName, getTownsForCity } = loadRegistry();
  if (!getTownsForCity(city).length) {
    throw new Error(`"${city}" has no areas in the registry — nothing to resolve against.`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const done = new Set();
  if (fs.existsSync(RESULTS)) {
    for (const line of fs.readFileSync(RESULTS, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { done.add(JSON.parse(line).id); } catch {}
    }
  }

  // Deterministic: a re-run samples the same points, so two runs are comparable.
  const rand = mulberry32(Number(arg("seed", "1")));
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      lat: +(minLat + rand() * (maxLat - minLat)).toFixed(6),
      lng: +(minLng + rand() * (maxLng - minLng)).toFixed(6),
    });
  }

  const todo = points.filter((p) => !done.has(`${p.lat},${p.lng}`));
  console.log(`city       : ${city}`);
  console.log(`labeller   : google   candidate: ${candidate.name}`);
  console.log(`points     : ${count} sampled, ${done.size} done, ${todo.length} to do`);
  console.log(`google cost: up to ${todo.length} calls (~$${((todo.length / 1000) * 5).toFixed(2)} at list)`);
  if (!todo.length) return console.log("nothing to do.");

  const sink = fs.createWriteStream(RESULTS, { flags: "a" });
  let labelled = 0, agreed = 0, unplaced = 0;

  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    const id = `${p.lat},${p.lng}`;

    const g = await fetchWithPolicy(
      labeller.buildUrl({ base: labeller.base ?? labeller.defaultBase, ...p, key: labeller.key }),
    );
    if (g.fatal) { sink.end(); console.log(`\n\nSTOPPED (labeller): ${g.reason}`); process.exitCode = 1; return; }
    const gp = g.ok ? labeller.parse(g.body) : null;
    const gLabel = gp?.areaRaw ?? null;
    const gResolved = gLabel ? resolveGeocodedName(gLabel, city) : null;

    // No label means the point is not in a named place — sea, scrub, industry.
    // Drop it without spending a candidate call.
    if (!gResolved) {
      unplaced++;
      sink.write(JSON.stringify({ id, ...p, city, googleRaw: gLabel, googleResolved: null,
        candidateRaw: null, candidateResolved: null, usable: false,
        googleError: g.error ?? null, at: new Date().toISOString() }) + "\n");
      if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${todo.length}  labelled ${labelled}  agree ${agreed}  unplaced ${unplaced}   \r`);
      await sleep(delay);
      continue;
    }

    labelled++;
    const c = await fetchWithPolicy(
      candidate.buildUrl({ base: candidate.base ?? candidate.defaultBase, ...p, key: candidate.key }),
    );
    if (c.fatal) { sink.end(); console.log(`\n\nSTOPPED (candidate): ${c.reason}`); process.exitCode = 1; return; }
    const cp = c.ok ? candidate.parse(c.body) : null;
    const cResolved = cp?.areaRaw ? resolveGeocodedName(cp.areaRaw, city) : null;
    if (cResolved && cResolved === gResolved) agreed++;

    sink.write(JSON.stringify({
      id, ...p, city,
      googleRaw: gLabel, googleResolved: gResolved,
      candidateRaw: cp?.areaRaw ?? null, candidateResolved: cResolved,
      candidateError: c.error ?? null,
      usable: true, agree: cResolved === gResolved,
      at: new Date().toISOString(),
    }) + "\n");

    if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${todo.length}  labelled ${labelled}  agree ${agreed}  unplaced ${unplaced}   \r`);
    await sleep(delay);
  }

  sink.end();
  console.log(`\n\nlabelled sweep complete -> ${RESULTS}`);
  console.log(`usable ${labelled}/${todo.length}, agreement ${labelled ? Math.round((agreed / labelled) * 100) : 0}%`);
  console.log("Next: node scripts/geocode-spike/label-report.js");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
