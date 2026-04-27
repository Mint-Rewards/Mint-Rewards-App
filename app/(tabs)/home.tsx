import Navbar from "@/components/ui/navbar";
import { BrandTheme, useAppStore } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Constants } from "../../utils/constants";
import { logEvent } from "@/utils/logger";

const CARD_HEIGHT = 150;

export default function HomeScreen() {
  const { user, wasteToCo2, getBrandsWithCampaigns } = useAppStore();
  const hasLocation = !!(user?.latitude && user?.longitude);

  const [brands, setBrands] = React.useState<BrandTheme[]>([]);

  const [co2, setCo2] = React.useState(0);
  useEffect(() => {
    wasteToCo2().then((value: number) => setCo2(value));
    getBrandsWithCampaigns().then((brands) => {
      if (Array.isArray(brands)) {
        setBrands(brands);
      }
    });
  }, [wasteToCo2, getBrandsWithCampaigns]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header with glassmorphism effect */}
      <Navbar user={user} />

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <LinearGradient
          colors={["#00528A", "#97DBAD"]}
          style={[
            styles.statCard,
            { backgroundColor: Constants.appThemeColor },
          ]}
        >
          <Text style={styles.statLabel}>Mint Rewards</Text>
          <Text style={styles.statValue}>{user?.points}</Text>
        </LinearGradient>
        <LinearGradient
          colors={["#73C1A6", "#AFDEF2"]}
          style={[styles.statCard]}
        >
          <Text style={styles.statLabel}>Recycled waste collected</Text>
          <Text style={styles.statValue}>
            {user?.totalWasteCollected || 0}kg
          </Text>
        </LinearGradient>
        <LinearGradient
          colors={["#82A599", "#C6F2C0"]}
          style={[styles.statCard]}
        >
          <Text style={styles.statLabel}>CO₂ Saved</Text>
          <Text style={styles.statValue}>{co2 || 0}%</Text>
        </LinearGradient>
      </View>

      {/* Upcoming Collections */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 20,
        }}
      >
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Collections</Text>
            {hasLocation && (
              <TouchableOpacity onPress={() => router.push("/collections")}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            )}
          </View>

          {hasLocation ? (
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
      </View>

      {/* Content Section */}
      <View style={styles.contentSection}>
        {/* Your Coupons */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Your Coupons</Text>

          <View style={{ height: 15 }}></View>
        </View>

        {/* Stacked Card Carousel */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.carouselContainer}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {brands &&
            brands.map((brand, index) => {
              return (
                <View
                  key={brand._id}
                  style={[
                    styles.cardWrapper,
                    {
                      zIndex: index - brands.length,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.couponCard,
                      {
                        backgroundColor: brand.themeColor,
                      },
                    ]}
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
                    activeOpacity={0.9}
                  >
                    <View
                      style={[
                        {
                          flex: 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.couponBrandTheme,
                          {
                            fontSize: 15,
                            color:
                              brand.themeColor === "#ffffff"
                                ? "#333333"
                                : "#ffffff",
                            fontWeight: "300",
                          },
                        ]}
                      >
                        {brand.category}
                      </Text>
                      <Text
                        style={[
                          styles.couponName,
                          {
                            color:
                              brand.themeColor === "#ffffff"
                                ? "#333333"
                                : "#ffffff",
                            fontSize: 26,
                          },
                        ]}
                      >
                        {brand.companyName}
                      </Text>
                    </View>
                    <View style={styles.couponDetails}>
                      <View
                        style={{
                          borderRadius: 12,
                          padding: 8,
                          marginBottom: 10,
                        }}
                      >
                        <Image
                          source={{ uri: brand.logo }}
                          style={[
                            styles.couponLogo,
                            {
                              backgroundColor: "transparent",
                            },
                          ]}
                          resizeMode="contain"
                        />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
        </ScrollView>
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
    backgroundColor: "#ffffff",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    height: 50,
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
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 10,
    justifyContent: "space-between",
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 15,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  statLabel: {
    color: "#ffffff",
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 16,
  },
  statValue: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
  },
  contentSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  carouselContainer: {
    paddingBottom: 20,
  },
  cardWrapper: {
    width: "100%",
    marginBottom: -CARD_HEIGHT * 0.1, // 10% overlap
    alignItems: "center",
    justifyContent: "center",
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333333",
  },
  seeAllText: {
    color: Constants.appThemeColor,
    fontSize: 14,
    fontWeight: "500",
  },
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
  skipButton: {
    backgroundColor: Constants.appThemeColor,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  skipButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "500",
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
  couponCard: {
    width: "100%",
    height: CARD_HEIGHT,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    overflow: "hidden",
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
  },
  couponInfo: {
    flex: 1,
  },
  couponBrandTheme: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
  },
  couponName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  couponCategory: {
    fontSize: 14,
  },
  couponDetails: {
    position: "absolute",
    right: 10,
    bottom: 0,
  },
  couponLogo: {
    width: 110,
    height: 110,
  },
  fab: {
    position: "absolute",
    bottom: 80,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Constants.appThemeColor,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  fabContent: {
    alignItems: "center",
  },
  fabText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 2,
  },
  fabSubText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
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
});
