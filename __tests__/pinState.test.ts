/**
 * P2.2 — MapPicker pin-state machine. Pins the "GPS is viewport only" rule:
 * a device GPS fix may recenter the camera but must never itself become the
 * saved pin. Deliberate placement (a tap, a drag, or redisplaying a value
 * that was already saved) is the only thing allowed to set/keep a pin.
 */
import { describe, expect, it } from "@jest/globals";
import {
  initialPinState,
  pinReducer,
  type PinState,
} from "../utils/pinState";

const COORD_A = { latitude: 24.8607, longitude: 67.0011 };
const COORD_B = { latitude: 31.5204, longitude: 74.3587 };

describe("initialPinState", () => {
  it("starts with no pin and placement 'default'", () => {
    expect(initialPinState).toEqual({ placement: "default", pin: null });
  });
});

describe("pinReducer", () => {
  it("open_with_saved places the pin at the saved coordinate with placement 'derived'", () => {
    const next = pinReducer(initialPinState, {
      type: "open_with_saved",
      ...COORD_A,
    });
    expect(next).toEqual({ placement: "derived", pin: COORD_A });
  });

  it("gps_fix never mutates state, from the initial (no-pin) state", () => {
    const next = pinReducer(initialPinState, { type: "gps_fix" });
    expect(next).toBe(initialPinState);
  });

  it("gps_fix after open_with_saved is a no-op — stays derived at the saved coords", () => {
    const afterOpen = pinReducer(initialPinState, {
      type: "open_with_saved",
      ...COORD_A,
    });
    const afterGps = pinReducer(afterOpen, { type: "gps_fix" });
    expect(afterGps).toBe(afterOpen);
    expect(afterGps).toEqual({ placement: "derived", pin: COORD_A });
  });

  it("gps_fix after a user placement is also a no-op — GPS can never mutate pin state", () => {
    const afterPlace = pinReducer(initialPinState, {
      type: "user_place",
      ...COORD_A,
    });
    const afterGps = pinReducer(afterPlace, { type: "gps_fix" });
    expect(afterGps).toBe(afterPlace);
    expect(afterGps).toEqual({ placement: "user_placed", pin: COORD_A });
  });

  it("user_place sets the pin with placement 'user_placed'", () => {
    const next = pinReducer(initialPinState, {
      type: "user_place",
      ...COORD_A,
    });
    expect(next).toEqual({ placement: "user_placed", pin: COORD_A });
  });

  it("user_place overwrites a previously derived pin", () => {
    const derived: PinState = { placement: "derived", pin: COORD_A };
    const next = pinReducer(derived, { type: "user_place", ...COORD_B });
    expect(next).toEqual({ placement: "user_placed", pin: COORD_B });
  });

  it("centroid sets the pin with placement 'derived' when not user_placed (from default)", () => {
    const next = pinReducer(initialPinState, {
      type: "centroid",
      ...COORD_A,
    });
    expect(next).toEqual({ placement: "derived", pin: COORD_A });
  });

  it("centroid updates an existing derived pin", () => {
    const derived: PinState = { placement: "derived", pin: COORD_A };
    const next = pinReducer(derived, { type: "centroid", ...COORD_B });
    expect(next).toEqual({ placement: "derived", pin: COORD_B });
  });

  it("user_place then centroid is a no-op — never silently overwrite a deliberate placement", () => {
    const afterPlace = pinReducer(initialPinState, {
      type: "user_place",
      ...COORD_A,
    });
    const afterCentroid = pinReducer(afterPlace, {
      type: "centroid",
      ...COORD_B,
    });
    expect(afterCentroid).toBe(afterPlace);
    expect(afterCentroid).toEqual({ placement: "user_placed", pin: COORD_A });
  });

  it("centroid then user_place upgrades to user_placed at the new coordinate", () => {
    const afterCentroid = pinReducer(initialPinState, {
      type: "centroid",
      ...COORD_A,
    });
    const afterPlace = pinReducer(afterCentroid, {
      type: "user_place",
      ...COORD_B,
    });
    expect(afterPlace).toEqual({ placement: "user_placed", pin: COORD_B });
  });
});
