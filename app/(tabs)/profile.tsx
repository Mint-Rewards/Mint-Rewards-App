import Navbar from "@/components/ui/navbar";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import { isDemoCollectionsUser } from "@/constants/demoAccounts";
import {
  PICKUPS_COMPLETED_COUNT,
  TOTAL_POINTS_EARNED,
  TOTAL_WASTE_KG,
} from "@/constants/mockCollectionsData";
import { useDebouncedNavigation } from "@/hooks/useDebouncedNavigation";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { useAppStore } from "@/store/store";
import { alertOnce } from "@/utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const ProfileScreen = () => {
  const { signOut, deleteAccount, user, deals, getDeals } = useAppStore();

  // The "Rewards" stat used to read `campaigns`, which nothing ever populated,
  // so it always rendered 0. Fetch the deals it now counts.
  useEffect(() => {
    getDeals();
  }, [getDeals]);
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
      await leaveForLogin();
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

      {/* Simple Profile Stats */}
      <View style={styles.profileSection}>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {showDemoCollections ? TOTAL_POINTS_EARNED : user?.points || 0}
            </Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{deals.length}</Text>
            <Text style={styles.statLabel}>Rewards</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {user?.totalCollections?.length}
            </Text>
            <Text style={styles.statLabel}>Eco Actions</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
  profileSection: {
    alignItems: "center",
    marginTop: -20,
    marginBottom: 20,
    marginHorizontal: 20,
    zIndex: 5,
  },
  statsContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#e0e0e0",
    marginHorizontal: 10,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#00528A",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: "#666666",
    fontWeight: "500",
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
