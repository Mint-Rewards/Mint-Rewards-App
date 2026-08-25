/**
 * Pure pin-state machine for MapPicker (P2.2).
 *
 * Locked decision: GPS is viewport only. A device location fix may recenter
 * the map camera, but it must never itself become the saved pin — only a
 * deliberate tap/drag (`user_place`), a previously-saved coordinate being
 * redisplayed (`open_with_saved`), or a selection-driven reposition
 * (`centroid`, when the user hasn't already placed a pin) may set it.
 */

export type PinPlacement = "default" | "derived" | "user_placed";

export interface PinState {
  placement: PinPlacement;
  pin: { latitude: number; longitude: number } | null;
}

export const initialPinState: PinState = { placement: "default", pin: null };

export type PinEvent =
  | { type: "open_with_saved"; latitude: number; longitude: number } // saved profile coordinate
  | { type: "gps_fix" } // GPS arrived — viewport only
  | { type: "user_place"; latitude: number; longitude: number } // tap or drag end
  | { type: "centroid"; latitude: number; longitude: number }; // selection-driven reposition

export function pinReducer(state: PinState, event: PinEvent): PinState {
  switch (event.type) {
    case "open_with_saved":
      return {
        placement: "derived",
        pin: { latitude: event.latitude, longitude: event.longitude },
      };

    case "gps_fix":
      // GPS can never mutate pin state — the invariant this event exists to test.
      return state;

    case "user_place":
      return {
        placement: "user_placed",
        pin: { latitude: event.latitude, longitude: event.longitude },
      };

    case "centroid":
      // Never silently overwrite a deliberate placement.
      if (state.placement === "user_placed") return state;
      return {
        placement: "derived",
        pin: { latitude: event.latitude, longitude: event.longitude },
      };

    default:
      return state;
  }
}
