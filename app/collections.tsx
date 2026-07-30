import Navbar from "@/components/ui/navbar";
import { isDemoCollectionsUser } from "@/constants/demoAccounts";
import {
  PICKUPS_COMPLETED_COUNT,
  TOTAL_BAGS_COUNT,
  TOTAL_WASTE_KG,
  formatCollectionDate,
  pastPickupsForUser,
  pickupStatusLabel,
  pickupWeightKg,
  upcomingCollectionsForUser,
  upcomingStatusLabel,
} from "@/constants/mockCollectionsData";
import { User, useAppStore } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type SectionKey = "past" | "upcoming";

const CollectionsScreen = () => {
  const { user } = useAppStore();
  const { section } = useLocalSearchParams<{ section?: string }>();

  // There is no redemptions data to show for anyone, so this section is an
  // explicit empty state regardless of the allowlist. Only allowlisted users
  // ever reach it — profile.tsx keeps routing everyone else to plain
  // /collections.
  if (section === "rewards") {
    return (
      <EmptyCollectionsState
        user={user}
        icon="gift-outline"
        title="No Rewards Redeemed Yet"
        subtitle="You haven't redeemed any rewards yet."
        description="Collect recyclable waste to earn points, then redeem them for coupons from our partner brands."
      />
    );
  }

  // Demo content is scoped to a small allowlist of accounts. Everyone else
  // gets the original empty state, untouched.
  if (!isDemoCollectionsUser(user?.email)) {
    return <EmptyCollectionsState user={user} />;
  }

  return (
    <DemoCollectionsScreen
      user={user}
      initialSection={section === "upcoming" ? "upcoming" : "past"}
    />
  );
};

const EmptyCollectionsState = ({
  user,
  icon = "albums-outline",
  title = "No Collections Found",
  subtitle = "You haven't started any collections yet.",
  description = "Start exploring and collecting items to build your first collection!",
}: {
  user: User | null;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  title?: string;
  subtitle?: string;
  description?: string;
}) => {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Navbar user={user} />

      {/* Main Content */}
      <View style={styles.content}>
        <View style={styles.emptyStateContainer}>
          {/* Illustration */}
          <View style={styles.illustrationContainer}>
            <LinearGradient
              colors={["#f8f9fa", "#e9ecef"]}
              style={styles.illustrationBackground}
            >
              <Ionicons name={icon} size={80} color="#00528A" />
            </LinearGradient>

            {/* Decorative elements */}
            <View style={styles.sparkleContainer}>
              <Ionicons
                name="bookmark"
                size={16}
                color="#FFD700"
                style={styles.sparkle1}
              />
              <Ionicons
                name="heart"
                size={12}
                color="#FF69B4"
                style={styles.sparkle2}
              />
              <Ionicons
                name="star"
                size={14}
                color="#00CED1"
                style={styles.sparkle3}
              />
            </View>
          </View>

          {/* Text Content */}
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push("/(tabs)/home")}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#00528A", "#00528A"]}
                style={styles.gradientButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="search" size={20} color="#ffffff" />
                <Text style={styles.primaryButtonText}>Explore Items</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push("/(tabs)/profile")}
              activeOpacity={0.8}
            >
              <Ionicons name="person-outline" size={20} color="#00528A" />
              <Text style={styles.secondaryButtonText}>View Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const DemoCollectionsScreen = ({
  user,
  initialSection,
}: {
  user: User | null;
  initialSection: SectionKey;
}) => {
  const [activeSection, setActiveSection] = React.useState<SectionKey>(initialSection);
  // Every row is placed in this user's own town/city, resolved once here.
  const pastPickups = React.useMemo(() => pastPickupsForUser(user), [user]);
  const upcomingCollections = React.useMemo(
    () => upcomingCollectionsForUser(user),
    [user],
  );
  // Held in the store, not local state: the schedule has to outlive this screen
  // so the home tab's Upcoming Collections card can show it too, and it is
  // persisted per-user in SecureStore so it survives logout and restarts.
  // A single value because a user gets exactly one pickup.
  const {
    scheduledCollection: scheduled,
    scheduleCollection,
    loadScheduledCollection,
  } = useAppStore();

  // Reachable without passing through home, so hydrate here too.
  React.useEffect(() => {
    loadScheduledCollection();
  }, [loadScheduledCollection, user?._id]);
  // Which slot is highlighted before the user commits to it. Local, because an
  // uncommitted highlight is throwaway UI state.
  const [pickedSlotIds, setPickedSlotIds] = React.useState<Record<string, string>>({});

  const pickSlot = (collectionId: string, slotId: string) => {
    setPickedSlotIds((prev) => ({ ...prev, [collectionId]: slotId }));
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Navbar user={user} />

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{TOTAL_WASTE_KG}kg</Text>
          <Text style={styles.summaryLabel}>Waste Collected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{PICKUPS_COMPLETED_COUNT}</Text>
          <Text style={styles.summaryLabel}>Pickups Completed</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{TOTAL_BAGS_COUNT}</Text>
          <Text style={styles.summaryLabel}>Bags</Text>
        </View>
      </View>

      {/* Section switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeSection === "past" && styles.tabActive]}
          onPress={() => setActiveSection("past")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeSection === "past" && styles.tabTextActive]}>
            Past Pickups
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeSection === "upcoming" && styles.tabActive]}
          onPress={() => setActiveSection("upcoming")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeSection === "upcoming" && styles.tabTextActive]}>
            Upcoming Collections
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {activeSection === "past"
          ? pastPickups.map((pickup) => {
              const completed = pickup.status === "COMPLETED";
              return (
                <View key={pickup.id} style={styles.rowCard}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowDate}>{formatCollectionDate(pickup.date)}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        completed ? styles.statusBadgeCompleted : styles.statusBadgePending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          completed
                            ? styles.statusBadgeTextCompleted
                            : styles.statusBadgeTextPending,
                        ]}
                      >
                        {pickupStatusLabel(pickup.status)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.rowTitle}>{pickup.code}</Text>

                  {!!pickup.area && (
                    <View style={styles.rowMeta}>
                      <Ionicons name="location-outline" size={14} color="#718096" />
                      <Text style={styles.rowMetaText}>
                        {pickup.area}, {pickup.city}
                      </Text>
                    </View>
                  )}

                  <View style={styles.rowMeta}>
                    <Ionicons name="cube-outline" size={14} color="#718096" />
                    <Text style={styles.rowMetaText}>
                      {pickupWeightKg(pickup)}kg across {pickup.bags.length}{" "}
                      {pickup.bags.length === 1 ? "bag" : "bags"}
                    </Text>
                  </View>

                  {!!pickup.comment && (
                    <Text style={styles.rowComment}>{pickup.comment}</Text>
                  )}
                </View>
              );
            })
          : upcomingCollections.map((collection) => {
              const joined =
                scheduled?.collectionId === collection.id ? scheduled : undefined;
              // Some other collection already holds this session's one schedule.
              const lockedByOther = !!scheduled && !joined;
              const pickedSlotId = pickedSlotIds[collection.id];
              const bookedSlot = joined
                ? collection.slots.find((slot) => slot.id === joined.slotId)
                : undefined;

              return (
                <View key={collection.id} style={styles.rowCard}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.rowTitle, styles.rowTitleInline]}>
                      {collection.code}
                    </Text>
                    {!!joined && (
                      <View style={[styles.statusBadge, styles.statusBadgeScheduled]}>
                        <Text
                          style={[
                            styles.statusBadgeText,
                            styles.statusBadgeTextScheduled,
                          ]}
                        >
                          {upcomingStatusLabel(joined.status)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {!!collection.area && (
                    <View style={styles.rowMeta}>
                      <Ionicons name="location-outline" size={14} color="#718096" />
                      <Text style={styles.rowMetaText}>
                        {collection.area}, {collection.city}
                      </Text>
                    </View>
                  )}

                  {joined ? (
                    // Joined: the slot picker is replaced by the booked slot.
                    <View style={styles.bookedSlot}>
                      <Ionicons name="checkmark-circle" size={18} color="#1B8A5A" />
                      <Text style={styles.bookedSlotText}>
                        {bookedSlot
                          ? `${formatCollectionDate(bookedSlot.date)} · ${bookedSlot.time}`
                          : "Slot confirmed"}
                      </Text>
                    </View>
                  ) : lockedByOther ? (
                    // No picker and no Join button at all — the schedule is spent.
                    <View style={styles.lockedNotice}>
                      <Ionicons name="lock-closed-outline" size={16} color="#718096" />
                      <Text style={styles.lockedNoticeText}>
                        You already have a pickup scheduled.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.slotsLabel}>Choose a time</Text>
                      <View style={styles.slotList}>
                        {collection.slots.map((slot) => {
                          const picked = pickedSlotId === slot.id;
                          return (
                            <TouchableOpacity
                              key={slot.id}
                              style={[styles.slotChip, picked && styles.slotChipPicked]}
                              onPress={() => pickSlot(collection.id, slot.id)}
                              activeOpacity={0.8}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: picked }}
                            >
                              <Ionicons
                                name={picked ? "radio-button-on" : "radio-button-off"}
                                size={16}
                                color={picked ? "#00528A" : "#a0aec0"}
                              />
                              <Text
                                style={[
                                  styles.slotChipText,
                                  picked && styles.slotChipTextPicked,
                                ]}
                              >
                                {formatCollectionDate(slot.date)} · {slot.time}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.joinButton,
                          !pickedSlotId && styles.joinButtonDisabled,
                        ]}
                        onPress={() =>
                          pickedSlotId && scheduleCollection(collection.id, pickedSlotId)
                        }
                        disabled={!pickedSlotId}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
                        <Text style={styles.joinButtonText}>Join</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              );
            })}

        <View style={styles.listBottomSpacing} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  headerSection: {
    backgroundColor: "#00528A",
    paddingBottom: 20,
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  emptyStateContainer: {
    alignItems: "center",
    maxWidth: 320,
  },
  illustrationContainer: {
    position: "relative",
    marginBottom: 40,
  },
  illustrationBackground: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  sparkleContainer: {
    position: "absolute",
    width: 200,
    height: 200,
    top: -20,
    left: -20,
  },
  sparkle1: {
    position: "absolute",
    top: 20,
    right: 30,
  },
  sparkle2: {
    position: "absolute",
    bottom: 40,
    left: 20,
  },
  sparkle3: {
    position: "absolute",
    top: 60,
    left: 30,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2d3748",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#4a5568",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 24,
  },
  description: {
    fontSize: 14,
    color: "#718096",
    textAlign: "center",
    lineHeight: 20,
  },
  actionButtons: {
    width: "100%",
    marginBottom: 40,
  },
  primaryButton: {
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  gradientButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#00528A",
    gap: 10,
  },
  secondaryButtonText: {
    color: "#00528A",
    fontSize: 16,
    fontWeight: "600",
  },
  infoContainer: {
    width: "100%",
    backgroundColor: "#f8f9fa",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d3748",
    marginBottom: 16,
    textAlign: "center",
  },
  infoList: {
    gap: 12,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#4a5568",
    flex: 1,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: "#e0e0e0",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#00528A",
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#666666",
    fontWeight: "500",
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: "#f1f4f7",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#00528A",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a5568",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  rowCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#eef1f4",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  rowDate: {
    fontSize: 13,
    color: "#718096",
    fontWeight: "500",
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d3748",
    marginBottom: 8,
  },
  // Same title, sitting inside rowHeader where the header owns the spacing.
  rowTitleInline: {
    marginBottom: 0,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  rowMetaText: {
    fontSize: 13,
    color: "#4a5568",
    flex: 1,
  },
  rowComment: {
    fontSize: 13,
    color: "#718096",
    fontStyle: "italic",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f2f4f6",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeCompleted: {
    backgroundColor: "#E4F6EC",
  },
  statusBadgePending: {
    backgroundColor: "#FFF4E0",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  statusBadgeTextCompleted: {
    color: "#1B8A5A",
  },
  statusBadgeTextPending: {
    color: "#B57200",
  },
  statusBadgeScheduled: {
    backgroundColor: "#E6F0F7",
  },
  statusBadgeTextScheduled: {
    color: "#00528A",
  },
  slotsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#718096",
    letterSpacing: 0.3,
    marginTop: 10,
    marginBottom: 8,
  },
  slotList: {
    gap: 8,
  },
  slotChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fbfcfd",
  },
  slotChipPicked: {
    borderColor: "#00528A",
    backgroundColor: "#E6F0F7",
  },
  slotChipText: {
    fontSize: 13,
    color: "#4a5568",
    flex: 1,
  },
  slotChipTextPicked: {
    color: "#00528A",
    fontWeight: "600",
  },
  bookedSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#E4F6EC",
    borderWidth: 1,
    borderColor: "#1B8A5A",
  },
  lockedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#f4f6f8",
  },
  lockedNoticeText: {
    fontSize: 13,
    color: "#718096",
    flex: 1,
  },
  bookedSlotText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1B8A5A",
    flex: 1,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#00528A",
  },
  joinButtonDisabled: {
    backgroundColor: "#b3c8d6",
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  listBottomSpacing: {
    height: 40,
  },
});

export default CollectionsScreen;
