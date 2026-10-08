import Navbar from "@/components/ui/navbar";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import { isDemoCollectionsUser } from "@/constants/demoAccounts";
import {
  PICKUPS_COMPLETED_COUNT,
  TOTAL_WASTE_KG,
} from "@/constants/mockCollectionsData";
import { useDebouncedNavigation } from "@/hooks/useDebouncedNavigation";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { useAppStore } from "@/store/store";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { alertOnce } from "@/utils/alert";
import { buildLabel } from "@/utils/buildInfo";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const ProfileScreen = () => {
  const { signOut, deleteAccount, user, getProfile } = useAppStore();

  // The same data the screen loads on mount, fetched again on a pull. Deals
  // were fetched here only to count them in a stat that no longer exists; the
  // Deals tab loads its own.
  const refreshAll = React.useCallback(async () => {
    await getProfile();
  }, [getProfile]);
  const { refreshing, onRefresh } = usePullToRefresh(refreshAll);
  // 0 on Android, where the tab bar sits in the layout flow; on iOS the bar is
  // absolutely positioned, so the scroll has to clear it by its full height.
  const tabBarOverflow = useBottomTabOverflow();
  // Demo-only: allowlisted accounts get the mock pickup history behind these
  // rows. Everyone else keeps today's behavior (plain rows → empty state).
  const showDemoCollections = isDemoCollectionsUser(user?.email);
  const navigateOnce = useDebouncedNavigation();

  // Navigate first, sign out second. signOut() sets `user` to null, and this
  // screen renders `user` — leaving it mounted while null flashed a "Guest
  // User" header for a frame before the replace landed. replace() commits
  // synchronously, so by the time the store clears, this screen is gone.
  const leaveForLogin = async () => {
    router.replace("/login");
    await signOut();
  };

  // useSingleFlight wraps the *work*, not the dialog: alertOnce already stops
  // the dialog from stacking, but the confirm button inside it is a second,
  // independent double-tap surface.
  const { run: confirmLogout, inFlight: loggingOut } = useSingleFlight(leaveForLogin);

  const { run: confirmDelete, inFlight: deleting } = useSingleFlight(async () => {
    const result = await deleteAccount();
    if (result.Status === "Success") {
      /*
       * Leave first, then say so.
       *
       * Deleting answered with silence: the login screen simply appeared, which
       * is the same thing the app does when a session expires, so there was no
       * way to tell "we removed your account" from "something logged you out".
       *
       * The order matters. Confirming first and navigating from the button
       * would strand anyone who dismisses the dialog with the Android back
       * button — no button fires, and they would sit on a profile belonging to
       * an account that no longer exists. Navigating first makes leaving
       * unconditional, and the alert is native so it shows over the login
       * screen regardless.
       */
      await leaveForLogin();
      alertOnce(
        "Account deleted",
        "Your account and everything in it have been removed. We're sorry to see you go.",
      );
    } else {
      alertOnce("Error", result.ErrorMessage || "Account deletion failed. Please try again.");
    }
  });

  const busy = loggingOut || deleting;

  const handleLogout = () => {
    alertOnce("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => confirmLogout(),
      },
    ]);
  };

  const handleDeleteAccount = () => {
    alertOnce(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          // The failure branch raises its own alert. alertOnce releases its
          // latch in this handler before the async work resolves, so that
          // second alert is not blocked by this one.
          onPress: () => confirmDelete(),
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      {/* Header with glassmorphism effect */}
      <Navbar user={user} />

      {/*
        Points, Rewards and Eco Actions were here and are gone.
        
        Points is the first card on the home tab, and a number shown twice is
        a number that can disagree with itself. "Rewards" counted the deals
        catalogue — how many offers exist, not how many this person has taken —
        so it read the same for everybody. "Eco Actions" called `.length` on
        `totalCollections`, which is TEXT: it was counting characters, so a
        household with 12 collections scored 2.
      */}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5d7481" />
        }
      >
        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push("/editProfile")}
              activeOpacity={0.7}
            >
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Edit Profile</Text>
              </View>

              <Ionicons name="chevron-forward" size={20} color="#999999" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push("/deals")}
              activeOpacity={0.7}
            >
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>My Deals</Text>
              </View>

              <Ionicons name="chevron-forward" size={20} color="#999999" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push("/(tabs)/share")}
              activeOpacity={0.7}
            >
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Invite Friends</Text>
              </View>

              <Ionicons name="chevron-forward" size={20} color="#999999" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Activity Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Summary</Text>
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() =>
                navigateOnce(() =>
                  router.push(
                    showDemoCollections ? "/collections?section=past" : "/collections",
                  ),
                )
              }
              activeOpacity={0.7}
            >
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Waste Collected</Text>
              </View>

              {showDemoCollections && (
                <Text style={styles.menuValue}>{TOTAL_WASTE_KG}kg</Text>
              )}
              <Ionicons name="chevron-forward" size={20} color="#999999" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() =>
                navigateOnce(() =>
                  router.push(
                    showDemoCollections ? "/collections?section=past" : "/collections",
                  ),
                )
              }
              activeOpacity={0.7}
            >
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Pickups Completed</Text>
              </View>

              {showDemoCollections && (
                <Text style={styles.menuValue}>{PICKUPS_COMPLETED_COUNT}</Text>
              )}
              <Ionicons name="chevron-forward" size={20} color="#999999" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() =>
                navigateOnce(() =>
                  router.push(
                    showDemoCollections ? "/collections?section=rewards" : "/collections",
                  ),
                )
              }
              activeOpacity={0.7}
            >
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Rewards Redeemed</Text>
              </View>

              <Ionicons name="chevron-forward" size={20} color="#999999" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.logoutButton, busy && styles.actionButtonBusy]}
              onPress={handleLogout}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteButton, busy && styles.actionButtonBusy]}
              onPress={handleDeleteAccount}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={styles.deleteButtonText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/*
          Which build this is. A remote tester can read this line out and we
          know whether a fix reached them, instead of guessing from whether
          the symptom is still there.
        */}
        <Text style={styles.buildLabel}>{buildLabel()}</Text>

        {/* Bottom spacing for tab bar */}
        <View style={[styles.bottomSpacing, { height: 50 + tabBarOverflow }]} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333333",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  menuContainer: {
    backgroundColor: "#ffffff",
    marginHorizontal: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f8f8f8",
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 14,
    color: "#666666",
  },
  menuValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#00528A",
    marginRight: 8,
  },
  actionButtons: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  actionButtonBusy: {
    opacity: 0.5,
  },
  buildLabel: {
    textAlign: "center",
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: "#00528A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  logoutButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButton: {
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FF5252",
  },
  deleteButtonText: {
    color: "#FF5252",
    fontSize: 16,
    fontWeight: "600",
  },
  bottomSpacing: {
    height: 50,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    zIndex: 10,
  },
  headerGradient: {
    borderRadius: 20,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerSection: {
    backgroundColor: "#ffffff",
  },
});

export default ProfileScreen;
