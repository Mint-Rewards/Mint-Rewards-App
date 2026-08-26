/**
 * Province as the widest map rung, and as a mandatory step.
 *
 * The two arrived together and reinforce each other: making province mandatory
 * guarantees the cascade is entered from the top, which is what makes the
 * province viewport reachable before a city has been named.
 */
import { describe, expect, it } from "@jest/globals";
import {
  getSelectionRegion,
  resolveSelectionViewport,
} from "@/utils/locationForm";
import { validateLocationValues } from "@/utils/locationSave";
import { getProvinceExtent, PROVINCE_EXTENTS } from "@/utils/pakistan_areas";
import type { LocationFormValues } from "@/hooks/useLocationForm";

const COMPLETE: LocationFormValues = {
  province: "Sindh",
  city: "Karachi",
  town: "DHA",
  townOther: "",
  subArea: "Phase 6",
  subAreaOther: "",
  houseNo: "14-B",
  address: "",
  latitude: "24.81",
  longitude: "67.08",
};

const validate = (values: LocationFormValues) =>
  validateLocationValues(values, {
    requireSubArea: true,
    houseNoLabel: "House / flat no.",
  });

describe("province is mandatory", () => {
  it("blocks a save with no province", () => {
    const result = validate({ ...COMPLETE, province: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.province).toBe("Province is required");
  });

  it("passes when it is set", () => {
    expect(validate(COMPLETE).valid).toBe(true);
  });

  it("is still never persisted — the saved value comes from the city", () => {
    // The gate is on the ORDER the form is filled in, not on a new stored
    // answer. Reinstating province as a saved field is what P2.1 removed,
    // because it lets someone store Karachi/Punjab.
    const { buildLocationPayload } = require("@/utils/locationSave");
    const payload = buildLocationPayload({ ...COMPLETE, province: "Punjab" });
    expect(payload.province).toBe("Sindh");
  });
});

describe("the province viewport rung", () => {
  it("covers every province in the registry", () => {
    // Derived from city centroids, so a province whose cities were all rejected
    // by the sweep would have no entry and silently fall back to the country.
    expect(Object.keys(PROVINCE_EXTENTS).length).toBeGreaterThanOrEqual(7);
  });

  it("centres on where a province's cities actually are", () => {
    const region = getSelectionRegion("", "", "Sindh");
    expect(region).not.toBeNull();
    // Between Karachi (24.9) and the northern Sindh cities — NOT a polygon
    // midpoint, which for Balochistan would be empty desert.
    expect(region!.latitude).toBeGreaterThan(24);
    expect(region!.latitude).toBeLessThan(29);
    expect(region!.longitude).toBeGreaterThan(66);
    expect(region!.longitude).toBeLessThan(70);
  });

  it("gives a one-city province a readable viewport rather than a point", () => {
    // Islamabad Capital Territory has exactly one registry city, so its
    // bounding box is a point and the raw deltas are zero.
    const ict = getProvinceExtent("Islamabad Capital Territory")!;
    expect(ict.latitudeDelta).toBeGreaterThan(0);
    expect(ict.longitudeDelta).toBeGreaterThan(0);
  });

  it("is WIDER than the city rung, and city is wider than area", () => {
    const province = resolveSelectionViewport("", "", "Sindh")!;
    const city = resolveSelectionViewport("Karachi", "", "Sindh")!;
    const area = resolveSelectionViewport("Karachi", "DHA", "Sindh")!;
    expect(province.source).toBe("province_centroid");
    expect(city.source).toBe("city_centroid");
    expect(area.source).toBe("area_centroid");
    expect(province.region.latitudeDelta).toBeGreaterThan(
      city.region.latitudeDelta,
    );
    expect(city.region.latitudeDelta).toBeGreaterThan(area.region.latitudeDelta);
  });

  it("narrows to the city as soon as one is chosen", () => {
    const before = getSelectionRegion("", "", "Sindh")!;
    const after = getSelectionRegion("Karachi", "", "Sindh")!;
    expect(after.latitude).not.toBeCloseTo(before.latitude, 1);
    expect(after.latitudeDelta).toBeLessThan(before.latitudeDelta);
  });

  it("falls back to the province for a city the sweep could not confirm", () => {
    // Hub was rejected by the sweep. Before the province rung this was the
    // whole country; now it is at least the right part of it.
    const region = resolveSelectionViewport("Hub", "", "Balochistan");
    expect(region?.source).toBe("province_centroid");
  });

  it("returns null when neither rung has anything", () => {
    expect(resolveSelectionViewport("", "", "")).toBeNull();
    expect(resolveSelectionViewport("Nowhereabad", "", "Atlantis")).toBeNull();
  });
});
