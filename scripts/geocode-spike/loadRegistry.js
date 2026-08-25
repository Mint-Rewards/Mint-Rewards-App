/**
 * Loads utils/pakistan_areas.ts into a plain CommonJS module.
 *
 * The spike MUST use the app's own resolver rather than reimplementing name
 * matching. If the spike folded names even slightly differently from
 * `resolveGeocodedName`, its hit rate would describe a resolver that never
 * ships, and `geocodeReliable` would be promoted on a number that does not
 * correspond to production behaviour.
 *
 * Compiled to a scratch dir on demand; nothing is written into the repo.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SOURCE = path.join(REPO_ROOT, "utils", "pakistan_areas.ts");

function loadRegistry() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "geocode-spike-"));
  // pakistan_areas.ts imports pakistan_locations.ts via the "@/*" path alias
  // (utils/pakistan_locations.ts, split out in 8818754). `--ignoreConfig`
  // drops that alias along with the rest of tsconfig.json, and tsc's own
  // `paths`/`baseUrl` are type-checking hints only — they don't rewrite the
  // emitted `require()` call, so plain node can't resolve "@/..." at runtime
  // either way. Simplest fix: compile a copy with the alias swapped for a
  // real relative import, so nothing needs alias resolution at all.
  // Copied flat, both files, so tsc's rootDir inference stays `outDir`
  // rather than climbing to the filesystem root to find a common ancestor
  // with REPO_ROOT (which is what happens if the import stays a relative
  // "../../.." path reaching back out of outDir).
  fs.copyFileSync(
    path.join(REPO_ROOT, "utils", "pakistan_locations.ts"),
    path.join(outDir, "pakistan_locations.ts"),
  );
  const patchedSource = path.join(outDir, "pakistan_areas.ts");
  fs.writeFileSync(
    patchedSource,
    fs
      .readFileSync(SOURCE, "utf8")
      .replace('"@/utils/pakistan_locations"', '"./pakistan_locations"'),
  );
  execFileSync(
    "npx",
    [
      "tsc", patchedSource,
      "--ignoreConfig",
      "--outDir", outDir,
      "--module", "commonjs",
      "--target", "es2019",
      "--skipLibCheck",
    ],
    { cwd: REPO_ROOT, stdio: "pipe" },
  );
  return require(path.join(outDir, "pakistan_areas.js"));
}

module.exports = { loadRegistry };
