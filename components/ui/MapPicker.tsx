import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isFixWithinCity, resolveSelectionViewport } from "@/utils/locationForm";
import {
  FlowStep,
  trackFlowAbandoned,
  trackMapOpened,
  trackPinInteracted,
} from "@/utils/locationAnalytics";
import {
  initialPinState,
  pinReducer,
  PinEvent,
  PinPlacement,
  PinState,
} from "@/utils/pinState";

interface MapPickerProps {
  visible: boolean;
  initialLatitude?: string;
  initialLongitude?: string;
  /**
   * The city and town already chosen on the form. Used ONLY to pick a sensible
   * opening camera position when there is no saved pin — never to place one.
   */
  city?: string;
  town?: string;
  /** Widest fallback rung: used when no city has been chosen yet. */
  province?: string;
  onConfirm: (
    latitude: string,
    longitude: string,
    placement?: PinPlacement
  ) => void;
  onClose: () => void;
}

/**
 * How far in the map must be before a tap can honestly be called a building.
 *
 * latitudeDelta is the visible span in degrees; 0.004 is roughly 440m across
 * the screen, which is about zoom 17 — the point at which individual roofs are
 * distinguishable. The picker used to open at 0.01, a 1.1km span, and record
 * every tap at that scale as a verified rooftop. Neither Apple nor Google
 * draws building footprints that far out, so the user was aiming at nothing.
 */
const BUILDING_VISIBLE_DELTA = 0.004;

/** What the picker opens at when it knows where to look. */
const CLOSE_DELTA = 0.002;

const PAKISTAN_CENTER = {
  latitude: 30.3753,
  longitude: 69.3451,
  latitudeDelta: 15,
  longitudeDelta: 15,
};

export default function MapPicker({
  visible,
  initialLatitude,
  initialLongitude,
  city,
  town,
  province,
  onConfirm,
  onClose,
}: MapPickerProps) {
  // Local wrapper around the pure pinReducer: adds a component-lifecycle
  // "reset" action so reopening the modal without a saved coordinate starts
  // clean, without teaching the pure (unit-tested) reducer about remounts.
  type LocalPinAction = PinEvent | { type: "reset" };
  const localPinReducer = (state: PinState, action: LocalPinAction): PinState =>
    action.type === "reset" ? initialPinState : pinReducer(state, action);

  const [state, dispatch] = useReducer(localPinReducer, initialPinState);
  const insets = useSafeAreaInsets();
  const [locating, setLocating] = useState(false);
  // Tracks whether a GPS fix has centered the camera this session with no
  // pin placed yet, so the footer can nudge the user toward placing one.
  const [gpsCentered, setGpsCentered] = useState(false);
  const mapRef = useRef<MapView>(null);

  // What the camera opens at, before it has reported anything. A saved pin
  // opens close; anything else — a city centroid, the country — is assumed too
  // far out, which is both true and the safe way to be wrong: the banner says
  // "zoom in" until the map says otherwise, rather than the reverse.
  const openingDelta =
    !Number.isNaN(parseFloat(initialLatitude ?? "")) &&
    !Number.isNaN(parseFloat(initialLongitude ?? ""))
      ? CLOSE_DELTA
      : PAKISTAN_CENTER.latitudeDelta;

  // Kept in both: a ref so a tap reads it synchronously, and state so the
  // guidance banner re-renders as the user pinches.
  // Where the camera is pointing, gesture or not, so Confirm has a
  // coordinate even from a user who never moved the map.
  const centreRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const zoomDeltaRef = useRef<number>(openingDelta);
  const [tooFarOut, setTooFarOut] = useState(openingDelta > BUILDING_VISIBLE_DELTA);
  // Analytics bookkeeping. Refs, not state: nothing renders from these, and
  // `flow_abandoned` must read the CURRENT step from inside a close handler
  // that would otherwise close over a stale render's value.
  const pinInteractionsRef = useRef(0);
  const lastStepRef = useRef<FlowStep>("map_opened");
  // A confirmed pin is not an abandoned flow. Set by handleConfirm, which
  // calls onClose itself.
  const confirmedRef = useRef(false);

  // Resolved once per selection, and read from BOTH the opening camera and the
  // analytics call so the two cannot disagree about where the map opened.
  const selectionViewport = useMemo(
    () => resolveSelectionViewport(city, town, province),
    [city, town, province],
  );

  useEffect(() => {
    if (!visible) return;

    setGpsCentered(false);
    pinInteractionsRef.current = 0;
    lastStepRef.current = "map_opened";
    confirmedRef.current = false;

    const parsedLat = parseFloat(initialLatitude ?? "");
    const parsedLng = parseFloat(initialLongitude ?? "");

    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      dispatch({ type: "open_with_saved", latitude: parsedLat, longitude: parsedLng });
      trackMapOpened("saved_pin");
    } else {
      dispatch({ type: "reset" });
      // Reported once the initial centering SETTLES, not here: without a saved
      // coordinate the camera starts on wherever `initialRegion` put it and
      // only becomes `device_gps` if a fix actually arrives. Counting the
      // attempt would hide every permission denial.
      //
      // When GPS does not arrive, the reported value is what the camera is
      // actually showing — the registry centroid if one was found, `default`
      // (the whole country) if not. Reporting `default` for both would make the
      // fix for P2-6 invisible in exactly the funnel built to measure it.
      requestAndCenter().then((centered) =>
        trackMapOpened(
          centered ? "device_gps" : (selectionViewport?.source ?? "default"),
        ),
      );
    }
  }, [visible]);

  /** Resolves true when a GPS fix actually recentered the camera. */
  const requestAndCenter = async (placePin = false): Promise<boolean> => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Needed",
          "Allow location access so we can center the map on your position. You can still move the map yourself to place the pin.",
          [{ text: "OK" }]
        );
        setLocating(false);
        return false;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      // A fix that is nowhere near the city the user picked must NOT move the
      // camera. This used to be unconditional, and was right when it was
      // written: with no centroids the alternative was the whole of Pakistan,
      // which a fix anywhere on earth improved on. Now the map has already
      // opened on the selected city, and a distant fix makes it worse — it
      // describes where the phone is, not where the address being entered is.
      // The case that surfaced it is the everyday one: an iOS Simulator
      // reports Apple HQ, so the camera flew from Karachi to California on
      // every open. A relative's address or a trip does the same thing to a
      // real user.
      //
      // Rejected here rather than in the reducer because it is a VIEWPORT
      // judgement, and the reducer deliberately knows nothing about cities.
      if (!isFixWithinCity(coords.latitude, coords.longitude, city)) {
        // Reported as the centroid, not `device_gps` — the camera is showing
        // the centroid, and the funnel must say what is on screen.
        return false;
      }

      // Opening the sheet is viewport only: a fix that arrives on its own may
      // recenter the camera and must never move the pin. `gps_fix` is a
      // documented no-op and stays one.
      //
      // Pressing the locate button is not that. It is the user saying "I am
      // here", which is a placement, and treating it as viewport-only is what
      // made them hunt for their own house after asking to be taken to it.
      if (placePin) {
        // Their real position, at the accuracy GPS gives: building precision
        // regardless of what the camera happens to be showing right now.
        dispatch({ type: "user_place", ...coords, coarse: false });
        lastStepRef.current = "pin_placed";
      } else {
        dispatch({ type: "gps_fix" });
      }
      setGpsCentered(true);
      // Only advances the step — a pin already placed is further along, and a
      // GPS re-center after it must not walk the funnel backwards.
      if (lastStepRef.current === "map_opened") lastStepRef.current = "gps_centered";
      mapRef.current?.animateToRegion(
        { ...coords, latitudeDelta: CLOSE_DELTA, longitudeDelta: CLOSE_DELTA },
        600
      );
      return true;
    } catch {
      // stay centered on Pakistan default
      return false;
    } finally {
      setLocating(false);
    }
  };

  /**
   * A deliberate placement: map tap or marker drag-end. Both are the same
   * event to the reducer and the same interaction to the funnel.
   *
   * The zoom at the moment of the tap decides what the pin may claim. Read
   * from a ref rather than state so a tap immediately after a pinch uses the
   * camera the user is actually looking at.
   */
  const handleUserPlace = (coordinate: {
    latitude: number;
    longitude: number;
  }) => {
    const coarse = zoomDeltaRef.current > BUILDING_VISIBLE_DELTA;
    dispatch({ type: "user_place", ...coordinate, coarse });
    pinInteractionsRef.current += 1;
    lastStepRef.current = "pin_placed";
    trackPinInteracted(pinInteractionsRef.current);
  };

  /**
   * Closing without confirming. Reports how far the user got, so the drop-off
   * can be told apart from a user who never got a map worth pinning.
   */
  const handleClose = () => {
    if (!confirmedRef.current) trackFlowAbandoned(lastStepRef.current);
    onClose();
  };

  const handleConfirm = () => {
    // The pin is whatever the crosshair is over. state.pin is authoritative
    // once they have moved the map; before that the camera may still be
    // sitting on a saved coordinate or a city centroid, and confirming that is
    // legitimate — it just keeps the weaker placement it came with, so it is
    // not mistaken for a rooftop they chose.
    const pin = state.pin ?? centreRef.current;
    if (!pin) return;
    confirmedRef.current = true;
    onConfirm(pin.latitude.toFixed(7), pin.longitude.toFixed(7), state.placement);
    onClose();
  };

  const initialRegion = (() => {
    const lat = parseFloat(initialLatitude ?? "");
    const lng = parseFloat(initialLongitude ?? "");
    if (!isNaN(lat) && !isNaN(lng)) {
      return {
        latitude: lat,
        longitude: lng,
        latitudeDelta: CLOSE_DELTA,
        longitudeDelta: CLOSE_DELTA,
      };
    }
    // No saved pin. The form already knows their city and town, so open on that
    // rather than on the whole country — the view a user gets when GPS is
    // denied or fails. Still nullable: the sweep that sourced the centroids
    // rejected every name its providers disagreed about, and a free-text town
    // has no registry key at all.
    return selectionViewport?.region ?? PAKISTAN_CENTER;
  })();

  return (
    // `onRequestClose` is what the Android hardware back button fires. Without
    // it, back closes the picker without ever reaching `handleClose`, so
    // `flow_abandoned` never fires for that path and the funnel under-reports on
    // one platform only.
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pin Your Location</Text>
          <View style={styles.headerBtn} />
        </View>

        <Text style={styles.hint}>
          Move the map to put the pin on your rooftop
        </Text>

        {/* Map */}
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            /*
             * Imagery, not the street map.
             *
             * Vector building footprints are thin over much of Pakistan in
             * both Apple's and Google's basemaps, so a street map can show a
             * blank block where a house plainly is. Satellite shows the roof
             * the user is trying to point at, and "hybrid" keeps the road and
             * place labels on top so they can still find their street.
             */
            mapType="hybrid"
            /*
             * The pin does not move; the map does.
             *
             * Dragging a small marker with the thumb that is also holding the
             * phone means covering the very rooftop being aimed at, and a
             * mis-grab moves the map instead. Fixing the pin to the centre and
             * sliding the map under it is how every delivery app does this,
             * and it leaves the target visible the whole time.
             *
             * `details.isGesture` is what separates the user moving the map
             * from us animating it. Without that test, the camera settling
             * after open would record a placement the user never made, and a
             * derived centroid would be promoted to a deliberate pin.
             */
            onRegionChangeComplete={(region, details) => {
              zoomDeltaRef.current = region.latitudeDelta;
              setTooFarOut(region.latitudeDelta > BUILDING_VISIBLE_DELTA);
              centreRef.current = {
                latitude: region.latitude,
                longitude: region.longitude,
              };
              if (!details?.isGesture) return;
              handleUserPlace({
                latitude: region.latitude,
                longitude: region.longitude,
              });
            }}
            showsUserLocation
            showsMyLocationButton={false}
          />

          {/*
            The pin itself: an overlay at the exact centre, never a Marker.
            `pointerEvents="none"` so it cannot swallow a drag meant for the
            map underneath. Nudged up by half its height so the point sits on
            the centre rather than the middle of the teardrop.
          */}
          <View pointerEvents="none" style={styles.centrePin}>
            <Ionicons name="location" size={40} color="#00528A" />
          </View>

          {/*
            Says what the map can and cannot be used for at this zoom.
            Deliberately not a blocker: a user on a slow connection who cannot
            load close imagery still gets to save where they live, and the pin
            is recorded as `area` rather than being refused or, worse, recorded
            as a rooftop it never was.
          */}
          <View style={[styles.zoomHint, tooFarOut ? styles.zoomHintWarn : styles.zoomHintOk]}>
            <Ionicons
              name={tooFarOut ? "search-outline" : "checkmark-circle"}
              size={16}
              color={tooFarOut ? "#92400E" : "#065F46"}
            />
            <Text style={[styles.zoomHintText, { color: tooFarOut ? "#92400E" : "#065F46" }]}>
              {tooFarOut
                ? "Zoom in until you can see your roof, then tap it"
                : "Tap your rooftop to place the pin"}
            </Text>
          </View>

          {/* GPS re-center button */}
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={() => requestAndCenter(true)}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color="#00528A" />
            ) : (
              <Ionicons name="locate" size={22} color="#00528A" />
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
          {state.pin ? (
            <Text style={styles.coords}>
              {state.pin.latitude.toFixed(5)}, {state.pin.longitude.toFixed(5)}
            </Text>
          ) : (
            <>
              <Text style={styles.noPin}>No pin placed yet</Text>
              {gpsCentered && (
                <Text style={styles.hint}>
                  Drag the pin to your door — so the collector can find it
                </Text>
              )}
            </>
          )}
          <TouchableOpacity
            style={[styles.confirmBtn, !state.pin && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!state.pin && !centreRef.current}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.confirmBtnText}>Confirm Location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Centred by inset rather than by measuring the map: the map fills its
  // parent, so its centre is the parent's centre. marginTop lifts the glyph so
  // the POINT of the teardrop is what sits on the coordinate — centring the
  // icon itself would place the pin about 20px south of where it looks.
  centrePin: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  // Floats over the map rather than taking layout from it: the map is the
  // thing being used, and a banner that pushed it around would move the very
  // rooftop the user is aiming at.
  zoomHint: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  zoomHintWarn: { backgroundColor: "#FEF3C7" },
  zoomHintOk: { backgroundColor: "#D1FAE5" },
  zoomHintText: { flex: 1, fontSize: 13, fontWeight: "600" },

  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 54 : 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#2d3748",
  },
  hint: {
    textAlign: "center",
    fontSize: 13,
    color: "#718096",
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#f7fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  gpsBtn: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  footer: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    gap: 10,
  },
  coords: {
    textAlign: "center",
    fontSize: 13,
    color: "#718096",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  noPin: {
    textAlign: "center",
    fontSize: 13,
    color: "#a0aec0",
  },
  confirmBtn: {
    backgroundColor: "#00528A",
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmBtnDisabled: {
    backgroundColor: "#a0aec0",
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
