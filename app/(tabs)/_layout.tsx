import { router, Tabs } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppStore } from "@/store/store";
import { Constants } from "@/utils/constants";

import { HapticTab } from "@/components/haptic-tab";
import MaintenanceBanner from "@/components/ui/MaintenanceBanner";
import TabBarBackground from "@/components/ui/TabBarBackground";
import TabBarIcon from "@/components/ui/TabBarIcon";

/**
 * The bar itself — indicator pills, labels, and their breathing room. The
 * system navigation inset is added on top of this so the bar never shrinks.
 */
const TAB_BAR_HEIGHT = 68;
const TAB_BAR_PADDING = 6;

export default function TabLayout() {
  // Android is edge-to-edge from SDK 54 onward, so the app draws underneath the
  // gesture pill / 3-button nav. iOS has the same problem with the home
  // indicator once the bar is absolutely positioned. Reserving the inset keeps
  // the labels clear of both and lets the bar's own white extend behind them.
  const insets = useSafeAreaInsets();
  // Every screen under this navigator renders `user`. checkAuth() in the root
  // layout resolves the session *after* first paint, and signOut() nulls the
  // user before the caller's replace() lands — so without this gate the tabs
  // paint at least one frame against a null user. That frame is what testers
  // reported as a guest account appearing and then bouncing to login.
  //
  // This is a hold, not a redirect: the root layout owns routing and will send
  // an unauthenticated user to /login on its own. Holding here only prevents
  // the half-rendered frame in between.
  const user = useAppStore((state) => state.user);
  const token = useAppStore((state) => state.token);

  // The global 401 boundary (setUnauthorizedHandler in store/store.ts) calls
  // signOut() but does not navigate — it has no router. Before the gate above
  // existed, the tabs just re-rendered with a null user; now they would hold on
  // the spinner forever. No user and no token means the session is genuinely
  // gone, so this is the one case the gate has to route out of itself.
  useEffect(() => {
    if (!user && !token) router.replace("/login");
  }, [user, token]);

  if (!user) {
    return (
      <View style={styles.gate}>
        <ActivityIndicator size="large" color={Constants.appThemeColor} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* <MaintenanceBanner /> */}
      <Tabs
      screenOptions={{
        // The indicator pill carries the brand and the active state, so the
        // label is free to be legible: appThemeColor reads 3.10:1 on white,
        // which clears the bar for a glyph but not for 11pt text.
        tabBarActiveTintColor: "#333333",
        // #999999 read 2.85:1 on white — under the 4.5:1 floor for an 11pt
        // label. This is the muted text color the rest of the app uses.
        tabBarInactiveTintColor: "#4a5568",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 4,
        },
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: "#E0E0E0",
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: TAB_BAR_PADDING + insets.bottom,
          paddingTop: TAB_BAR_PADDING,
          ...Platform.select({
            ios: {
              position: "absolute",
            },
            default: {},
          }),
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name="home-outline"
              activeName="home"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="share"
        options={{
          title: "Refer",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name="share-outline"
              activeName="share"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: "Store",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name="storefront-outline"
              activeName="storefront"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name="person-outline"
              activeName="person"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      {/* Reachable by route but not by a tab button: href: null keeps them out
          of the bar while still rendering them inside the tab navigator, so
          the bar stays visible and tapping a tab from here switches properly. */}
      <Tabs.Screen name="redeem" options={{ href: null }} />
      <Tabs.Screen name="deals" options={{ href: null }} />
      <Tabs.Screen name="collections" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
});
