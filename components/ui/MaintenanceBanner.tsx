import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function MaintenanceBanner() {
  return (
    <View style={styles.banner}>
      <Ionicons name="construct-outline" size={16} color="#ffffff" style={styles.icon} />
      <Text style={styles.text}>
        We're currently under maintenance. Some features may be unavailable.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#D97706",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  icon: {
    marginRight: 8,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
});
