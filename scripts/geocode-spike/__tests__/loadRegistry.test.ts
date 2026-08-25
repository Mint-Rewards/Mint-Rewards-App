/**
 * Regression test for loadRegistry.js.
 *
 * 8818754 split PAKISTAN_LOCATIONS out of pakistan_areas.ts into its own
 * module, imported via the "@/*" path alias. loadRegistry.js compiled
 * pakistan_areas.ts standalone with `tsc --ignoreConfig`, which drops that
 * alias along with the rest of tsconfig.json — every script depending on it
 * (rescore.js, label-report.js, provenance-sweep.js) broke, and nothing in
 * `npm test` caught it, because loadRegistry.js lived outside any
 * __tests__ directory.
 *
 * Runs loadRegistry() in a plain `node` child process rather than requiring
 * it in-process: Jest's own require() runs every file it loads through
 * babel-jest, and the temp directory tsc compiles into sits outside the
 * project's node_modules resolution, so @babel/runtime helpers cannot be
 * found there — a Jest-transform artifact, not a bug in loadRegistry.js
 * itself (verified working under plain `node -e` during development). Every
 * real caller (rescore.js, label-report.js, provenance-sweep.js) is a plain
 * node script anyway, so a child process is the faithful way to test this.
 */
import { describe, expect, it, jest } from "@jest/globals";
const { execFileSync } = require("child_process");
const path = require("path");

function runInChildNode(script: string): string {
  return execFileSync("node", ["-e", script], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
}

describe("loadRegistry", () => {
  // Spawns a real `npx tsc` compile — slower than a typical unit test, but
  // the compile step itself is exactly what regressed, so mocking it out
  // would defeat the point.
  jest.setTimeout(30000);

  it("compiles pakistan_areas.ts and resolves its cross-module import", () => {
    const out = runInChildNode(`
      const { loadRegistry } = require("./loadRegistry");
      const r = loadRegistry();
      console.log(JSON.stringify({
        hasCities: Boolean(r.PAKISTAN_LOCATIONS.cities),
        karachiTowns: r.PAKISTAN_LOCATIONS.towns.Karachi.length,
      }));
    `);
    const result = JSON.parse(out);
    expect(result.hasCities).toBe(true);
    expect(result.karachiTowns).toBeGreaterThan(0);
  });

  it("resolves a plain town name and this session's alias, and exposes isResidentialArea", () => {
    const out = runInChildNode(`
      const { loadRegistry } = require("./loadRegistry");
      const { resolveGeocodedName, isResidentialArea } = loadRegistry();
      console.log(JSON.stringify({
        plain: resolveGeocodedName("Gulshan-e-Iqbal", "Karachi"),
        // The specific alias this session added — confirms the compiled
        // module is the CURRENT registry, not a stale or partial one.
        alias: resolveGeocodedName("Darussalam Society", "Karachi"),
        industrial: isResidentialArea("Karachi", "Korangi Industrial Area"),
        residential: isResidentialArea("Karachi", "Korangi"),
      }));
    `);
    const result = JSON.parse(out);
    expect(result.plain).toBe("Gulshan-e-Iqbal");
    expect(result.alias).toBe("Korangi");
    expect(result.industrial).toBe(false);
    expect(result.residential).toBe(true);
  });
});
