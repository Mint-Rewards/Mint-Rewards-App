/**
 * Re-derives candidate answers from cached raw address objects.
 *
 * The sweep stores only the ONE field the parser chose at the time. Every
 * later change to field order, aliases or folding therefore invalidates the
 * stored answer — and re-running the sweep to find out costs real money and
 * real time, which is a strong incentive to just not check.
 *
 * Caching the whole address object removes that incentive: parser and registry
 * changes can be re-scored offline, for free, as many times as needed. Only
 * the labeller's ground truth is fixed, which is exactly the part that should
 * be fixed.
 *
 *   node scripts/geocode-spike/rescore.js \
 *     --in=karachi-core.jsonl --addresses=karachi-core-liq-address.jsonl \
 *     --out=karachi-core-rescored.jsonl --city=Karachi
 */
const fs = require("fs");
const path = require("path");
const { loadRegistry } = require("./loadRegistry");
const { PROVIDERS } = require("./providers");

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : d;
};
const OUT = path.join(__dirname, "out");

function main() {
  const city = arg("city", "Karachi");
  const sweep = path.resolve(OUT, arg("in", "labelled.jsonl"));
  const addrPath = path.resolve(OUT, arg("addresses"));
  const outPath = path.resolve(OUT, arg("out", "rescored.jsonl"));
  const parse = (PROVIDERS[arg("provider", "locationiq")] ?? {}).parse;
  if (!parse) throw new Error("unknown --provider");

  const { resolveGeocodedName } = loadRegistry();
  const addr = new Map();
  for (const l of fs.readFileSync(addrPath, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const r = JSON.parse(l);
    addr.set(r.id, r.address);
  }

  const out = [];
  let rescored = 0, missing = 0;
  for (const l of fs.readFileSync(sweep, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const r = JSON.parse(l);
    // Google's label is re-resolved too: alias and affix changes move it.
    if (r.googleRaw) {
      const g = resolveGeocodedName(r.googleRaw, city);
      r.googleResolved = g;
      r.usable = Boolean(g);
      r.drop = g ? undefined : r.googleRaw ? "unregistered" : "unnamed";
    }
    const a = addr.get(r.id);
    if (r.usable && a) {
      const p = parse({ address: a });
      r.candidateRaw = p.areaRaw;
      r.candidateResolved = p.areaRaw ? resolveGeocodedName(p.areaRaw, city) : null;
      r.agree = r.candidateResolved === r.googleResolved;
      rescored++;
    } else if (r.usable) {
      // No cached address: drop rather than carry a stale answer forward.
      missing++;
      continue;
    }
    out.push(r);
  }
  fs.writeFileSync(outPath, out.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`rescored ${rescored} usable points -> ${outPath}`);
  if (missing) console.log(`dropped ${missing} usable points with no cached address`);
}

main();
