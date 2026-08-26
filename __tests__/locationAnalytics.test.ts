/**
 * P2.7 — location-capture analytics. Event and property names are a contract
 * with the dashboards, so they are asserted verbatim here: renaming one is a
 * test failure rather than a silently broken funnel.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// `mock`-prefixed so the hoisted jest.mock factory may reference it, and read
// through a wrapper rather than captured directly: the factory runs at import
// time, before this const initializes, so a direct reference lands undefined.
const mockCapture = jest.fn();
jest.mock("@/utils/posthog", () => ({
  posthog: {
    capture: (event: string, properties: Record<string, unknown>) =>
      mockCapture(event, properties),
  },
}));

import type { ViewportSource } from "@/utils/locationAnalytics";
import {
  trackAreaOverridden,
  trackFlowAbandoned,
  trackLocationSaved,
  trackMapOpened,
  trackPinInteracted,
} from "@/utils/locationAnalytics";

beforeEach(() => {
  mockCapture.mockReset();
});

describe("event names and payload shapes", () => {
  it("map_opened { viewportSource }", () => {
    trackMapOpened("saved_pin");
    expect(mockCapture).toHaveBeenCalledWith("map_opened", {
      viewportSource: "saved_pin",
    });
  });

  it.each<ViewportSource>([
    "saved_pin",
    "device_gps",
    "area_centroid",
    "city_centroid",
    "default",
  ])("map_opened accepts viewportSource %s verbatim", (source) => {
    // The full set, spelled out. `area_centroid` and `city_centroid` arrived
    // with the centroid dataset (P2-6) specifically so `default` keeps meaning
    // "shown the whole country"; a rename or a quiet collapse back to four
    // values would change what the funnel counts without changing the funnel.
    trackMapOpened(source);
    expect(mockCapture).toHaveBeenCalledWith("map_opened", {
      viewportSource: source,
    });
  });

  it("pin_interacted { dragCount }", () => {
    trackPinInteracted(3);
    expect(mockCapture).toHaveBeenCalledWith("pin_interacted", { dragCount: 3 });
  });

  it("location_saved { source, precision }", () => {
    trackLocationSaved("map_pin", "building");
    expect(mockCapture).toHaveBeenCalledWith("location_saved", {
      source: "map_pin",
      precision: "building",
    });
  });

  it("area_overridden { geocodedAreaName, selectedAreaName }", () => {
    trackAreaOverridden({
      geocodedAreaName: "Korangi",
      selectedAreaName: "DHA",
    });
    expect(mockCapture).toHaveBeenCalledWith("area_overridden", {
      geocodedAreaName: "Korangi",
      selectedAreaName: "DHA",
    });
  });

  it("flow_abandoned { lastStep }", () => {
    trackFlowAbandoned("pin_placed");
    expect(mockCapture).toHaveBeenCalledWith("flow_abandoned", {
      lastStep: "pin_placed",
    });
  });
});

describe("payload hygiene", () => {
  it("drops an absent optional prop instead of sending undefined", () => {
    trackAreaOverridden({ selectedAreaName: "DHA" });
    expect(mockCapture).toHaveBeenCalledWith("area_overridden", {
      selectedAreaName: "DHA",
    });
    const [, props] = mockCapture.mock.calls[0] as [string, Record<string, unknown>];
    expect("geocodedAreaName" in props).toBe(false);
  });

  it("keeps a zero count — 0 is a value, not an absence", () => {
    trackPinInteracted(0);
    expect(mockCapture).toHaveBeenCalledWith("pin_interacted", { dragCount: 0 });
  });

  it("emits exactly one event per call", () => {
    trackMapOpened("device_gps");
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });
});

describe("analytics can never break a caller", () => {
  it("swallows a throwing capture", () => {
    mockCapture.mockImplementation(() => {
      throw new Error("posthog exploded");
    });
    expect(() => trackLocationSaved("map_pin", "building")).not.toThrow();
    expect(() => trackMapOpened("default")).not.toThrow();
    expect(() => trackFlowAbandoned("map_opened")).not.toThrow();
  });
});
