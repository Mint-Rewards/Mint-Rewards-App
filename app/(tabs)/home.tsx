import Navbar from "@/components/ui/navbar";
import { BrandTheme, useAppStore } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import { logEvent } from "@/utils/logger";
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
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const CARD_HEIGHT = 160;
const OVERLAP = CARD_HEIGHT * 0.28;
const VISIBLE = CARD_HEIGHT - OVERLAP; // px each card peeks above the next

function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
}

type BrandCardProps = {
  brand: BrandTheme & { status?: string };
  index: number;
  onPress: () => void;
};

const BrandCard = React.memo(({ brand, index, onPress }: BrandCardProps) => {
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

  const isLight = isLightColor(brand.themeColor);
  const textColor = isLight ? "#333333" : "#ffffff";

  return (
    <Animated.View style={[styles.cardWrapper, { zIndex: index, top: index * VISIBLE }, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          pressScale.value = withSpring(0.96, { damping: 20, stiffness: 400 });
        }}
        onPressOut={() => {
          pressScale.value = withSpring(1, { damping: 20, stiffness: 400 });
        }}
      >
        <View
          style={[
            styles.couponCard,
            { backgroundColor: brand.themeColor },
            isLight && styles.couponCardLight,
          ]}
        >
          <View style={styles.couponTextBlock}>
            <Text style={[styles.couponCategory, { color: textColor }]} numberOfLines={1}>
              {brand.category}
            </Text>
            <Text style={[styles.couponName, { color: textColor }]} numberOfLines={1}>
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
        </View>
      </Pressable>
    </Animated.View>
  );
});

export default function HomeScreen() {
  const { user, wasteToCo2, getBrandsWithCampaigns } = useAppStore();
  const hasLocation = !!(user?.latitude && user?.longitude);
  const hasAddress = !!user?.address;

  const [brands, setBrands] = React.useState<BrandTheme[]>([]);
  const [co2, setCo2] = React.useState(0);

  useEffect(() => {
    wasteToCo2().then((value: number) => setCo2(value));
    getBrandsWithCampaigns().then((result) => {
      if (Array.isArray(result)) setBrands(result);
    });
  }, [wasteToCo2, getBrandsWithCampaigns]);

  const pendingBrands = brands.filter((b) => (b as any).status === "PENDING");
  const cardsContainerHeight = pendingBrands.length * VISIBLE + OVERLAP + 80;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Navbar user={user} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Stats */}
        <View style={styles.statsContainer}>
          <LinearGradient colors={["#00528A", "#97DBAD"]} style={styles.statCard}>
            <Text style={styles.statLabel}>Mint Rewards</Text>
            <Text style={styles.statValue}>{user?.points}</Text>
          </LinearGradient>
          <LinearGradient colors={["#73C1A6", "#AFDEF2"]} style={styles.statCard}>
            <Text style={styles.statLabel}>Recycled waste collected</Text>
            <Text style={styles.statValue}>{user?.totalWasteCollected || 0}kg</Text>
          </LinearGradient>
          <LinearGradient colors={["#82A599", "#C6F2C0"]} style={styles.statCard}>
            <Text style={styles.statLabel}>CO₂ Saved</Text>
            <Text style={styles.statValue}>{co2 || 0}%</Text>
          </LinearGradient>
        </View>

        {/* Upcoming Collections */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Collections</Text>
            {hasLocation && (
              <TouchableOpacity onPress={() => router.push("/collections")}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            )}
          </View>

          {(hasLocation && hasAddress) ? (
            <View style={styles.collectionCard}>
              <View style={styles.collectionInfo}>
                <Text style={styles.collectionTitle}>
                  Your next collection is on
                </Text>
                <Text style={styles.collectionDate}>Yet to be scheduled</Text>
              </View>
              <Image
                source={require("../../assets/images/Group 1597880836.png")}
                style={styles.collectionImage}
                resizeMode="contain"
              />
            </View>
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

          <View style={{ height: cardsContainerHeight, position: "relative" }}>
            {pendingBrands.map((brand, index) => (
              <BrandCard
                key={brand._id}
                brand={brand as BrandTheme & { status?: string }}
                index={index}
                onPress={() => {
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
    padding: 15,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  statLabel: { color: "#ffffff", fontSize: 12, marginBottom: 8, lineHeight: 16 },
  statValue: { color: "#ffffff", fontSize: 28, fontWeight: "900" },
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
    backgroundColor: "#F8F8F8",
    borderRadius: 12,
    padding: 16,
    height: 100,
    flexDirection: "row",
    alignItems: "center",
  },
  collectionInfo: {
    flex: 1,
  },
  collectionTitle: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 4,
  },
  collectionDate: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
    marginBottom: 12,
  },
  collectionImage: {
    borderRadius: 8,
    height: 70,
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
    borderColor: "rgba(0,0,0,0.08)",
  },
  couponTextBlock: { flex: 1, justifyContent: "center", gap: 4 },
  couponCategory: { fontSize: 13, fontWeight: "300", opacity: 0.85 },
  couponName: { fontSize: 26, fontWeight: "700", letterSpacing: -0.3 },
  couponLogoWrapper: { width: 110, height: 110, alignItems: "center", justifyContent: "center" },
  couponLogo: { width: 110, height: 110 },
});
