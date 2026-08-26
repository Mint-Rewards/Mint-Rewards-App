/**
 * Per-area prefill precision and recall for Karachi, from cached sweep data.
 *
 *   npx tsx scripts/measure-karachi-prefill.ts
 *
 * Free to run and offline: it replays the 466 cached LocationIQ address objects
 * in `scripts/geocode-spike/out/karachi-core-liq-address.jsonl` through the
 * CURRENT registry. No API calls, no quota, no network. Re-run it after any
 * change to aliases, sub-area lists or the resolver — that is the point of it
 * existing as a script rather than as a table in a report that goes stale.
 *
 * It exists because `P0.6-REPORT.md`'s numbers were measured once, by hand, and
 * the promotion decisions that depend on them (`geocodePrefill`, and the
 * `PREFILL_DENYLIST` floor) have to be re-checkable by anyone who touches the
 * resolver. `__tests__/karachiPrefillPrecision.test.ts` asserts against the same
 * function this prints, so the committed thresholds cannot drift away from the
 * evidence silently.
 *
 * ## Live candidate semantics
 *
 * Only the fields the production path actually reads: the backend's parser sets
 * `areaRaw = suburb ?? neighbourhood` and `blockHint = neighbourhood ??
 * residential` (`scripts/geocode-spike/providers.js`). `town` is deliberately
 * NOT read — it carries the administrative parent, and reading it resolved
 * every DHA pin to Saddar and cost 33 points of precision. Measuring with a
 * wider candidate list than production uses would report a number no user ever
 * experiences.
 *
 * ## What "correct" means
 *
 * The `truth` label is Google's answer for the same coordinate, re-resolved
 * against the current registry. It is not ground truth — the two geocoders
 * genuinely disagree on boundary areas, and `DISAGREEMENTS.md` records which
 * side won where anyone checked. Treat a sub-85% area as a prompt to look, not
 * as a proven error rate.
 */

import fs from "fs";
import path from "path";
import {
  extractSubAreaForTown,
  getPrefillConfidence,
  isCanonicalTown,
  isResidentialArea,
  resolveGeocodedName,
} from "../utils/pakistan_areas";

const CITY = "Karachi";

const SWEEP_PATH = path.join(
  __dirname,
  "geocode-spike",
  "out",
  "karachi-core-liq-address.jsonl",
);

interface SweepRow {
  id: string;
  truth: string | null;
  address: Record<string, string | undefined>;
}

export interface AreaScore {
  town: string;
  /** Points where this area was the prefill answer. */
  n: number;
  correct: number;
  precision: number;
  /** How many of those also recovered a sub-area. */
  withSubArea: number;
  confidence: ReturnType<typeof getPrefillConfidence>;
}

export interface PrefillMeasurement {
  points: number;
  /** Points where a residential area was pre-selected at all. */
  prefilled: number;
  withSubArea: number;
  aggregatePrecision: number;
  areas: AreaScore[];
}

export function loadSweep(): SweepRow[] {
  return fs
    .readFileSync(SWEEP_PATH, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as SweepRow);
}

/** The town + sub-area the live path would pre-select for one sweep row. */
export function prefillFor(row: SweepRow): { town: string; subArea: string } {
  const address = row.address ?? {};
  // Production order. `residential` trails `neighbourhood` because the backend
  // falls back to it only for `blockHint`.
  const candidates = [
    address.suburb,
    address.neighbourhood,
    address.residential,
  ].filter((v): v is string => typeof v === "string" && v.trim() !== "");

  for (const candidate of candidates) {
    const town = resolveGeocodedName(candidate, CITY);
    if (!town || !isCanonicalTown(CITY, town)) continue;
    return {
      town,
      subArea: extractSubAreaForTown(candidate, CITY, town) ?? "",
    };
  }
  return { town: "", subArea: "" };
}

export function measure(rows: SweepRow[] = loadSweep()): PrefillMeasurement {
  const byArea = new Map<string, AreaScore>();
  let prefilled = 0;
  let withSubArea = 0;

  for (const row of rows) {
    const { town, subArea } = prefillFor(row);
    // An industrial area is suppressed structurally, at every tier, so it is
    // not part of the prefill question and must not dilute the figures.
    if (!town || !isResidentialArea(CITY, town)) continue;

    prefilled++;
    if (subArea) withSubArea++;

    const score =
      byArea.get(town) ??
      ({
        town,
        n: 0,
        correct: 0,
        precision: 0,
        withSubArea: 0,
        confidence: getPrefillConfidence(CITY, town),
      } satisfies AreaScore);
    score.n++;
    if (subArea) score.withSubArea++;
    if (row.truth === town) score.correct++;
    byArea.set(town, score);
  }

  const areas = [...byArea.values()]
    .map((a) => ({ ...a, precision: a.n === 0 ? 0 : a.correct / a.n }))
    .sort((a, b) => b.n - a.n);

  const totalN = areas.reduce((sum, a) => sum + a.n, 0);
  const totalCorrect = areas.reduce((sum, a) => sum + a.correct, 0);

  return {
    points: rows.length,
    prefilled,
    withSubArea,
    aggregatePrecision: totalN === 0 ? 0 : totalCorrect / totalN,
    areas,
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function main(): void {
  const result = measure();

  console.log(`points:            ${result.points}`);
  console.log(
    `town pre-filled:   ${result.prefilled} (${pct(result.prefilled / result.points)})`,
  );
  console.log(
    `sub-area filled:   ${result.withSubArea} (${pct(result.withSubArea / result.points)})`,
  );
  console.log(`aggregate precision: ${pct(result.aggregatePrecision)}\n`);

  console.log(
    ["area", "n", "correct", "precision", "sub-area", "tier"].join("\t"),
  );
  for (const area of result.areas) {
    console.log(
      [
        area.town,
        area.n,
        area.correct,
        pct(area.precision),
        area.withSubArea,
        area.confidence,
      ].join("\t"),
    );
  }
}

if (require.main === module) main();
