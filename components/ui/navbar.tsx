import { User } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Navbar = ({ user }: { user: User | null }) => {
  // Android draws edge-to-edge, so the status bar clearance has to come from
  // the real inset rather than a fixed guess that only fits one device.
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.headerSection}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.userInfo}>
          <Image
            source={require("../../assets/images/logo-fixed.png")} // User avatar placeholder
            style={styles.avatar}
          />
          <View style={styles.userDetails}>
            <Text style={styles.welcomeText}>Welcome,</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {user ? `${user.userName}`.trim() : "Guest User"}
            </Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.push("/notifications")}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              activeOpacity={0.7}
            >
              <Ionicons name="notifications-outline" size={24} color="#333333" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default Navbar;

const styles = StyleSheet.create({
  headerSection: {
    backgroundColor: "#ffffff",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    zIndex: 10,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 14,
    opacity: 0.9,
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    marginLeft: 15,
    borderColor: "#b1b1b1ff",
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
