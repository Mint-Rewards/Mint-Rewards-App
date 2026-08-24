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
  execFileSync(
    "npx",
    [
      "tsc", SOURCE,
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
