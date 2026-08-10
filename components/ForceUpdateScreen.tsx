import React from "react";
import {
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Constants } from "@/utils/constants";

interface ForceUpdateScreenProps {
  /** Resolved for the current platform by UpdateGate. Never empty. */
  storeUrl: string;
  onOpenStoreFailed?: (error: unknown) => void;
}

/**
 * Full-screen, non-dismissible "you must update" state.
 *
 * Visual shell is a deliberate copy of app/index.tsx (teal header with 25px
 * bottom radii over a white body, dark status bar): that is the first thing
 * every user sees at launch, so reusing it makes the gate read as the launch
 * sequence continuing rather than as an unfamiliar screen appearing over the
 * app. The dark StatusBar is pinned for the same reason app/_layout.tsx pins
 * it — "auto" resolves to light glyphs in dark mode and vanishes against these
 * hardcoded-white screens.
 *
 * There is intentionally no skip, dismiss or "later" affordance, and the
 * Android hardware back button is swallowed by UpdateGate while this is
 * mounted. If the binary is below the supported floor there is nothing useful
 * behind this screen.
 */
export default function ForceUpdateScreen({
  storeUrl,
  onOpenStoreFailed,
}: ForceUpdateScreenProps) {
  const handleUpdate = async () => {
    try {
      await Linking.openURL(storeUrl);
    } catch (error) {
      // Leave the screen up. The user is still on an unsupported binary, and
      // the store link failing is not a reason to let them through.
      onOpenStoreFailed?.(error);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.headerSection}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Mint Rewards</Text>
          <Text style={styles.welcomeSubtitle}>
            {Platform.OS === "ios" ? "App Store" : "Google Play"} update
            required
          </Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={styles.body}>
          <Image
            source={require("@/assets/images/logo-fixed.png")}
            style={styles.appIcon}
            resizeMode="contain"
          />

          <Text style={styles.eyebrow}>NEW UPDATE IS AVAILABLE</Text>

          <Text style={styles.title}>
            Update your app to the latest version
          </Text>

          <Text style={styles.copy}>
            This version of Mint Rewards is no longer supported. Update to keep
            earning points, viewing your deals and redeeming rewards.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleUpdate}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Update Mint Rewards"
          testID="force-update-button"
        >
          <Text style={styles.primaryButtonText}>Update</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  headerSection: {
    backgroundColor: Constants.appThemeColor,
    paddingTop: 100, // For status bar — matches app/index.tsx
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  welcomeSection: {
    marginTop: 10,
  },
  welcomeTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },
  welcomeSubtitle: {
    color: "#ffffff",
    fontSize: 16,
    lineHeight: 22,
    opacity: 0.9,
  },
  contentSection: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appIcon: {
    width: 96,
    height: 96,
    marginBottom: 28,
  },
  eyebrow: {
    color: Constants.appThemeColor,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 12,
    textAlign: "center",
  },
  title: {
    color: "#333333",
    fontSize: 24,
    fontWeight: "bold",
    lineHeight: 32,
    textAlign: "center",
    marginBottom: 14,
  },
  copy: {
    color: "#666666",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  primaryButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: Constants.appThemeColor,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
