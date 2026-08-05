#!/usr/bin/env node
/**
 * One-time migration: rename stored User.town values to the canonical town
 * names introduced in utils/pakistan_areas.ts.
 *
 * WHY: the town list used to carry its own short names ("DHA", "F-6", "Cantt")
 * while the sub-area dataset keys off fuller ones ("DHA Lahore", "Sector F-6",
 * "Rawalpindi Cantt"). The two were reconciled by rewriting the town list to
 * match the sub-area dataset, so every already-stored town value written under
 * the old names has to be moved across or those users will no longer match a
 * town in the picker (and would never see the sub-area step).
 *
 * ORDERING: this MUST run before the app update that ships pakistan_areas.ts
 * reaches users. It is safe to run early — the old app writes and reads the old
 * names, but nothing in either version *queries* by town today (town is
 * write-only server-side), so a renamed value breaks nothing while the old
 * build is still live.
 *
 * This lives in the app repo because the rename map originates with the data
 * change here. It talks to the backend's MongoDB directly.
 *
 *   MONGODB_URI="mongodb+srv://..." node scripts/migrate-town-names.js --dry-run
 *   MONGODB_URI="mongodb+srv://..." node scripts/migrate-town-names.js --apply
 *
 * Idempotent: re-running after a successful pass matches nothing.
 */

const { MongoClient } = require("mongodb");

/** "City::old town name" -> canonical town name. */
const RENAMES = {
  "Lahore::DHA": "DHA Lahore",
  "Lahore::Bahria Town": "Bahria Town Lahore",
  "Lahore::Allama Iqbal Town": "Iqbal Town",

  // Karachi's DHA / PECHS / Saddar kept their short names in pakistan_areas.ts,
  // so those need no rename. "Defence" was dropped as a duplicate of DHA.
  "Karachi::Defence": "DHA",
  "Karachi::Orangi": "Orangi Town",
  "Karachi::Federal B Area": "Federal B. Area",
  "Karachi::Bahria Town": "Bahria Town Karachi",

  "Islamabad::F-6": "Sector F-6",
  "Islamabad::F-7": "Sector F-7",
  "Islamabad::F-8": "Sector F-8",
  "Islamabad::F-10": "Sector F-10",
  "Islamabad::F-11": "Sector F-11",
  "Islamabad::G-6": "Sector G-6",
  "Islamabad::G-7": "Sector G-7",
  "Islamabad::G-8": "Sector G-8",
  "Islamabad::G-9": "Sector G-9",
  "Islamabad::G-10": "Sector G-10",
  "Islamabad::G-11": "Sector G-11",
  "Islamabad::G-13": "Sector G-13",
  "Islamabad::I-8": "Sector I-8",
  "Islamabad::I-10": "Sector I-10",
  "Islamabad::DHA": "DHA Islamabad",
  "Islamabad::Bahria Town": "Bahria Town Islamabad",

  "Rawalpindi::Cantt": "Rawalpindi Cantt",
  "Peshawar::Cantt": "Peshawar Cantt",
  "Multan::Shah Rukn-e-Alam": "Shah Rukn-e-Alam Colony",
  "Hyderabad::Cantt": "Cantonment",
  "Quetta::Cantt": "Cantonment",
};

// Deliberately NOT renamed — the candidate target is narrower than the stored
// value, so mapping would assert something untrue about where the user lives:
//   Rawalpindi::Bahria Town -> "Bahria Town Phase 8" is one phase of many
//   Rawalpindi::Chaklala    -> "Chaklala Scheme 3" is one scheme within it
// These keep their current value and simply get no sub-area step.

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");

  if (apply === dryRun) {
    console.error("Pass exactly one of --dry-run or --apply.");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const users = client.db().collection("users");

  let totalMatched = 0;
  let totalModified = 0;

  for (const [key, newTown] of Object.entries(RENAMES)) {
    const [city, oldTown] = key.split("::");
    const filter = { city, town: oldTown };

    const matched = await users.countDocuments(filter);
    if (matched === 0) continue;

    totalMatched += matched;
    console.log(
      `${dryRun ? "[dry-run] " : ""}${city}: "${oldTown}" -> "${newTown}"  (${matched} user${matched === 1 ? "" : "s"})`,
    );

    if (apply) {
      const res = await users.updateMany(filter, { $set: { town: newTown } });
      totalModified += res.modifiedCount;
    }
  }

  console.log(
    `\n${dryRun ? "Would update" : "Updated"} ${dryRun ? totalMatched : totalModified} user document(s) across ${Object.keys(RENAMES).length} rename rules.`,
  );

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
