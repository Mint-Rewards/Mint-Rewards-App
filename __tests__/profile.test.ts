import { describe, expect, it } from "@jest/globals";
import { needsLocationUpdate } from "@/utils/profile";
import type { User } from "@/store/store";

const base = (over: Partial<User>): User =>
  ({ city: "Islamabad", ...over }) as User;

describe("needsLocationUpdate", () => {
  it("is true for a town renamed out of the canonical list", () => {
    expect(needsLocationUpdate(base({ town: "F-6" }))).toBe(true);
  });

  it("is true for a canonical town with sub-area data and no sub-area", () => {
    expect(needsLocationUpdate(base({ town: "Sector E-7" }))).toBe(true);
  });

  it("is false once a canonical sub-area is set", () => {
    expect(
      needsLocationUpdate(base({ town: "Sector E-7", subArea: "E-7/1" })),
    ).toBe(false);
  });

  it("is false once a free-text sub-area is set", () => {
    expect(
      needsLocationUpdate(base({ town: "Sector E-7", subAreaOther: "Street 12" })),
    ).toBe(false);
  });

  it("is false for a canonical town with no sub-area data", () => {
    expect(needsLocationUpdate(base({ town: "Bani Gala" }))).toBe(false);
  });

  it("is false for a free-text town user", () => {
    expect(
      needsLocationUpdate(base({ town: "", townOther: "Some Village" })),
    ).toBe(false);
  });

  it("is false when no town has been entered at all", () => {
    expect(needsLocationUpdate(base({ town: "", townOther: "" }))).toBe(false);
  });

  it("is false for a city with no canonical town list", () => {
    expect(needsLocationUpdate(base({ city: "Sialkot", town: "Cantt" }))).toBe(
      false,
    );
  });

  it("is false for a null user", () => {
    expect(needsLocationUpdate(null)).toBe(false);
  });
});
