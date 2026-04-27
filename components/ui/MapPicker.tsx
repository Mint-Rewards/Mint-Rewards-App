import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
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

interface MapPickerProps {
  visible: boolean;
  initialLatitude?: string;
  initialLongitude?: string;
  onConfirm: (latitude: string, longitude: string) => void;
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
  onConfirm,
  onClose,
}: MapPickerProps) {
  const [pin, setPin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!visible) return;

    const parsedLat = parseFloat(initialLatitude ?? "");
    const parsedLng = parseFloat(initialLongitude ?? "");

    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      setPin({ latitude: parsedLat, longitude: parsedLng });
    } else {
      requestAndCenter();
    }
  }, [visible]);

  const requestAndCenter = async () => {
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
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setPin(coords);
      mapRef.current?.animateToRegion(
        { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        600
      );
    } catch {
      // stay centered on Pakistan default
    } finally {
      setLocating(false);
    }
  };

  const handleConfirm = () => {
    if (!pin) return;
    onConfirm(pin.latitude.toFixed(7), pin.longitude.toFixed(7));
    onClose();
  };

  const initialRegion = (() => {
    const lat = parseFloat(initialLatitude ?? "");
    const lng = parseFloat(initialLongitude ?? "");
    if (!isNaN(lat) && !isNaN(lng)) {
      return { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    }
    return PAKISTAN_CENTER;
  })();

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
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
            onPress={(e) => setPin(e.nativeEvent.coordinate)}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {pin && (
              <Marker
                coordinate={pin}
                draggable
                onDragEnd={(e) => setPin(e.nativeEvent.coordinate)}
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
          {pin ? (
            <Text style={styles.coords}>
              {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.noPin}>No pin placed yet</Text>
          )}
          <TouchableOpacity
            style={[styles.confirmBtn, !pin && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!pin}
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
