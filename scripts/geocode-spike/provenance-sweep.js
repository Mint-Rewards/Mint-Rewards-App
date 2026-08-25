/**
 * P0.6 provenance sweep — confirm Google-derived place names against OSM.
 *
 * The 531 unregistered labels in `karachi-gaps.md` all came from Google. The
 * plan is explicit that they are leads, not data to copy: the registry is a
 * permanent artifact and its strings can never be edited, so a name enters it
 * only once a second, unrestricted source agrees the place exists.
 *
 * The existing `karachi-core-liq-address.jsonl` cannot answer this — it covers
 * only the 466 points where Google DID resolve, which is precisely the
 * complement of the set in question. Hence a dedicated sweep.
 *
 * Two outputs from one run:
 *   1. Provenance. An OSM name at the same coordinate discharges the
 *      confirmation requirement without a manual lookup.
 *   2. The silent-vs-unresolvable split the plan lists as an open item. A point
 *      where LocationIQ returns NOTHING is unfixable; one where it returns a
 *      name the registry lacks is fixed by this very task. The two look
 *      identical in the recall figure and have opposite remedies.
 *
 * Stores the FULL address object, not `parseNominatimAddress`'s two-field
 * chain: that chain is tuned for precision in the live path, and here we want
 * every rung OSM offers, including the ones deliberately excluded from it.
 *
 * Resumable — re-running skips ids already written.
 */
const fs = require("node:fs");
const path = require("node:path");
const { resolveProvider } = require("./providers");
const { fetchWithPolicy } = require("./fetchWithPolicy");

const OUT_DIR = path.join(__dirname, "out");
const IN = path.join(OUT_DIR, "karachi-core-rescored.jsonl");
const OUT = path.join(OUT_DIR, "karachi-unregistered-liq.jsonl");

const readJsonl = (f) =>
  fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

async function main() {
  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || Infinity);
  const provider = resolveProvider("locationiq");

  const targets = readJsonl(IN).filter((r) => r.googleRaw && !r.googleResolved);

  const done = new Set(
    fs.existsSync(OUT) ? readJsonl(OUT).map((r) => r.id) : [],
  );
  const todo = targets.filter((r) => !done.has(r.id)).slice(0, limit);

  console.error(
    `${targets.length} unregistered points, ${done.size} already swept, ${todo.length} to do.`,
  );
  if (!todo.length) return;

  const stream = fs.createWriteStream(OUT, { flags: "a" });
  let ok = 0, silent = 0, failed = 0;

  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    const url = provider.buildUrl({
      base: provider.defaultBase,
      lat: p.lat,
      lng: p.lng,
      key: provider.key,
    });
    let rec = { id: p.id, lat: p.lat, lng: p.lng, googleRaw: p.googleRaw };
    const r = await fetchWithPolicy(url);

    // A quota wall or a bad key is not a data point. Stop so the run resumes
    // later rather than filling the file with noise that looks like coverage.
    if (r.fatal) {
      stream.end();
      console.error(`STOPPED: ${r.reason}`);
      console.error(`${ok} answered, ${silent} silent, ${failed} errored before stopping.`);
      console.error("Re-run to resume — already-swept ids are skipped.");
      process.exit(2);
    }

    if (r.ok) {
      const body = r.body;
      rec.address = body?.error ? null : (body?.address ?? null);
      rec.displayName = body?.display_name ?? null;
      rec.silent = !rec.address;
      if (rec.silent) silent++; else ok++;
    } else if (r.error === "http 404") {
      // LocationIQ answers "nothing here" with a 404, not an empty address.
      // This is the silent case the plan wants split out from unresolvable:
      // silence is unfixable, whereas a name the registry lacks is fixed by
      // this very task. Recording it as an error would merge the two again.
      rec.address = null;
      rec.silent = true;
      silent++;
    } else {
      rec.address = null;
      rec.error = r.error;
      failed++;
    }

    stream.write(JSON.stringify(rec) + "\n");
    if ((i + 1) % 50 === 0) console.error(`  ${i + 1}/${todo.length}…`);
    await new Promise((r) => setTimeout(r, provider.defaultDelayMs));
  }
  stream.end();
  console.error(`done — ${ok} answered, ${silent} silent, ${failed} errored.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
