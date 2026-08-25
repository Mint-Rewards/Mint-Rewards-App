/**
 * P2.6a — what the confirm modal opens with.
 *
 * Two things are pinned here because both are silently wrong rather than
 * loudly broken:
 *
 *  - the UNRESOLVED path, which is the common path in production today
 *    (`LOCATIONIQ_API_KEY` unset answers `{ resolved: false }` to every call),
 *    and must still produce a fully populated form; and
 *  - the `shouldPrefillArea` suppression, which refuses to pre-select a
 *    consumer into a port, campus or industrial estate — every user of this app
 *    is a household by construction, so a pin sitting on an industrial plot is
 *    not evidence that the person filling the form works there.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// The network layer is stubbed out entirely rather than merely configured:
// `utils/api` drags in `config/env` (which validates the real app config at
// import time and throws in a test process) and `utils/sentry`, whose SDK
// starts a cleanup interval that keeps the Jest worker alive after the run.
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
  EMPTY_GEOCODE_RESULT,
  buildPrefill,
  reverseGeocode,
  type ReverseGeocodeResult,
} from "@/utils/locationPrefill";

/** A resolved answer, with only the interesting fields spelled out per test. */
const geo = (over: Partial<ReverseGeocodeResult> = {}): ReverseGeocodeResult => ({
  ...EMPTY_GEOCODE_RESULT,
  resolved: true,
  ...over,
});

const savedUser = {
  city: "Karachi",
  town: "Gulshan-e-Iqbal",
  subArea: "Block 13-D",
  address: "12 Main Street",
};

describe("buildPrefill — the geocoder is an enhancement, not a precondition", () => {
  it("prefills entirely from the user's own fields when unresolved", () => {
    expect(buildPrefill(EMPTY_GEOCODE_RESULT, savedUser)).toEqual({
      city: "Karachi",
      town: "Gulshan-e-Iqbal",
      subArea: "Block 13-D",
      street: "12 Main Street",
    });
  });

  it("treats a missing geocode result the same as an unresolved one", () => {
    expect(buildPrefill(null, savedUser)).toEqual(
      buildPrefill(EMPTY_GEOCODE_RESULT, savedUser),
    );
    expect(buildPrefill(undefined, savedUser)).toEqual(
      buildPrefill(EMPTY_GEOCODE_RESULT, savedUser),
    );
  });

  it("ignores geocoded values that arrive alongside resolved:false", () => {
    // The route can only answer resolved:false with a null areaName, but a
    // caller must never depend on that to avoid writing a stale guess.
    const result = buildPrefill(
      { ...EMPTY_GEOCODE_RESULT, cityName: "Lahore", areaName: "DHA Lahore" },
      savedUser,
    );
    expect(result.city).toBe("Karachi");
    expect(result.town).toBe("Gulshan-e-Iqbal");
  });

  it("returns empty strings, never undefined, for an empty profile", () => {
    expect(buildPrefill(EMPTY_GEOCODE_RESULT, {})).toEqual({
      city: "",
      town: "",
      subArea: "",
      street: "",
    });
    expect(buildPrefill(null, null)).toEqual({
      city: "",
      town: "",
      subArea: "",
      street: "",
    });
  });

  it("trims saved values", () => {
    const result = buildPrefill(null, {
      city: "  Karachi  ",
      town: "  DHA  ",
      address: "  12 Main Street  ",
    });
    expect(result).toEqual({
      city: "Karachi",
      town: "DHA",
      subArea: "",
      street: "12 Main Street",
    });
  });
});

describe("buildPrefill — a resolved answer", () => {
  it("pre-selects a residential area the registry allows", () => {
    const result = buildPrefill(
      geo({ cityName: "Karachi", areaName: "DHA" }),
      savedUser,
    );
    expect(result.city).toBe("Karachi");
    expect(result.town).toBe("DHA");
  });

  it("keeps a geocoded city only when the registry knows it", () => {
    const result = buildPrefill(
      geo({ cityName: "Atlantis", areaName: "DHA" }),
      savedUser,
    );
    expect(result.city).toBe("Karachi");
  });

  it("puts blockHint on the free-text street line", () => {
    const result = buildPrefill(
      geo({ cityName: "Karachi", areaName: "DHA", blockHint: "Khayaban-e-Shahbaz" }),
      savedUser,
    );
    expect(result.street).toBe("Khayaban-e-Shahbaz");
  });

  it("falls back to the saved street when there is no hint", () => {
    const result = buildPrefill(geo({ cityName: "Karachi", areaName: "DHA" }), savedUser);
    expect(result.street).toBe("12 Main Street");
  });

  it("never writes blockHint into a canonical field", () => {
    // `blockHint` is a raw OSM string. The route's own comment forbids any
    // caller from treating it as an area.
    const result = buildPrefill(
      geo({ cityName: "Karachi", areaName: null, blockHint: "Khayaban-e-Shahbaz" }),
      savedUser,
    );
    expect(result.town).toBe("Gulshan-e-Iqbal");
    expect(result.subArea).toBe("Block 13-D");
  });

  it("never invents a house number — the field is not even in the shape", () => {
    expect(Object.keys(buildPrefill(geo({ cityName: "Karachi", areaName: "DHA" }), savedUser)))
      .toEqual(["city", "town", "subArea", "street"]);
  });
});

describe("buildPrefill — shouldPrefillArea suppression", () => {
  // A consumer is never pre-selected into a port or an industrial estate,
  // however precisely the geocoder placed the coordinate: the pin may sit on an
  // industrial plot while the person filling the form lives across the road.
  it.each(["West Wharf", "Korangi Industrial Area", "Sindh Industrial Trading Estate"])(
    "refuses to pre-select the non-residential area %s",
    (area) => {
      const result = buildPrefill(geo({ cityName: "Karachi", areaName: area }), savedUser);
      expect(result.town).not.toBe(area);
    },
  );

  it("falls back to the saved town rather than blanking the field", () => {
    // Suppressing a guess must not also destroy an answer the user already
    // gave — they would land on an empty required dropdown.
    const result = buildPrefill(
      geo({ cityName: "Karachi", areaName: "West Wharf" }),
      savedUser,
    );
    expect(result.town).toBe("Gulshan-e-Iqbal");
    expect(result.subArea).toBe("Block 13-D");
  });

  it("also refuses an area whose per-area precision gate is off", () => {
    // `geocodePrefill: false` is the measured half of the rule: the area is
    // residential, but the geocoder has not demonstrated it can place it.
    const result = buildPrefill(
      geo({ cityName: "Karachi", areaName: "Surjani Town" }),
      savedUser,
    );
    expect(result.town).toBe("Gulshan-e-Iqbal");
  });

  it("suppressed areas remain resolvable — only the pre-selection is dropped", () => {
    const answer = geo({ cityName: "Karachi", areaName: "West Wharf" });
    expect(answer.areaName).toBe("West Wharf");
    expect(buildPrefill(answer, savedUser).town).toBe("Gulshan-e-Iqbal");
  });
});

describe("buildPrefill — canonicality of the town field", () => {
  it("rejects a geocoded area that is not canonical for the resolved city", () => {
    // A real Lahore town, but the pin resolved to Karachi. Writing it would put
    // a value in `town` that its own city's dropdown cannot offer.
    const result = buildPrefill(
      geo({ cityName: "Karachi", areaName: "Model Town" }),
      savedUser,
    );
    expect(result.town).toBe("Gulshan-e-Iqbal");
  });

  it("rejects a free-text area name outright", () => {
    const result = buildPrefill(
      geo({ cityName: "Karachi", areaName: "near the big roundabout" }),
      savedUser,
    );
    expect(result.town).toBe("Gulshan-e-Iqbal");
  });
});

describe("buildPrefill — the saved sub-area follows its town", () => {
  it("keeps the saved sub-area when the town did not move", () => {
    const result = buildPrefill(
      geo({ cityName: "Karachi", areaName: "Gulshan-e-Iqbal" }),
      savedUser,
    );
    expect(result.subArea).toBe("Block 13-D");
  });

  it("drops a sub-area that belongs to the town the geocoder replaced", () => {
    // "Block 13-D" is a Gulshan block. Carrying it into DHA would show a block
    // from a different area as though the user had chosen it there.
    const result = buildPrefill(
      geo({ cityName: "Karachi", areaName: "DHA" }),
      savedUser,
    );
    expect(result.town).toBe("DHA");
    expect(result.subArea).toBe("");
  });
});

describe("reverseGeocode — request contract", () => {
  beforeEach(() => {
    mockAuthenticatedFetch.mockReset();
  });

  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

  it("POSTs { lat, lng } — the route's names, not this app's", async () => {
    mockAuthenticatedFetch.mockResolvedValue(ok(EMPTY_GEOCODE_RESULT));

    await reverseGeocode(24.8007, 67.05, "tok");

    const [url, options] = mockAuthenticatedFetch.mock.calls[0] as [string, any];
    expect(url).toBe("https://api.test.invalid/api/location/reverse-geocode");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ lat: 24.8007, lng: 67.05 });
  });

  it("sends the RAW token, never a Bearer prefix", async () => {
    mockAuthenticatedFetch.mockResolvedValue(ok(EMPTY_GEOCODE_RESULT));

    await reverseGeocode(24.8007, 67.05, "tok");

    const [, options] = mockAuthenticatedFetch.mock.calls[0] as [string, any];
    expect(options.headers.Authorization).toBe("tok");
  });

  it("omits the header entirely when there is no token", async () => {
    mockAuthenticatedFetch.mockResolvedValue(ok(EMPTY_GEOCODE_RESULT));

    await reverseGeocode(24.8007, 67.05, null);

    const [, options] = mockAuthenticatedFetch.mock.calls[0] as [string, any];
    expect(options.headers).not.toHaveProperty("Authorization");
  });

  it("sends an abort signal with the request", async () => {
    mockAuthenticatedFetch.mockResolvedValue(ok(EMPTY_GEOCODE_RESULT));

    await reverseGeocode(24.8007, 67.05, "tok");

    const [, options] = mockAuthenticatedFetch.mock.calls[0] as [string, any];
    expect(options.signal).toBeDefined();
    expect(options.signal.aborted).toBe(false);
  });

  it("never spends a round trip on a coordinate the route would 400", async () => {
    // 20 requests/hour/user: a malformed pin must not burn one of them.
    for (const [lat, lng] of [
      [NaN, 67.05],
      [24.8, Infinity],
      [91, 67.05],
      [24.8, 181],
    ]) {
      await expect(reverseGeocode(lat, lng, "tok")).resolves.toEqual(
        EMPTY_GEOCODE_RESULT,
      );
    }
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });
});

describe("reverseGeocode — never throws", () => {
  beforeEach(() => {
    mockAuthenticatedFetch.mockReset();
  });

  it("returns the resolved payload on success", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        resolved: true,
        cityName: "Karachi",
        areaName: "DHA",
        blockHint: "Khayaban-e-Shahbaz",
        raw: { suburb: "Defence Housing Authority" },
        unmatched: ["Defence Housing Authority"],
      }),
    });

    const result = await reverseGeocode(24.8007, 67.05, "tok");

    expect(result.resolved).toBe(true);
    expect(result.areaName).toBe("DHA");
    expect(result.unmatched).toEqual(["Defence Housing Authority"]);
  });

  it("degrades to the empty result on a non-2xx", async () => {
    for (const status of [400, 401, 429, 500]) {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ error: "nope" }),
      });
      await expect(reverseGeocode(24.8, 67.05, "tok")).resolves.toEqual(
        EMPTY_GEOCODE_RESULT,
      );
    }
  });

  it("degrades to the empty result on a network fault", async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error("Network request failed"));
    await expect(reverseGeocode(24.8, 67.05, "tok")).resolves.toEqual(
      EMPTY_GEOCODE_RESULT,
    );
  });

  it("degrades to the empty result on an unparseable body", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    });
    await expect(reverseGeocode(24.8, 67.05, "tok")).resolves.toEqual(
      EMPTY_GEOCODE_RESULT,
    );
  });

  it("normalizes a 200 whose shape is not what the contract promises", async () => {
    // A `undefined` leaking into the form is worse than a fallback: the modal
    // would render a controlled input with no value.
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ resolved: "yes", cityName: 42, unmatched: "nope" }),
    });

    const result = await reverseGeocode(24.8, 67.05, "tok");

    expect(result).toEqual(EMPTY_GEOCODE_RESULT);
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

    const pending = reverseGeocode(24.8, 67.05, "tok");
    jest.advanceTimersByTime(8000);

    await expect(pending).resolves.toEqual(EMPTY_GEOCODE_RESULT);
    jest.useRealTimers();
  });

  it("feeds a failure straight into the saved-values prefill", async () => {
    // The end-to-end guarantee: a dead geocoder still opens a usable modal.
    mockAuthenticatedFetch.mockRejectedValue(new Error("Network request failed"));

    const result = await reverseGeocode(24.8, 67.05, "tok");

    expect(buildPrefill(result, savedUser)).toEqual({
      city: "Karachi",
      town: "Gulshan-e-Iqbal",
      subArea: "Block 13-D",
      street: "12 Main Street",
    });
  });
});
