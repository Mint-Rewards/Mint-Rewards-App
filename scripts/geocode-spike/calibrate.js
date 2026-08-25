/**
 * Scores both providers against genuinely known points — the only real ground
 * truth in this exercise.
 *
 * WHY THIS IS SEPARATE FROM label-report.js. The report's calibration section
 * can only score a truth point if that exact coordinate appears in the sweep,
 * matched on the string `${lat},${lng}`. Sweep points are randomly sampled, so
 * a rooftop you supply will essentially never be among them: you would hand
 * over 25 real addresses and be told none of them were in the sweep. This
 * queries the truth points directly instead, so the file works on its own.
 *
 *   set -a; source .env.geocode; set +a
 *   node scripts/geocode-spike/calibrate.js
 *
 * Reads truth.json (gitignored — these are home addresses). Costs one Google
 * and one LocationIQ call per point.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const TRUTH = path.resolve(__dirname, arg("truth", "truth.json"));
  if (!fs.existsSync(TRUTH)) {
    throw new Error(
      `No ${TRUTH}. Copy truth.example.json to truth.json and fill it in.\n` +
        "It is gitignored and must stay that way — these are home addresses.",
    );
  }
  const raw = JSON.parse(fs.readFileSync(TRUTH, "utf8"));
  // The example file carries a _comment object; skip anything without a lat.
  const points = raw.filter((p) => typeof p?.lat === "number");
  if (!points.length) throw new Error("truth.json has no points with a numeric lat.");

  const { resolveGeocodedName } = loadRegistry();
  const providers = [
    resolveProvider("google", { base: arg("google-base") }),
    resolveProvider(arg("provider", "locationiq"), { base: arg("base") }),
  ];

  // Validate before spending a single call: an area that does not resolve is a
  // typo in the truth file, and scoring against it would quietly count every
  // provider as wrong.
  const bad = points.filter((p) => !resolveGeocodedName(p.area, p.city));
  if (bad.length) {
    console.error("These `area` values do not resolve against the registry:\n");
    for (const p of bad) console.error(`  ${p.city} / ${p.area}   (${p.lat},${p.lng})`);
    console.error("\nFix the spelling, or the area genuinely is not in the registry yet.");
    process.exitCode = 1;
    return;
  }

  const score = new Map(providers.map((p) => [p.name, { ok: 0, wrong: 0, silent: 0 }]));
  const misses = [];

  for (const p of points) {
    const expect = resolveGeocodedName(p.area, p.city);
    const got = {};
    for (const prov of providers) {
      const res = await fetchWithPolicy(
        prov.buildUrl({ base: prov.base ?? prov.defaultBase, lat: p.lat, lng: p.lng, key: prov.key }),
      );
      if (res.fatal) {
        console.error(`\nSTOPPED (${prov.name}): ${res.reason}`);
        process.exitCode = 1;
        return;
      }
      const parsed = res.ok ? prov.parse(res.body) : null;
      const r = parsed?.areaRaw ? resolveGeocodedName(parsed.areaRaw, p.city) : null;
      got[prov.name] = { raw: parsed?.areaRaw ?? null, resolved: r };
      const s = score.get(prov.name);
      if (r === expect) s.ok++;
      else if (r) s.wrong++;
      else s.silent++;
      await sleep(prov.defaultDelayMs);
    }
    if (providers.some((prov) => got[prov.name].resolved !== expect)) {
      misses.push({ expect, city: p.city, ...got });
    }
  }

  const L = [];
  L.push("# Calibration against known points\n");
  L.push(`Points: ${points.length}. This is the only measurement here that is`);
  L.push("accuracy rather than agreement — every other number in the spike says");
  L.push("how often two providers said the same thing, which they can do while");
  L.push("both being wrong.\n");
  L.push("| provider | correct | wrong area | returned nothing | accuracy |");
  L.push("| --- | ---: | ---: | ---: | ---: |");
  for (const [name, s] of score) {
    L.push(`| ${name} | ${s.ok} | ${s.wrong} | ${s.silent} | ${Math.round((s.ok / points.length) * 100)}% |`);
  }
  if (misses.length) {
    L.push("\n## Where they disagreed with truth\n");
    L.push(`| truth | ${providers.map((p) => p.name).join(" | ")} |`);
    L.push(`| --- | ${providers.map(() => "---").join(" | ")} |`);
    for (const m of misses) {
      L.push(`| ${m.expect} | ${providers.map((p) => m[p.name].resolved ?? `— *(${m[p.name].raw ?? "no label"})*`).join(" | ")} |`);
    }
  }
  const out = path.join(__dirname, "out", "calibration.md");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, L.join("\n") + "\n");
  console.log(L.join("\n"));
  console.log(`\nreport -> ${out}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
