import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type BannerTone = "lockout" | "rateLimited";

interface OtpStatusBannerProps {
  tone: BannerTone;
  message: string;
}

const TONE_STYLES: Record<BannerTone, { bg: string; border: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  lockout: { bg: "#FFF4E5", border: "#F5D9A8", text: "#8A5A15", icon: "alert-circle-outline" },
  rateLimited: { bg: "#F1F3F5", border: "#DDE1E4", text: "#495057", icon: "time-outline" },
};

const OtpStatusBanner = ({ tone, message }: OtpStatusBannerProps) => {
  const palette = TONE_STYLES[tone];
  return (
    <View
      style={[styles.container, { backgroundColor: palette.bg, borderColor: palette.border }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={palette.icon} size={18} color={palette.text} style={styles.icon} />
      <Text style={[styles.text, { color: palette.text }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  icon: {
    marginRight: 8,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
  },
});

export default OtpStatusBanner;
