/**
 * Coverage for utils/locationGateConfig.ts.
 *
 * normalizeLocationGate's whole job is surviving a malformed-input matrix
 * without throwing or fabricating a config that's more restrictive than "off"
 * — so that matrix is what most of this file is. fetchLocationGateConfig gets
 * a lighter pass mirroring __tests__/updateGate.test.tsx's fetch-failure
 * cases, since the timeout/network plumbing is the same pattern duplicated
 * from components/UpdateGate.tsx.
 */
import { describe, expect, it, jest, afterEach } from "@jest/globals";

jest.mock("@/config/env", () => ({
  API_BASE_URL: "https://api.test.invalid",
  ENV: { appVariant: "production", apiUrl: "https://api.test.invalid" },
  IS_DEV: false,
}));

import {
  normalizeLocationGate,
  fetchLocationGateConfig,
} from "@/utils/locationGateConfig";

const VALID = {
  minSupportedVersion: "2.1.8",
  minSupportedBuildNumber: { ios: 0, android: 0 },
  iosStoreUrl: null,
  androidStoreUrl: null,
  forceOTA: false,
  locationGate: {
    mode: "soft",
    activatedCitiesOnly: false,
    maxDismissals: 3,
    minClientBuild: { ios: null, android: null },
  },
};

function withLocationGate(overrides: Record<string, unknown>) {
  return {
    ...VALID,
    locationGate: { ...VALID.locationGate, ...overrides },
  };
}

describe("normalizeLocationGate — envelope", () => {
  it("accepts a fully valid app-config body", () => {
    expect(normalizeLocationGate(VALID)).toEqual({
      mode: "soft",
      activatedCitiesOnly: false,
      maxDismissals: 3,
      minClientBuild: { ios: null, android: null },
    });
  });

  it.each([null, undefined, "a string", 42, true, []])(
    "returns null for a non-object body: %p",
    (body) => {
      expect(normalizeLocationGate(body)).toBeNull();
    },
  );

  it("returns null when locationGate is missing", () => {
    const { locationGate, ...rest } = VALID;
    expect(normalizeLocationGate(rest)).toBeNull();
  });

  it.each([null, "soft", 42, true, []])(
    "returns null when locationGate is not an object: %p",
    (badLocationGate) => {
      expect(
        normalizeLocationGate({ ...VALID, locationGate: badLocationGate }),
      ).toBeNull();
    },
  );

  it("ignores unrecognised top-level and locationGate fields", () => {
    const body = {
      ...VALID,
      somethingNew: "ignored",
      locationGate: { ...VALID.locationGate, extra: "also ignored" },
    };
    expect(normalizeLocationGate(body)).toEqual({
      mode: "soft",
      activatedCitiesOnly: false,
      maxDismissals: 3,
      minClientBuild: { ios: null, android: null },
    });
  });
});

describe("normalizeLocationGate — mode", () => {
  it.each(["hard", "soft", "off"] as const)("accepts mode %p", (mode) => {
    expect(normalizeLocationGate(withLocationGate({ mode }))?.mode).toBe(mode);
  });

  it("returns null for an unrecognised mode string", () => {
    expect(normalizeLocationGate(withLocationGate({ mode: "bogus" }))).toBeNull();
  });

  it("returns null when mode is missing", () => {
    const { mode, ...rest } = VALID.locationGate;
    expect(normalizeLocationGate({ ...VALID, locationGate: rest })).toBeNull();
  });

  it.each([null, undefined, 1, true, {}, ["hard"]])(
    "returns null when mode is the wrong type: %p",
    (mode) => {
      expect(normalizeLocationGate(withLocationGate({ mode }))).toBeNull();
    },
  );
});

describe("normalizeLocationGate — maxDismissals", () => {
  it("defaults to 3 when absent", () => {
    const { maxDismissals, ...rest } = VALID.locationGate;
    expect(
      normalizeLocationGate({ ...VALID, locationGate: rest })?.maxDismissals,
    ).toBe(3);
  });

  it("passes through a valid positive integer", () => {
    expect(
      normalizeLocationGate(withLocationGate({ maxDismissals: 7 }))?.maxDismissals,
    ).toBe(7);
  });

  it("accepts 1 as the minimum valid value", () => {
    expect(
      normalizeLocationGate(withLocationGate({ maxDismissals: 1 }))?.maxDismissals,
    ).toBe(1);
  });

  it.each([0, -1, 1.5, NaN, "3", true, null, {}, []])(
    "returns null for an explicitly invalid maxDismissals: %p — absent and invalid are different signals",
    (maxDismissals) => {
      expect(normalizeLocationGate(withLocationGate({ maxDismissals }))).toBeNull();
    },
  );
});

describe("normalizeLocationGate — activatedCitiesOnly", () => {
  it("passes through true", () => {
    expect(
      normalizeLocationGate(withLocationGate({ activatedCitiesOnly: true }))
        ?.activatedCitiesOnly,
    ).toBe(true);
  });

  it("defaults to false when absent", () => {
    const { activatedCitiesOnly, ...rest } = VALID.locationGate;
    expect(
      normalizeLocationGate({ ...VALID, locationGate: rest })?.activatedCitiesOnly,
    ).toBe(false);
  });

  it.each(["true", 1, null, {}, []])(
    "degrades a non-boolean value to false rather than invalidating the config: %p",
    (activatedCitiesOnly) => {
      const result = normalizeLocationGate(
        withLocationGate({ activatedCitiesOnly }),
      );
      expect(result).not.toBeNull();
      expect(result?.activatedCitiesOnly).toBe(false);
    },
  );
});

describe("normalizeLocationGate — minClientBuild", () => {
  it("passes through valid non-negative integers for both platforms", () => {
    const result = normalizeLocationGate(
      withLocationGate({ minClientBuild: { ios: 42, android: 43 } }),
    );
    expect(result?.minClientBuild).toEqual({ ios: 42, android: 43 });
  });

  it("defaults both platforms to null when minClientBuild is absent", () => {
    const { minClientBuild, ...rest } = VALID.locationGate;
    expect(
      normalizeLocationGate({ ...VALID, locationGate: rest })?.minClientBuild,
    ).toEqual({ ios: null, android: null });
  });

  it.each([null, "not an object", 42, true, []])(
    "degrades to {ios: null, android: null} when minClientBuild itself is not an object: %p",
    (minClientBuild) => {
      const result = normalizeLocationGate(withLocationGate({ minClientBuild }));
      expect(result).not.toBeNull();
      expect(result?.minClientBuild).toEqual({ ios: null, android: null });
    },
  );

  it.each([-1, 1.5, "42", true, {}, []])(
    "degrades an invalid ios value to null without touching android: %p",
    (ios) => {
      const result = normalizeLocationGate(
        withLocationGate({ minClientBuild: { ios, android: 10 } }),
      );
      expect(result).not.toBeNull();
      expect(result?.minClientBuild).toEqual({ ios: null, android: 10 });
    },
  );

  it("accepts explicit null per platform as 'no minimum configured'", () => {
    const result = normalizeLocationGate(
      withLocationGate({ minClientBuild: { ios: null, android: null } }),
    );
    expect(result?.minClientBuild).toEqual({ ios: null, android: null });
  });

  it("accepts 0 as a valid build number floor", () => {
    const result = normalizeLocationGate(
      withLocationGate({ minClientBuild: { ios: 0, android: 0 } }),
    );
    expect(result?.minClientBuild).toEqual({ ios: 0, android: 0 });
  });
});

describe("fetchLocationGateConfig", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockFetchResolving(body: unknown, ok = true, status = 200) {
    (global as any).fetch = jest.fn(async () => ({
      ok,
      status,
      json: async () => body,
    }));
  }

  it("returns the normalised config on a successful response", async () => {
    mockFetchResolving(VALID);
    await expect(fetchLocationGateConfig()).resolves.toEqual({
      mode: "soft",
      activatedCitiesOnly: false,
      maxDismissals: 3,
      minClientBuild: { ios: null, android: null },
    });
  });

  it("calls the unauthenticated /api/app-config endpoint with no headers", async () => {
    mockFetchResolving(VALID);
    await fetchLocationGateConfig();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test.invalid/api/app-config",
      expect.objectContaining({ signal: expect.anything() }),
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toBeUndefined();
  });

  it("returns null when the fetch rejects", async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error("Network request failed");
    });
    await expect(fetchLocationGateConfig()).resolves.toBeNull();
  });

  it("returns null when the fetch times out (AbortError)", async () => {
    (global as any).fetch = jest.fn(async () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      throw error;
    });
    await expect(fetchLocationGateConfig()).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    mockFetchResolving({}, false, 503);
    await expect(fetchLocationGateConfig()).resolves.toBeNull();
  });

  it("returns null when the response body is not valid JSON", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    }));
    await expect(fetchLocationGateConfig()).resolves.toBeNull();
  });

  it("returns null when the JSON parses but the payload is unusable", async () => {
    mockFetchResolving({ unexpected: "payload" });
    await expect(fetchLocationGateConfig()).resolves.toBeNull();
  });
});
