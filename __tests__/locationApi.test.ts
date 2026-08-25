/**
 * P2.3 — the structured-location PATCH body. Pins the two things that are
 * silently destructive when wrong: GeoJSON coordinate ORDER (the reverse of the
 * legacy lat/lng pair), and the never-send-both-members-of-a-pair rule, which
 * exists because the endpoint applies leaves in a fixed order and each one
 * clears its sibling.
 */
import { describe, expect, it, jest } from "@jest/globals";

// These tests cover the PURE mapper, so the network layer is stubbed out
// entirely rather than merely configured. `utils/api` would otherwise drag in
// `config/env` (which validates the real app configuration at import time and
// throws in a test process) and `utils/sentry`, whose SDK starts a cleanup
// interval that keeps the Jest worker alive after the run.
jest.mock("@/utils/api", () => ({
  apiUrl: (path: string) => `https://api.test.invalid${path}`,
  authenticatedFetch: jest.fn(),
}));

import { buildLocationPatchPayload } from "@/utils/locationApi";

const base = {
  city: "Karachi",
  town: "DHA",
  townOther: "",
  subArea: "Phase 6",
  subAreaOther: "",
  latitude: "24.8007",
  longitude: "67.0500",
};

describe("buildLocationPatchPayload — structured address", () => {
  it("maps the canonical trio onto cityId / areaId / blockId", () => {
    const { structuredAddress } = buildLocationPatchPayload(base, "user_placed");
    expect(structuredAddress).toEqual({
      cityId: "Karachi",
      areaId: "DHA",
      blockId: "Phase 6",
    });
  });

  it("sends areaOther INSTEAD of areaId for a free-text town", () => {
    const { structuredAddress } = buildLocationPatchPayload(
      { ...base, town: "", townOther: "Somewhere" },
      "user_placed",
    );
    expect(structuredAddress?.areaOther).toBe("Somewhere");
    expect(structuredAddress).not.toHaveProperty("areaId");
  });

  it("sends blockOther INSTEAD of blockId for a free-text sub-area", () => {
    const { structuredAddress } = buildLocationPatchPayload(
      { ...base, subArea: "", subAreaOther: "Near the masjid" },
      "user_placed",
    );
    expect(structuredAddress?.blockOther).toBe("Near the masjid");
    expect(structuredAddress).not.toHaveProperty("blockId");
  });

  it("never sends both members of a pair — the order-of-application trap", () => {
    for (const profile of [
      base,
      { ...base, town: "", townOther: "Somewhere" },
      { ...base, subArea: "", subAreaOther: "Near the masjid" },
      { ...base, town: "", townOther: "", subArea: "", subAreaOther: "" },
    ]) {
      const sa = buildLocationPatchPayload(profile, "user_placed")
        .structuredAddress!;
      expect("areaId" in sa && "areaOther" in sa).toBe(false);
      expect("blockId" in sa && "blockOther" in sa).toBe(false);
    }
  });

  it("clears a stale block with an empty canonical leaf when neither is set", () => {
    // A town change clears the sub-area pair. Omitting the leaf would leave the
    // PREVIOUS town's block sitting in structuredAddress forever.
    const { structuredAddress } = buildLocationPatchPayload(
      { ...base, subArea: "", subAreaOther: "" },
      "user_placed",
    );
    expect(structuredAddress?.blockId).toBe("");
  });

  it("clears the area pair the same way", () => {
    const { structuredAddress } = buildLocationPatchPayload(
      { ...base, town: "", townOther: "" },
      "user_placed",
    );
    expect(structuredAddress?.areaId).toBe("");
  });

  it("never sends an empty cityId — that would clear a good value", () => {
    const { structuredAddress } = buildLocationPatchPayload(
      { ...base, city: "" },
      "user_placed",
    );
    expect(structuredAddress).not.toHaveProperty("cityId");
  });

  it("trims whitespace on every leaf", () => {
    const { structuredAddress } = buildLocationPatchPayload(
      { city: "  Karachi  ", town: "  DHA  ", subAreaOther: "  Block 2  " },
      null,
    );
    expect(structuredAddress).toEqual({
      cityId: "Karachi",
      areaId: "DHA",
      blockOther: "Block 2",
    });
  });

  it("never sends houseNo or streetOrBlock — no field collects them yet", () => {
    const sa = buildLocationPatchPayload(base, "user_placed").structuredAddress!;
    expect(sa).not.toHaveProperty("houseNo");
    expect(sa).not.toHaveProperty("streetOrBlock");
  });
});

describe("buildLocationPatchPayload — location", () => {
  it("emits GeoJSON [lng, lat], the reverse of the legacy pair", () => {
    const { location } = buildLocationPatchPayload(base, "user_placed");
    expect(location?.coordinates).toEqual([67.05, 24.8007]);
  });

  it("tags a deliberately placed pin as map_pin / building", () => {
    const { location } = buildLocationPatchPayload(base, "user_placed");
    expect(location?.source).toBe("map_pin");
    expect(location?.precision).toBe("building");
  });

  it("tags a redisplayed saved coordinate as legacy_string / unknown", () => {
    const { location } = buildLocationPatchPayload(base, "derived");
    expect(location?.source).toBe("legacy_string");
    expect(location?.precision).toBe("unknown");
  });

  it("treats an unknown placement conservatively, never as building", () => {
    for (const placement of ["default", null] as const) {
      const { location } = buildLocationPatchPayload(base, placement);
      expect(location?.precision).toBe("unknown");
      expect(location?.source).toBe("legacy_string");
    }
  });

  it("omits location entirely when there is no pin", () => {
    expect(
      buildLocationPatchPayload({ ...base, latitude: "", longitude: "" }, null),
    ).not.toHaveProperty("location");
  });

  it("omits location when a coordinate is unparseable", () => {
    for (const broken of [
      { latitude: "abc", longitude: "67.05" },
      { latitude: "24.8", longitude: "" },
      { latitude: "24.8", longitude: "  " },
    ]) {
      expect(
        buildLocationPatchPayload({ ...base, ...broken }, "user_placed"),
      ).not.toHaveProperty("location");
    }
  });
});
