/**
 * Scores the label-first sweep.
 *
 *   node scripts/geocode-spike/label-report.js
 *
 * Two sections, and the second is what makes the first trustworthy:
 *
 * 1. AGREEMENT — how often the candidate provider resolves to the same area
 *    Google did, per area. This is bulk data and cheap, but it is agreement,
 *    NOT accuracy: where both are wrong the same way it sees nothing.
 *
 * 2. CALIBRATION — accuracy of BOTH providers against truth.json, a small set
 *    of genuinely known points (team members' own rooftops, unambiguous
 *    landmarks). This is the only real ground truth here. If Google is only
 *    60% right against it, then section 1 is measuring agreement with a coin
 *    flip and must not be read as a coverage figure.
 */
const fs = require("fs");
const path = require("path");
const { loadRegistry } = require("./loadRegistry");
const { PROMOTION, PROMOTION_MIN_SAMPLES } = require("./strata");

const OUT = path.join(__dirname, "out");
const RESULTS = path.join(OUT, "labelled.jsonl");
const TRUTH = path.join(__dirname, "truth.json");
const pct = (n, d) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);

function main() {
  if (!fs.existsSync(RESULTS)) throw new Error(`No results at ${RESULTS} — run label-sweep.js first.`);
  const rows = fs.readFileSync(RESULTS, "utf8").split("\n").filter((l) => l.trim()).map(JSON.parse);
  const usable = rows.filter((r) => r.usable);

  const L = [];
  L.push("# Label-first sweep\n");
  const stamps = rows.map((r) => r.at).filter(Boolean).sort();
  if (stamps.length) L.push(`Run: ${stamps[0].slice(0, 16)}Z to ${stamps[stamps.length - 1].slice(0, 16)}Z`);
  L.push(`Sampled: ${rows.length}`);
  L.push(`Placed by Google and resolvable to the registry: ${usable.length} (${pct(usable.length, rows.length)})`);
  L.push(`Dropped (sea / unnamed / unresolvable): ${rows.length - usable.length}\n`);

  L.push("> **Agreement, not accuracy.** These figures say how often the candidate");
  L.push("> matches Google, not how often either is right. See the calibration");
  L.push("> section — without it, a high agreement rate could just mean both");
  L.push("> providers share the same error.\n");

  // ---- per-area agreement ------------------------------------------------
  const byArea = new Map();
  for (const r of usable) {
    const k = r.googleResolved;
    if (!byArea.has(k)) byArea.set(k, { n: 0, agree: 0, missed: 0, wrong: 0 });
    const a = byArea.get(k);
    a.n++;
    if (r.agree) a.agree++;
    else if (!r.candidateResolved) a.missed++;
    else a.wrong++;
  }
  L.push("\n## Agreement by area (Google's label as the reference)\n");
  L.push("| Area | n | agree | candidate returned nothing | candidate said elsewhere | meets 70% |");
  L.push("|---|---|---|---|---|---|");
  const sorted = [...byArea.entries()].sort((a, b) => b[1].agree / b[1].n - a[1].agree / a[1].n);
  for (const [area, a] of sorted) {
    const meets = a.n >= PROMOTION_MIN_SAMPLES && a.agree / a.n >= PROMOTION.canonicalResolution;
    L.push(`| ${area} | ${a.n} | ${pct(a.agree, a.n)} | ${pct(a.missed, a.n)} | ${pct(a.wrong, a.n)} | ` +
      `${a.n < PROMOTION_MIN_SAMPLES ? `no (n<${PROMOTION_MIN_SAMPLES})` : meets ? "yes" : "no"} |`);
  }
  const totAgree = usable.filter((r) => r.agree).length;
  L.push(`\n**Overall agreement: ${pct(totAgree, usable.length)}** (${totAgree}/${usable.length})`);
  L.push(`Areas covered: ${byArea.size}, of which ${[...byArea.values()].filter((a) => a.n >= PROMOTION_MIN_SAMPLES).length} reached n>=${PROMOTION_MIN_SAMPLES}.\n`);

  // ---- Google labels that the registry could not absorb ------------------
  const unres = new Map();
  for (const r of rows) {
    if (r.googleRaw && !r.googleResolved) unres.set(r.googleRaw, (unres.get(r.googleRaw) ?? 0) + 1);
  }
  if (unres.size) {
    L.push("\n## Google labels that did not resolve to the registry\n");
    L.push("Alias candidates, or genuinely absent areas. Same feed as `unmatched.log`.\n");
    L.push("| count | label |");
    L.push("|---|---|");
    for (const [name, c] of [...unres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
      L.push(`| ${c} | ${name} |`);
    }
  }

  // ---- calibration -------------------------------------------------------
  L.push("\n## Calibration against known points\n");
  if (!fs.existsSync(TRUTH)) {
    L.push("**Not run — `truth.json` is absent, so nothing above is validated.**\n");
    L.push("Until this exists, the agreement figures cannot be read as coverage.");
    L.push("Collect 20-30 genuinely known points (team members' own rooftops,");
    L.push("unambiguous landmarks) as:\n");
    L.push('```json\n[{ "lat": 24.8607, "lng": 67.0011, "city": "Karachi", "area": "Saddar" }]\n```');
  } else {
    const { resolveGeocodedName } = loadRegistry();
    const truth = JSON.parse(fs.readFileSync(TRUTH, "utf8"));
    const byId = new Map(rows.map((r) => [r.id, r]));
    let gOk = 0, cOk = 0, matched = 0;
    const misses = [];
    for (const t of truth) {
      const expect = resolveGeocodedName(t.area, t.city) ?? t.area;
      const r = byId.get(`${t.lat},${t.lng}`);
      if (!r) continue;
      matched++;
      if (r.googleResolved === expect) gOk++;
      if (r.candidateResolved === expect) cOk++;
      if (r.googleResolved !== expect || r.candidateResolved !== expect) {
        misses.push(`| ${expect} | ${r.googleResolved ?? "—"} | ${r.candidateResolved ?? "—"} |`);
      }
    }
    if (!matched) {
      L.push("**`truth.json` exists but none of its points were in the sweep.**");
      L.push("Run the sweep over those exact coordinates, or the calibration is empty.\n");
    } else {
      L.push(`Known points present in the sweep: ${matched} of ${truth.length}\n`);
      L.push("| provider | correct |");
      L.push("|---|---|");
      L.push(`| Google (the labeller) | ${pct(gOk, matched)} |`);
      L.push(`| Candidate | ${pct(cOk, matched)} |`);
      L.push("");
      if (gOk / matched < 0.7) {
        L.push("> **The labeller is not reliable enough to be a reference here.**");
        L.push("> The agreement section above is comparing against a source that is");
        L.push(`> itself wrong ${pct(matched - gOk, matched)} of the time. Do not read it as coverage.\n`);
      }
      if (misses.length) {
        L.push("### Disagreements on known points\n");
        L.push("| truth | Google | candidate |");
        L.push("|---|---|---|");
        L.push(...misses.slice(0, 30));
      }
    }
  }

  fs.writeFileSync(path.join(OUT, "label-report.md"), L.join("\n"));
  console.log(`report -> ${path.join(OUT, "label-report.md")}`);
  console.log(`usable ${usable.length}/${rows.length}, overall agreement ${pct(totAgree, usable.length)}`);
  if (!fs.existsSync(TRUTH)) console.log("NOTE: truth.json absent — agreement is unvalidated.");
}

main();
