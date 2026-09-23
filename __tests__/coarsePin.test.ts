/// <reference types="jest" />

/**
 * A pin may only claim to be a building when the user could see one.
 *
 * The picker used to open at a 1.1km span and record every tap at that scale
 * as `precision: "building"`, which is the value `directoryRoutable` trusts to
 * send a captain to a door. So a user aiming vaguely at their neighbourhood —
 * on a basemap that draws no buildings that far out — produced a pin the
 * admin side treated as a verified rooftop.
 *
 * The tap is still kept. It is recorded as `area`, which still counts toward a
 * zone's signup threshold and never routes anybody.
 */
import { describe, expect, it, jest } from "@jest/globals";

// `utils/api` drags in `config/env`, which validates the real app
// configuration at import time and throws in a test process. Stubbed for the
// same reason locationApi.test.ts stubs it; nothing here makes a request.
jest.mock("@/utils/api", () => ({
  apiUrl: (path: string) => `https://api.test.invalid${path}`,
  authenticatedFetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
}));

const { pinReducer, initialPinState } = require("@/utils/pinState");
const { buildLocationPatchPayload } = require("@/utils/locationApi");

const AT = { latitude: 24.86, longitude: 67.03 };

describe("what a pin is allowed to claim", () => {
  it("calls a close tap a building", () => {
    const next = pinReducer(initialPinState, { type: "user_place", ...AT, coarse: false });
    expect(next.placement).toBe("user_placed");
  });

  it("calls a far-out tap coarse, without discarding it", () => {
    const next = pinReducer(initialPinState, { type: "user_place", ...AT, coarse: true });
    expect(next.placement).toBe("user_placed_coarse");
    // Still their pin. Losing it would be the worse failure.
    expect(next.pin).toEqual(AT);
  });

  it("treats a missing coarse flag as a building, matching the old callers", () => {
    const next = pinReducer(initialPinState, { type: "user_place", ...AT });
    expect(next.placement).toBe("user_placed");
  });

  it("does not let a centroid overwrite a coarse pin either", () => {
    // A deliberate tap is deliberate whatever the zoom; the original guard
    // only covered "user_placed" and would have silently replaced this one.
    const placed = pinReducer(initialPinState, { type: "user_place", ...AT, coarse: true });
    const after = pinReducer(placed, { type: "centroid", latitude: 24.9, longitude: 67.1 });
    expect(after).toBe(placed);
  });
});

describe("what each placement is worth to the admin side", () => {
  // Asserted through the public builder rather than the private trust table,
  // because the payload is the actual contract with the backend.
  const profile = { city: "Karachi", latitude: "24.86", longitude: "67.03" };

  it("sends building precision for a close tap", () => {
    const payload = buildLocationPatchPayload(profile, "user_placed");
    expect(payload.location.precision).toBe("building");
    expect(payload.location.source).toBe("map_pin");
  });

  it("sends area precision for a coarse tap, which cannot be routed to", () => {
    const payload = buildLocationPatchPayload(profile, "user_placed_coarse");
    expect(payload.location.source).toBe("map_pin");
    // The rule this protects: directoryRoutable requires precision ===
    // "building" AND a trusted source. Area fails the first half, so the
    // household still counts toward zone density and is never dispatched to.
    expect(payload.location.precision).toBe("area");
    expect(payload.location.precision).not.toBe("building");
  });
});
