/**
 * Stage 2 of P0.1a: query the geocoder for every sample point.
 *
 *   LOCATIONIQ_API_KEY=pk.xxx node scripts/geocode-spike/sweep.js
 *   LOCATIONIQ_API_KEY=pk.xxx GOOGLE_GEOCODING_API_KEY=... \
 *     node scripts/geocode-spike/sweep.js --baseline
 *   node scripts/geocode-spike/sweep.js --provider=nominatim --base=http://localhost:8080
 *
 * Answers ONE question per point: does the geocoder return a locality that
 * resolves to a canonical registry key? That is "did we get a usable answer",
 * not "was the answer correct" — correctness is P0.1b and needs labels. This
 * stage needs none, which is why it runs first and may settle the branch on its
 * own: if canonical resolution is low everywhere, correctness is academic
 * because the auto-fill path does not exist regardless.
 *
 * Results append to results.jsonl as they arrive, so an interrupted run — or
 * one that hits a daily quota wall — resumes instead of restarting.
 */
const fs = require("fs");
const path = require("path");
const { loadRegistry } = require("./loadRegistry");
const { resolveProvider } = require("./providers");
const { fetchWithPolicy } = require("./fetchWithPolicy");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const OUT_DIR = path.join(__dirname, "out");
const RESULTS = path.join(OUT_DIR, "results.jsonl");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const primary = resolveProvider(arg("provider", "locationiq"), {
    base: arg("base"),
  });

  // Google is a CAPPED comparison baseline, never the whole run. It exists to
  // size what self-hosting/LocationIQ gives up, so the provider choice is made
  // on a number rather than an assumption. See README for why its terms make it
  // awkward as the production provider.
  const wantBaseline = flag("baseline");
  const baselineCap = Number(arg("baseline-cap", "200"));
  const baseline = wantBaseline ? resolveProvider("google") : null;

  const pointsPath = arg("points", path.join(OUT_DIR, "points.json"));
  if (!fs.existsSync(pointsPath)) {
    throw new Error(`No points at ${pointsPath} — run generate-points.js first.`);
  }
  const points = JSON.parse(fs.readFileSync(pointsPath, "utf8"));
  const delay = Number(arg("delay", String(primary.defaultDelayMs)));

  const { resolveGeocodedName } = loadRegistry();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const done = new Set();
  if (fs.existsSync(RESULTS)) {
    for (const line of fs.readFileSync(RESULTS, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { done.add(JSON.parse(line).id); } catch { /* partial trailing line */ }
    }
  }

  const todo = points.filter(
    (p) => !done.has(`${p.city}|${p.town ?? ""}|${p.lat},${p.lng}`),
  );
  console.log(`provider   : ${primary.name}${baseline ? ` (+ ${baseline.name} baseline, cap ${baselineCap})` : ""}`);
  console.log(`points     : ${points.length} total, ${done.size} already done, ${todo.length} to do`);
  console.log(`pacing     : ${delay}ms between requests (~${Math.ceil((todo.length * delay) / 60000)} min)`);
  if (!todo.length) { console.log("nothing to do."); return; }

  const sink = fs.createWriteStream(RESULTS, { flags: "a" });
  let baselineUsed = 0;
  let ok = 0, resolved = 0, errors = 0;

  // Circuit breaker. Each failed point burns its full retry ladder (~15s), so
  // a provider that is simply down would otherwise turn a 3.5k-point run into
  // a 15-hour crawl that records nothing but errors. Consecutive failures on
  // this scale mean the endpoint is unreachable, not that coverage is bad.
  let consecutiveErrors = 0;
  const ERROR_STREAK_LIMIT = Number(arg("error-streak", "15"));

  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    const id = `${p.city}|${p.town ?? ""}|${p.lat},${p.lng}`;

    const res = await fetchWithPolicy(
      primary.buildUrl({
        base: primary.base ?? primary.defaultBase,
        lat: p.lat, lng: p.lng, key: primary.key,
      }),
    );

    // A quota wall or a bad key stops the run. Writing rate-limit responses as
    // data would depress the hit rate for infrastructure reasons and could kill
    // the auto-fill branch on an artifact.
    if (res.fatal) {
      sink.end();
      console.log(`\n\nSTOPPED: ${res.reason}`);
      console.log(`${done.size + i} point(s) recorded. Re-run to resume from here.`);
      process.exitCode = 1;
      return;
    }

    const parsed = res.ok ? primary.parse(res.body) : null;
    if (res.ok) { ok++; consecutiveErrors = 0; }
    else { errors++; consecutiveErrors++; }

    if (consecutiveErrors >= ERROR_STREAK_LIMIT) {
      sink.end();
      console.log(`\n\nSTOPPED: ${consecutiveErrors} consecutive failures — provider looks unreachable.`);
      console.log(`Last error: ${res.error}`);
      console.log(`Fix connectivity and re-run to resume; recorded points are kept.`);
      process.exitCode = 1;
      return;
    }

    // Town-level points resolve against their own city. City-level points have
    // no town to resolve, so only city correctness is scored for them.
    const primaryResolved =
      parsed?.areaRaw && p.level === "town"
        ? resolveGeocodedName(parsed.areaRaw, p.city)
        : null;
    if (primaryResolved) resolved++;

    let base = null, baseResolved = null, baseError = null;
    if (baseline && baselineUsed < baselineCap) {
      baselineUsed++;
      const b = await fetchWithPolicy(
        baseline.buildUrl({ lat: p.lat, lng: p.lng, key: baseline.key }),
      );
      if (b.fatal) {
        // The baseline failing must not abort the primary run — it is a
        // nice-to-have comparison, not the measurement.
        console.log(`\n[baseline disabled: ${b.reason}]`);
        baselineUsed = baselineCap;
        baseError = b.reason;
      } else if (b.ok) {
        base = baseline.parse(b.body);
        baseResolved =
          base.areaRaw && p.level === "town"
            ? resolveGeocodedName(base.areaRaw, p.city)
            : null;
      } else {
        baseError = b.error;
      }
    }

    sink.write(JSON.stringify({
      id, city: p.city, town: p.town, level: p.level,
      stratum: p.stratum, position: p.position, lat: p.lat, lng: p.lng,
      provider: primary.name,
      nominatim: parsed,               // key kept for report.js compatibility
      nominatimError: res.error ?? null,
      nominatimResolved: primaryResolved,
      google: base,
      googleError: baseError,
      googleResolved: baseResolved,
      at: new Date().toISOString(),
    }) + "\n");

    if ((i + 1) % 25 === 0 || i === todo.length - 1) {
      process.stdout.write(
        `  ${i + 1}/${todo.length}  resolved ${resolved}/${ok}  errors ${errors}   \r`,
      );
    }
    await sleep(delay);
  }

  sink.end();
  console.log(`\n\nsweep complete -> ${RESULTS}`);
  if (baseline) console.log(`baseline calls used: ${baselineUsed}/${baselineCap}`);
  console.log("Next: node scripts/geocode-spike/report.js");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
