/**
 * PostHog events for the location-capture flow (P2.7).
 *
 * Event names and property names are VERBATIM from the master plan — they are
 * a contract with the dashboards, not a naming choice this module gets to make.
 * Renaming one here silently breaks a funnel rather than failing a build.
 *
 * Every emitter is fire-and-forget and swallows its own failures: analytics
 * must never be the reason a save or a modal close throws.
 */

import type { LocationPrecision, LocationSource } from "@/utils/locationApi";
import { posthog } from "@/utils/posthog";

/**
 * What the map camera was centered on when the picker opened.
 *
 * Resolved AFTER the initial centering settles, not at first render: with no
 * saved coordinate the camera starts on the Pakistan-wide default and only
 * becomes `device_gps` if a fix actually arrives.
 *
 * `area_centroid` / `city_centroid` / `province_centroid` are the registry
 * fallbacks, added when the centroid dataset landed (P2-6) and widened when the
 * map gained a province rung. They exist so `default` keeps the meaning it
 * had before: the user was shown the WHOLE COUNTRY. Without them the dataset
 * would silently redefine `default` to also cover "opened on their own city",
 * and the one population worth counting — everyone who got no useful view at
 * all — would stop being visible without any dashboard change to explain it.
 * Their ratio is also the live read on area coverage, which is partial.
 */
export type ViewportSource =
  | "saved_pin"
  | "device_gps"
  | "area_centroid"
  | "city_centroid"
  | "province_centroid"
  | "default";

/**
 * The furthest point reached before the picker was closed without confirming.
 * Ordered by progress: opened -> centered -> placed.
 */
export type FlowStep = "map_opened" | "gps_centered" | "pin_placed";

/** Every property this module sends is a scalar — no nested objects. */
type EventProperties = Record<string, string | number | boolean | undefined>;

/** Sends an event, dropping undefined props so they don't reach the dashboard. */
function capture(event: string, properties: EventProperties): void {
  try {
    const clean: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined) clean[key] = value;
    }
    posthog.capture(event, clean);
  } catch {
    // Reporting must never be the reason a caller throws.
  }
}

/** The map picker opened, and its initial camera position has settled. */
export function trackMapOpened(viewportSource: ViewportSource): void {
  capture("map_opened", { viewportSource });
}

/**
 * The user placed or moved the pin.
 *
 * Emitted per interaction, carrying the running count for this session of the
 * picker, so the dashboard gets both a rate and a distribution: one placement
 * is a confident user, eight is someone fighting the map.
 */
export function trackPinInteracted(dragCount: number): void {
  capture("pin_interacted", { dragCount });
}

/** A structured location was persisted, with how far it can be trusted. */
export function trackLocationSaved(
  source: LocationSource,
  precision: LocationPrecision,
): void {
  capture("location_saved", { source, precision });
}

/**
 * The user picked an area other than the one the geocoder prefilled.
 *
 * INERT until prefill wiring ships (it lands with the gate flow): nothing
 * prefills an area today, so nothing can override one. It exists now so the
 * instrumentation predates the thing it measures — the P2.6a ordering — and
 * the demotion decision has data from day one instead of from day thirty.
 */
export function trackAreaOverridden(params: {
  geocodedAreaName?: string;
  selectedAreaName: string;
}): void {
  capture("area_overridden", {
    geocodedAreaName: params.geocodedAreaName,
    selectedAreaName: params.selectedAreaName,
  });
}

/**
 * The structured-location write failed after a successful save.
 *
 * NOT in the master plan's event list — added because `location_saved` fires on
 * the save rather than on this request, so without a counter here the dashboard
 * would always show more structured saves than the database holds and the gap
 * would be unmeasurable. The user never sees this failure; this is the only
 * place it becomes a number.
 */
export function trackLocationPatchFailed(reason: string): void {
  capture("location_patch_failed", { reason });
}

/** The picker was closed without confirming a pin. */
export function trackFlowAbandoned(lastStep: FlowStep): void {
  capture("flow_abandoned", { lastStep });
}
