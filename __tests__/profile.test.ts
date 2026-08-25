import { describe, expect, it } from "@jest/globals";
import { isProfileComplete, needsLocationUpdate } from "@/utils/profile";
import type { User } from "@/store/store";

const base = (over: Partial<User>): User =>
  ({ city: "Islamabad", ...over }) as User;

// isProfileComplete also gates phone/province/city AND the saved coordinate
// (owner ruling: no pin = incomplete), so the "true" cases below need all of
// them populated as well as the location fields under test.
const completeBase = (over: Partial<User>): User =>
  ({
    phone: "03001234567",
    province: "Islamabad Capital Territory",
    city: "Islamabad",
    latitude: "33.7294",
    longitude: "73.0931",
    address: "12 Street 7",
    ...over,
  }) as User;

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

  // Owner ruling, 2026-08-25: a user with no saved coordinate has an incomplete
  // profile and is in the same category as a new user. Before this, the rule
  // lived in two screens' hand-rolled expressions that disagreed with each
  // other; these tests are what stop it drifting back out of this function.
  it("is false when the coordinate is missing entirely", () => {
    expect(
      isProfileComplete(
        completeBase({ town: "Sector E-7", subArea: "E-7/1", latitude: "", longitude: "" }),
      ),
    ).toBe(false);
  });

  it("is false when only one half of the coordinate is present", () => {
    for (const half of [{ latitude: "" }, { longitude: "" }]) {
      expect(
        isProfileComplete(
          completeBase({ town: "Sector E-7", subArea: "E-7/1", ...half }),
        ),
      ).toBe(false);
    }
  });

  it("is false when the street address is missing", () => {
    // A coordinate with nowhere to deliver to is not a placeable user either.
    expect(
      isProfileComplete(
        completeBase({ town: "Sector E-7", subArea: "E-7/1", address: "   " }),
      ),
    ).toBe(false);
  });

  it("treats a whitespace-only coordinate as absent", () => {
    expect(
      isProfileComplete(
        completeBase({ town: "Sector E-7", subArea: "E-7/1", latitude: "  " }),
      ),
    ).toBe(false);
  });

  it("is false for a null user", () => {
    expect(needsLocationUpdate(null)).toBe(false);
  });

  it("is true when the saved sub-area has been renamed out of the list for its town", () => {
    expect(
      needsLocationUpdate(
        base({ town: "Sector E-7", subArea: "E-7/99 (Retired Sector)" }),
      ),
    ).toBe(true);
  });
});

describe("isProfileComplete", () => {
  it("is false for a legacy (renamed-out) town", () => {
    expect(isProfileComplete(completeBase({ town: "F-6" }))).toBe(false);
  });

  it("is false for a canonical town with sub-area data and no sub-area set", () => {
    expect(
      isProfileComplete(completeBase({ town: "Sector E-7" })),
    ).toBe(false);
  });

  it("is true for a canonical town with sub-area data and a canonical sub-area set", () => {
    expect(
      isProfileComplete(
        completeBase({ town: "Sector E-7", subArea: "E-7/1" }),
      ),
    ).toBe(true);
  });

  it("is true for a canonical town with sub-area data and free-text sub-area set", () => {
    expect(
      isProfileComplete(
        completeBase({ town: "Sector E-7", subAreaOther: "Street 12" }),
      ),
    ).toBe(true);
  });

  it("is false when the saved sub-area has been renamed out of the list for its town", () => {
    expect(
      isProfileComplete(
        completeBase({ town: "Sector E-7", subArea: "E-7/99 (Retired Sector)" }),
      ),
    ).toBe(false);
  });

  it("is true for a canonical town with no sub-area data", () => {
    expect(isProfileComplete(completeBase({ town: "Bani Gala" }))).toBe(true);
  });

  it("is true for a free-text town (townOther set, town empty)", () => {
    expect(
      isProfileComplete(
        completeBase({ town: "", townOther: "Some Village" }),
      ),
    ).toBe(true);
  });

  it("is false when phone is missing", () => {
    expect(
      isProfileComplete(
        completeBase({ town: "Bani Gala", phone: "" }),
      ),
    ).toBe(false);
  });

  it("is false when province is missing", () => {
    expect(
      isProfileComplete(
        completeBase({ town: "Bani Gala", province: "" }),
      ),
    ).toBe(false);
  });

  it("is false when city is missing", () => {
    expect(
      isProfileComplete(
        completeBase({ town: "Bani Gala", city: "" }),
      ),
    ).toBe(false);
  });

  it("is false for a null user", () => {
    expect(isProfileComplete(null)).toBe(false);
  });
});
