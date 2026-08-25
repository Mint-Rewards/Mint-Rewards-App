/**
 * MINOR-2: scripts/export_location_registry.ts's alias inversion
 * (`buildAliasesForCity`) must throw on a duplicate alias key within one
 * city rather than silently letting the second town overwrite the first —
 * a lossy collapse the export's own byte-stability guarantee would then ship
 * as fact.
 */
import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@/utils/pakistan_areas", () => {
  const actual = jest.requireActual("@/utils/pakistan_areas") as object;
  return {
    ...actual,
    AREA_META: {
      "Test City::Alpha": { aliases: ["Shared Alias"] },
      "Test City::Beta": { aliases: ["Shared Alias"] },
    },
  };
});

// Imported after the mock so buildAliasesForCity reads the synthetic
// AREA_META above instead of the real registry.
const { buildAliasesForCity } = require("../scripts/export_location_registry");

describe("buildAliasesForCity — duplicate alias guard", () => {
  it("throws when two towns in the same city claim the same alias", () => {
    expect(() => buildAliasesForCity("Test City")).toThrow(
      /Duplicate alias "Shared Alias" in city "Test City"/,
    );
  });
});
