/**
 * IMPORTANT-3 (artifact sync guard, app side): asserts that running the
 * export logic in-process produces output deep-equal to the committed
 * fixture at `utils/__generated__/locationRegistry.json`.
 *
 * This is half of the cross-repo sync guard described in
 * `scripts/export_location_registry.ts`'s own header: it catches a
 * `pakistan_areas.ts` edit whose export was never regenerated (or was
 * regenerated but not committed), but it CANNOT catch a fixture that was
 * regenerated correctly here while the backend's own copy
 * (`Mint-Rewards-Backend/lib/data/locationRegistry.json`) was left stale —
 * that half relies on the regeneration discipline documented in the
 * generator's header, not on anything either repo's test suite can enforce
 * automatically across the repo boundary.
 */
import { describe, expect, it } from "@jest/globals";
import { buildRegistry } from "../scripts/export_location_registry";
import fixture from "../utils/__generated__/locationRegistry.json";

describe("export_location_registry — fixture sync", () => {
  it("produces output deep-equal to the committed fixture", () => {
    expect(buildRegistry()).toEqual(fixture);
  });

  it("is byte-stable: two in-process runs produce identical JSON", () => {
    const first = JSON.stringify(buildRegistry(), null, 2);
    const second = JSON.stringify(buildRegistry(), null, 2);
    expect(first).toBe(second);
  });
});
