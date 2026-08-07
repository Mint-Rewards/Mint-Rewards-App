import { describe, expect, it } from "@jest/globals";
import { isCanonicalTown, requiresSubArea } from "@/utils/pakistan_areas";

describe("pakistan_areas fixtures", () => {
  it("recognises a canonical town", () => {
    expect(isCanonicalTown("Islamabad", "Sector E-7")).toBe(true);
  });

  it("rejects a town renamed out of the list", () => {
    expect(isCanonicalTown("Islamabad", "F-6")).toBe(false);
  });

  it("requires a sub-area only where data exists", () => {
    expect(requiresSubArea("Islamabad", "Sector E-7")).toBe(true);
    expect(requiresSubArea("Islamabad", "Bani Gala")).toBe(false);
  });
});
