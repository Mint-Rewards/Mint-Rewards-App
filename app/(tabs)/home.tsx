import Navbar from "@/components/ui/navbar";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import { isDemoCollectionsUser } from "@/constants/demoAccounts";
import {
  TOTAL_POINTS_EARNED,
  TOTAL_WASTE_KG,
  UPCOMING_COLLECTIONS_COUNT,
  earliestCollectionSlot,
  formatCollectionDate,
  upcomingCollectionsForUser,
  upcomingStatusLabel,
} from "@/constants/mockCollectionsData";
import { BrandTheme, co2FromWasteKg, useAppStore } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import { brandSurface } from "@/utils/brandTheme";
import { logEvent } from "@/utils/logger";
import { isLegacyTownValue } from "@/utils/pakistan_areas";
import { Constants } from "../../utils/constants";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const INSTAGRAM_HANDLE = 'mymintrewards'; // replace with actual handle

const CARD_HEIGHT = 160;
const OVERLAP = CARD_HEIGHT * 0.28;
const VISIBLE = CARD_HEIGHT - OVERLAP; // px each card peeks above the next

const openInstagram = async () => {
  const appUrl = `instagram://user?username=${INSTAGRAM_HANDLE}`;
  const webUrl = `https://instagram.com/${INSTAGRAM_HANDLE}`;

  // instagram:// isn't declared in LSApplicationQueriesSchemes, so
  // canOpenURL/openURL can both fail even with Instagram installed — always
  // fall back to the web URL rather than surface the failure to the user.
  try {
    const supported = await Linking.canOpenURL(appUrl);
    if (!supported) throw new Error("instagram scheme not supported");
    await Linking.openURL(appUrl);
  } catch {
    await Linking.openURL(webUrl);
  }
};

type BrandCardProps = {
  brand: BrandTheme & { status?: string };
  index: number;
  onPress: () => void;
  locked?: boolean;
};

const BrandCard = React.memo(({ brand, index, onPress, locked }: BrandCardProps) => {
  const offsetY = useSharedValue(80);
  const entryOpacity = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    const delay = index * 70;
    offsetY.value = withDelay(delay, withSpring(0, { damping: 14, stiffness: 100 }));
    entryOpacity.value = withDelay(delay, withTiming(1, { duration: 260 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entryOpacity.value,
    transform: [
      { translateY: offsetY.value },
      { scale: pressScale.value },
    ],
  }));

  // Painted from the normalised colour, never the raw field: a malformed value
  // like "#00000" renders as transparent in RN, which left the card invisible
  // against the page while the text stayed white.
  const surface = brandSurface(brand.themeColor);

  return (
    <Animated.View style={[styles.cardWrapper, { zIndex: index, top: index * VISIBLE }, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          if (!locked) pressScale.value = withSpring(0.96, { damping: 20, stiffness: 400 });
        }}
        onPressOut={() => {
          pressScale.value = withSpring(1, { damping: 20, stiffness: 400 });
        }}
      >
        <View
          style={[
            styles.couponCard,
            { backgroundColor: surface.background },
            surface.isLight && [
              styles.couponCardLight,
              { borderColor: surface.hairline! },
            ],
            locked && styles.couponCardLocked,
          ]}
        >
          <View style={styles.couponTextBlock}>
            <Text
              style={[styles.couponCategory, { color: surface.onSurfaceMuted }]}
              numberOfLines={1}
            >
              {brand.category}
            </Text>
            <Text style={[styles.couponName, { color: surface.onSurface }]} numberOfLines={1}>
              {brand.companyName}
            </Text>
          </View>

          <View style={styles.couponLogoWrapper}>
            <Image
              source={{ uri: brand.logo }}
              style={styles.couponLogo}
              resizeMode="contain"
            />
          </View>

          {locked && (
            <View style={styles.lockedOverlay}>
              <Ionicons name="lock-closed" size={28} color="#ffffff" />
              <Text style={styles.lockedText}>Complete your profile to unlock</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});

/**
 * A stat card's figure. The unit is a separate, smaller Text on the same
 * baseline so "41.7" and "kg" can never be split across two lines — the number
 * shrinks to fit its card instead of wrapping.
 */
const StatValue = ({
  value,
  unit,
}: {
  value: number | string | undefined;
  unit?: string;
}) => (
  <View style={styles.statValueRow}>
    <Text
      style={styles.statValue}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {value}
    </Text>
    {!!unit && <Text style={styles.statUnit}>{unit}</Text>}
  </View>
);

export default function HomeScreen() {
  const {
    user,
    wasteToCo2,
    getBrands,
    scheduledCollection,
    loadScheduledCollection,
  } = useAppStore();
  // 0 on Android, where the tab bar sits in the layout flow; on iOS the bar is
  // absolutely positioned, so the scroll has to clear it by its full height.
  const tabBarOverflow = useBottomTabOverflow();
  const hasLocation = !!(user?.latitude && user?.longitude);
  const hasAddress = !!user?.address;
  const isProfileComplete = !!(
    user?.phone?.trim() &&
    user?.province?.trim() &&
    user?.city?.trim()
  );

  // Saved on an older build, against a town list that has since been renamed
  // and made canonical. The value can no longer be matched to a town, so ask
  // the user to re-pick it. Only surfaced once the profile is otherwise
  // complete — the prompt above already routes incomplete profiles to the same
  // screen, and two prompts stacked would just be noise.
  const needsLocationUpdate =
    isProfileComplete && isLegacyTownValue(user?.city || "", user?.town || "");

  // Demo-only: allowlisted accounts see the mock upcoming-collections teaser
  // instead of the static "Warming Up!" card. Everyone else is unaffected.
  // Placed in this user's own town/city, same helper the collections screen uses.
  const upcomingCollections = React.useMemo(
    () => upcomingCollectionsForUser(user),
    [user],
  );
  const isDemoUser = isDemoCollectionsUser(user?.email);
  const showDemoCollections = isDemoUser && upcomingCollections.length > 0;
  const nextCollection = showDemoCollections ? upcomingCollections[0] : undefined;
  // Collections offer several slots; the teaser shows the soonest one.
  const nextSlot = nextCollection ? earliestCollectionSlot(nextCollection) : undefined;
  // Once the user has scheduled a pickup on /collections, their booking takes
  // over this card — it is the more useful thing to show than a generic teaser.
  // The store holds only the ids, so resolve them against the same rows the
  // collections screen renders.
  const booked = React.useMemo(() => {
    if (!showDemoCollections || !scheduledCollection) return undefined;
    const collection = upcomingCollections.find(
      (item) => item.id === scheduledCollection.collectionId,
    );
    const slot = collection?.slots.find(
      (item) => item.id === scheduledCollection.slotId,
    );
    return collection && slot
      ? { collection, slot, status: scheduledCollection.status }
      : undefined;
  }, [showDemoCollections, scheduledCollection, upcomingCollections]);

  const [brands, setBrands] = React.useState<BrandTheme[]>([]);
  const [co2, setCo2] = React.useState(0);

  useEffect(() => {
    wasteToCo2().then((value: number) => setCo2(value));
    getBrands().then((result) => {
      if (Array.isArray(result)) setBrands(result);
    });
  }, [wasteToCo2, getBrands]);

  // The booking outlives the session, so pull it back from SecureStore once the
  // user is known — keyed on the id, since the stored schedule is per-user.
  useEffect(() => {
    loadScheduledCollection();
  }, [loadScheduledCollection, user?._id]);

  // Demo accounts have no real pickups on the backend, so user.totalWasteCollected
  // is empty for them and these two cards would read 0 while /collections and
  // the profile screen show the mock totals. Read the same figure they do, and
  // derive CO₂ from it with the store's factor rather than a second copy.
  const wasteCollectedKg = isDemoUser
    ? TOTAL_WASTE_KG
    : user?.totalWasteCollected || 0;
  const co2Saved = isDemoUser ? co2FromWasteKg(TOTAL_WASTE_KG) : co2;
  // 100 points per completed pickup for demo accounts, whose points balance on
  // the backend does not reflect the mock pickup history.
  const points = isDemoUser ? TOTAL_POINTS_EARNED : user?.points;

  // active-campaigns only ever returns APPROVED brands, so no filtering here.
  const cardsContainerHeight = brands.length * VISIBLE + OVERLAP + 80;
  // The "going live soon" teaser has nowhere to send the user yet — only a
  // booked or upcoming collection makes the card worth tapping.
  const canOpenCollections = !!booked || !!(showDemoCollections && nextCollection && nextSlot);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Navbar user={user} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 40 + tabBarOverflow },
        ]}
      >
        {/* Stats */}
        <View style={styles.statsContainer}>
          <LinearGradient colors={["#00528A", "#97DBAD"]} style={styles.statCard}>
            <Text style={styles.statLabel}>Mint Rewards</Text>
            <StatValue value={points} />
          </LinearGradient>
          <LinearGradient colors={["#73C1A6", "#AFDEF2"]} style={styles.statCard}>
            <Text style={styles.statLabel}>Recycled waste collected</Text>
            <StatValue value={wasteCollectedKg} unit="kg" />
          </LinearGradient>
          <LinearGradient colors={["#82A599", "#C6F2C0"]} style={styles.statCard}>
            <Text style={styles.statLabel}>CO₂ Saved</Text>
            <StatValue value={co2Saved || 0} unit="%" />
          </LinearGradient>
        </View>

        {/* Upcoming Collections */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Collections</Text>
            {hasLocation && (
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    showDemoCollections
                      ? "/collections?section=upcoming"
                      : "/collections",
                  )
                }
              >
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            )}
          </View>

          {(hasLocation && hasAddress) ? (
            <Pressable
              style={({ pressed }) => [
                styles.collectionCard,
                pressed && canOpenCollections && styles.collectionCardPressed,
              ]}
              onPress={
                canOpenCollections
                  ? () =>
                      router.push(
                        showDemoCollections
                          ? "/collections?section=upcoming"
                          : "/collections",
                      )
                  : undefined
              }
              disabled={!canOpenCollections}
              accessibilityRole={canOpenCollections ? "button" : undefined}
            >
              <View style={styles.collectionInfo}>
                {booked ? (
                  <>
                    <Text style={styles.collectionPrimary}>
                      {upcomingStatusLabel(booked.status)} for{" "}
                      {formatCollectionDate(booked.slot.date)}
                    </Text>
                    <Text style={styles.collectionSecondary}>
                      {booked.collection.code} · {booked.slot.time}
                    </Text>
                  </>
                ) : showDemoCollections && nextCollection && nextSlot ? (
                  <>
                    <Text style={styles.collectionPrimary}>
                      Next on {formatCollectionDate(nextSlot.date)}
                      {nextCollection.area ? ` · ${nextCollection.area}` : ""}
                    </Text>
                    <Text style={styles.collectionSecondary}>
                      {UPCOMING_COLLECTIONS_COUNT} collections near you
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.collectionPrimary}>
                      Collections are going live soon
                    </Text>
                    <Text style={styles.collectionSecondary}>
                      Follow us to stay updated!
                    </Text>
                    <TouchableOpacity
                      onPress={openInstagram}
                      style={styles.instagramLink}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons
                        name="logo-instagram"
                        size={14}
                        color={Constants.appThemeColor}
                      />
                      <Text style={styles.instagramLinkText}>@mymintrewards</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
              <Image
                source={require("../../assets/images/upcoming-collections.png")}
                style={styles.collectionImage}
                resizeMode="contain"
              />
            </Pressable>
          ) : (
            <TouchableOpacity
              style={styles.locationPromptCard}
              onPress={() => router.push("/editProfile")}
              activeOpacity={0.8}
            >
              <Ionicons name="location-outline" size={28} color="#449EB2" />
              <Text style={styles.locationPromptTitle}>Location not set</Text>
              <Text style={styles.locationPromptText}>
                Set your exact location so we can schedule waste collections near
                you.
              </Text>
              <Text style={styles.locationPromptLink}>Set Location →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Coupons */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Coupons</Text>
            <Text style={styles.seeAllText} onPress={() => router.push("/discounts")}>
              View all discounts
            </Text>
          </View>

          {!isProfileComplete && (
            <TouchableOpacity
              style={styles.profilePromptCard}
              onPress={() => router.push("/editProfile")}
              activeOpacity={0.8}
            >
              <Ionicons name="person-circle-outline" size={22} color="#449EB2" />
              <Text style={styles.profilePromptText}>
                Complete your profile to unlock coupons
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#449EB2" />
            </TouchableOpacity>
          )}

          {needsLocationUpdate && (
            <TouchableOpacity
              style={styles.profilePromptCard}
              onPress={() => router.push("/editProfile")}
              activeOpacity={0.8}
            >
              <Ionicons name="location-outline" size={22} color="#449EB2" />
              <Text style={styles.profilePromptText}>
                We&apos;ve updated our area list — please confirm your town
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#449EB2" />
            </TouchableOpacity>
          )}

          <View style={{ height: cardsContainerHeight, position: "relative" }}>
            {brands.map((brand, index) => (
              <BrandCard
                key={brand._id}
                brand={brand as BrandTheme & { status?: string }}
                index={index}
                locked={!isProfileComplete}
                onPress={() => {
                  if (!isProfileComplete) {
                    router.push("/editProfile");
                    return;
                  }
                  logEvent("BRAND_VIEWED", {
                    userId: user?._id,
                    userEmail: user?.email,
                    extra: {
                      brandId: brand._id,
                      brandName: brand.companyName,
                      brandCategory: brand.category,
                    },
                  });
                  router.push(`/redeem?brandId=${brand._id}`);
                }}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  scrollContent: { paddingBottom: 40 },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingTop: 16,
    justifyContent: "space-between",
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  statLabel: { color: "#ffffff", fontSize: 12, marginBottom: 8, lineHeight: 16 },
  // Number and unit share a baseline; the number takes the slack so it can
  // shrink rather than push the unit onto its own line.
  statValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    alignSelf: "stretch",
  },
  statValue: { color: "#ffffff", fontSize: 26, fontWeight: "900", flexShrink: 1 },
  statUnit: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 2,
  },
  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: "#333333" },
  seeAllText: { color: Constants.appThemeColor, fontSize: 14, fontWeight: "500" },
  collectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    height: 100,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF1F4",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  collectionCardPressed: {
    opacity: 0.85,
  },
  collectionInfo: {
    flex: 1,
  },
  collectionPrimary: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    lineHeight: 20,
    marginBottom: 4,
  },
  collectionSecondary: {
    fontSize: 13,
    color: "#718096",
  },
  instagramLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  instagramLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: Constants.appThemeColor,
  },
  collectionImage: {
    borderRadius: 10,
    height: 75,
  },
  locationPromptCard: {
    backgroundColor: "#F0F8FF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D0E8F5",
    borderStyle: "dashed",
  },
  locationPromptTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333333",
    marginTop: 8,
    marginBottom: 4,
  },
  locationPromptText: {
    fontSize: 13,
    color: "#666666",
    textAlign: "center",
    marginBottom: 10,
  },
  locationPromptLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#449EB2",
  },
  cardWrapper: {
    width: "100%",
    height: CARD_HEIGHT,
    position: "absolute",
  },
  couponCard: {
    width: "100%",
    height: CARD_HEIGHT,
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
    overflow: "hidden",
  },
  couponCardLight: {
    borderWidth: 1,
  },
  couponTextBlock: { flex: 1, justifyContent: "center", gap: 4 },
  couponCategory: { fontSize: 13, fontWeight: "300" },
  couponName: { fontSize: 26, fontWeight: "700", letterSpacing: -0.3 },
  couponLogoWrapper: { width: 110, height: 110, alignItems: "center", justifyContent: "center" },
  couponLogo: { width: 110, height: 110 },
  couponCardLocked: {
    opacity: 0.45,
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  lockedText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  profilePromptCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F8FF",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#D0E8F5",
    gap: 8,
  },
  profilePromptText: {
    flex: 1,
    fontSize: 13,
    color: "#449EB2",
    fontWeight: "500",
  },
});
