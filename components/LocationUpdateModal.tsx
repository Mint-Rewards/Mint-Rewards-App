import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  onLater: () => void;
  onUpdate: () => void;
  /**
   * Whether this user will ALSO be asked for a map pin when they save.
   *
   * The prompt exists because their area was retired, so its copy talks about
   * areas. A user who has never saved a coordinate is additionally stopped by
   * the pin requirement — telling them here is cheaper than letting the form
   * surprise them after they have already started.
   */
  alsoNeedsPin?: boolean;
};

const LocationUpdateModal = ({
  visible,
  onLater,
  onUpdate,
  alsoNeedsPin = false,
}: Props) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onLater}
  >
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="location-outline" size={28} color="#449EB2" />
        </View>

        <Text style={styles.title}>Update your location</Text>
        <Text style={styles.message}>
          We&apos;ve updated our area list to be more accurate. Please re-select
          your town and area.
          {alsoNeedsPin
            ? " You'll also need to pin your exact location on the map."
            : ""}
        </Text>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.laterBtn}
            onPress={onLater}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.laterText}>Later</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.updateBtn}
            onPress={onUpdate}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.updateText}>Update now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E6F4F7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  laterBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#ddd",
    alignItems: "center",
  },
  laterText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
  },
  updateBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#449EB2",
    alignItems: "center",
  },
  updateText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});

export default LocationUpdateModal;
