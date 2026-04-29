import Navbar from "@/components/ui/navbar";
import { BrandTheme, useAppStore } from "@/store/store";
import { logEvent } from "@/utils/logger";
import { Constants } from "../../utils/constants";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  SharedValue,
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
  scrollY: SharedValue<number>;
  onPress: () => void;
};

const BrandCard = React.memo(({ brand, index, scrollY, onPress }: BrandCardProps) => {
  const offsetY = useSharedValue(80);
  const entryOpacity = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    const delay = index * 70;
    offsetY.value = withDelay(delay, withSpring(0, { damping: 14, stiffness: 100 }));
    entryOpacity.value = withDelay(delay, withTiming(1, { duration: 260 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const cardTopY = index * VISIBLE;

    // Extra upward push as the card scrolls off the top.
    const collapseY = interpolate(
      scrollY.value,
      [cardTopY, cardTopY + VISIBLE],
      [0, -VISIBLE * 0.2],
      Extrapolation.CLAMP,
    );

    return {
      opacity: entryOpacity.value,
      transform: [
        { translateY: offsetY.value + collapseY },
        { scale: pressScale.value },
      ],
    };
  });

  const isLight = isLightColor(brand.themeColor);
  const textColor = isLight ? "#333333" : "#ffffff";

  return (
    <Animated.View style={[styles.cardWrapper, { zIndex: index }, animatedStyle]}>
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
  const [brands, setBrands] = React.useState<BrandTheme[]>([]);
  const [co2, setCo2] = React.useState(0);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  useEffect(() => {
    wasteToCo2().then((value: number) => setCo2(value));
    getBrandsWithCampaigns().then((result) => {
      if (Array.isArray(result)) setBrands(result);
    });
  }, [wasteToCo2, getBrandsWithCampaigns]);

  const pendingBrands = brands.filter((b) => (b as any).status === "PENDING");

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Navbar user={user} />

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
      <View style={styles.upcomingSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming Collections</Text>
          <Text style={styles.seeAllText} onPress={() => router.push("/collections")}>
            See All
          </Text>
        </View>
        <View style={styles.collectionCard}>
          <View style={styles.collectionInfo}>
            <Text style={styles.collectionTitle}>Your next collection is on</Text>
            <Text style={styles.collectionDate}>Yet to be scheduled</Text>
          </View>
          <Image
            source={require("../../assets/images/Group 1597880836.png")}
            style={styles.collectionImage}
            resizeMode="contain"
          />
        </View>
      </View>

      {/* Coupons */}
      <View style={styles.contentSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Coupons</Text>
          <Text style={styles.seeAllText} onPress={() => router.push("/discounts")}>
            View all discounts
          </Text>
        </View>

        <Animated.ScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.carouselContainer}
          style={{ flex: 1 }}
        >
          {pendingBrands.map((brand, index) => (
            <BrandCard
              key={brand._id}
              brand={brand as BrandTheme & { status?: string }}
              index={index}
              scrollY={scrollY}
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
          <View style={{ height: OVERLAP + 80 }} />
        </Animated.ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 10,
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
  upcomingSection: { paddingHorizontal: 20, paddingTop: 20, marginBottom: 4 },
  contentSection: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
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
  collectionInfo: { flex: 1 },
  collectionTitle: { fontSize: 14, color: "#666666", marginBottom: 4 },
  collectionDate: { fontSize: 16, fontWeight: "bold", color: "#333333" },
  collectionImage: { borderRadius: 8, height: 70 },
  carouselContainer: { paddingTop: 4 },
  cardWrapper: {
    width: "100%",
    marginBottom: -OVERLAP,
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
