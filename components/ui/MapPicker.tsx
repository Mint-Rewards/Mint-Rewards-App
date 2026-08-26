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
import MapView, { Marker } from "react-native-maps";
import { resolveSelectionViewport } from "@/utils/locationForm";
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
  onConfirm: (
    latitude: string,
    longitude: string,
    placement?: PinPlacement
  ) => void;
  onClose: () => void;
}

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
  const [locating, setLocating] = useState(false);
  // Tracks whether a GPS fix has centered the camera this session with no
  // pin placed yet, so the footer can nudge the user toward placing one.
  const [gpsCentered, setGpsCentered] = useState(false);
  const mapRef = useRef<MapView>(null);
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
    () => resolveSelectionViewport(city, town),
    [city, town],
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
  const requestAndCenter = async (): Promise<boolean> => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Needed",
          "Allow location access so we can center the map on your position. You can still tap the map to place your pin anywhere.",
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
      // GPS is viewport only: it may recenter the camera, it must never
      // place or move the pin. `gps_fix` is a documented no-op.
      dispatch({ type: "gps_fix" });
      setGpsCentered(true);
      // Only advances the step — a pin already placed is further along, and a
      // GPS re-center after it must not walk the funnel backwards.
      if (lastStepRef.current === "map_opened") lastStepRef.current = "gps_centered";
      mapRef.current?.animateToRegion(
        { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
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
   */
  const handleUserPlace = (coordinate: {
    latitude: number;
    longitude: number;
  }) => {
    dispatch({ type: "user_place", ...coordinate });
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
    if (!state.pin) return;
    confirmedRef.current = true;
    onConfirm(
      state.pin.latitude.toFixed(7),
      state.pin.longitude.toFixed(7),
      state.placement
    );
    onClose();
  };

  const initialRegion = (() => {
    const lat = parseFloat(initialLatitude ?? "");
    const lng = parseFloat(initialLongitude ?? "");
    if (!isNaN(lat) && !isNaN(lng)) {
      return { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
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
          Tap the map or drag the pin to set your exact location
        </Text>

        {/* Map */}
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            onPress={(e) => handleUserPlace(e.nativeEvent.coordinate)}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {state.pin && (
              <Marker
                coordinate={state.pin}
                draggable
                onDragEnd={(e) => handleUserPlace(e.nativeEvent.coordinate)}
                pinColor="#00528A"
              />
            )}
          </MapView>

          {/* GPS re-center button */}
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={requestAndCenter}
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
        <View style={styles.footer}>
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
            disabled={!state.pin}
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
