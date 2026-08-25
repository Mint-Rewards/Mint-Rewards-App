/**
 * P2.3 — the structured-location PATCH body. Pins the two things that are
 * silently destructive when wrong: GeoJSON coordinate ORDER (the reverse of the
 * legacy lat/lng pair), and the never-send-both-members-of-a-pair rule, which
 * exists because the endpoint applies leaves in a fixed order and each one
 * clears its sibling.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// These tests cover the PURE mapper, so the network layer is stubbed out
// entirely rather than merely configured. `utils/api` would otherwise drag in
// `config/env` (which validates the real app configuration at import time and
// throws in a test process) and `utils/sentry`, whose SDK starts a cleanup
// interval that keeps the Jest worker alive after the run.
type FetchLike = (url: string, options: any) => Promise<any>;
const mockAuthenticatedFetch = jest.fn<FetchLike>();
jest.mock("@/utils/api", () => ({
  apiUrl: (path: string) => `https://api.test.invalid${path}`,
  // Wrapped rather than captured directly: the factory runs at import time,
  // before the const above initializes.
  authenticatedFetch: (url: string, options: unknown) =>
    mockAuthenticatedFetch(url, options),
}));

import {
  buildLocationPatchPayload,
  patchUserLocation,
} from "@/utils/locationApi";

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
    const { location } = buildLocationPatchPayload(base, "default");
    expect(location?.precision).toBe("unknown");
    expect(location?.source).toBe("legacy_string");
  });

  it("omits location entirely when there is no pin", () => {
    expect(
      buildLocationPatchPayload(
        { ...base, latitude: "", longitude: "" },
        "user_placed",
      ),
    ).not.toHaveProperty("location");
  });

  it("omits location when a coordinate is unparseable", () => {
    for (const broken of [
      { latitude: "abc", longitude: "67.05" },
      { latitude: "24.8", longitude: "  " },
      { latitude: "24.8", longitude: "" },
    ]) {
      expect(
        buildLocationPatchPayload({ ...base, ...broken }, "user_placed"),
      ).not.toHaveProperty("location");
    }
  });
});

/**
 * The map was never opened, so the form is holding coordinates it merely
 * rehydrated. Describing them would overwrite a precise pin with an untrusted
 * one on every unrelated profile edit — the record would get worse the more a
 * user maintained their profile.
 */
describe("a pin nobody touched this session is never re-described", () => {
  it("omits location entirely when placement is null", () => {
    const payload = buildLocationPatchPayload(base, null);
    expect(payload).not.toHaveProperty("location");
  });

  it("still sends the structured address — only the pin goes unmentioned", () => {
    const payload = buildLocationPatchPayload(base, null);
    expect(payload.structuredAddress).toEqual({
      cityId: "Karachi",
      areaId: "DHA",
      blockId: "Phase 6",
    });
  });

  it("cannot downgrade a building-precision pin by saving an unrelated field", () => {
    // The exact regression: same coordinates, user never opened the map.
    const saved = buildLocationPatchPayload(base, "user_placed");
    expect(saved.location?.precision).toBe("building");

    const laterEdit = buildLocationPatchPayload(base, null);
    expect(laterEdit.location).toBeUndefined();
  });

  it("still reports a pin the user DID confirm as-is", () => {
    // Opening the map and confirming a saved pin is a real answer, and stays
    // one — this omission rule must not swallow it.
    const { location } = buildLocationPatchPayload(base, "derived");
    expect(location?.source).toBe("legacy_string");
    expect(location?.precision).toBe("unknown");
  });
});


/**
 * The save this request follows has already succeeded server-side, and it is
 * awaited before the user sees "Profile updated successfully". Unbounded, a
 * stalled connection holds that message forever over work that is already done.
 */
describe("patchUserLocation — bounded wait", () => {
  beforeEach(() => {
    mockAuthenticatedFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  it("sends an abort signal with the request", async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      ok({ Status: "Success", evaluation: { bucket: "has_pin_partial" } }),
    );

    await patchUserLocation({ structuredAddress: { cityId: "Karachi" } }, "tok");

    const [, options] = mockAuthenticatedFetch.mock.calls[0] as [string, any];
    expect(options.signal).toBeDefined();
    expect(options.signal.aborted).toBe(false);
  });

  it("gives up rather than hanging when the request never settles", async () => {
    jest.useFakeTimers();

    // Faithful to real fetch: aborting the signal rejects the pending request.
    mockAuthenticatedFetch.mockImplementation(
      (_url: string, options: any) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    const pending = patchUserLocation({ structuredAddress: {} }, "tok");
    jest.advanceTimersByTime(8000);
    const result = await pending;

    expect(result.Status).toBe("Error");
    expect(
      (result as { ErrorMessage: string }).ErrorMessage,
    ).toMatch(/timed out/i);
  });

  it("names a timeout distinctly from an ordinary network fault", async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error("Network request failed"));

    const result = await patchUserLocation({ structuredAddress: {} }, "tok");

    expect(result.Status).toBe("Error");
    expect((result as { ErrorMessage: string }).ErrorMessage).toBe(
      "Network request failed",
    );
  });

  it("returns the server's evaluation on success", async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      ok({ Status: "Success", evaluation: { bucket: "complete", missing: [] } }),
    );

    const result = await patchUserLocation({ structuredAddress: {} }, "tok");

    expect(result.Status).toBe("Success");
    expect((result as any).evaluation.bucket).toBe("complete");
  });

  it("reads `error` and `message` — the endpoint uses both", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "location.coordinates must be a [lng, lat] pair." }),
    });
    let result = await patchUserLocation({ structuredAddress: {} }, "tok");
    expect((result as { ErrorMessage: string }).ErrorMessage).toMatch(/lng, lat/);

    mockAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "User profile not found." }),
    });
    result = await patchUserLocation({ structuredAddress: {} }, "tok");
    expect((result as { ErrorMessage: string }).ErrorMessage).toBe(
      "User profile not found.",
    );
  });
});
