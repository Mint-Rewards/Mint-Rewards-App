import { BrandTheme, Campaign, useAppStore } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const RedeemScreen = () => {
  const { brandId } = useLocalSearchParams();
  const { brandsWithCampaigns } = useAppStore();
  const [brand, setBrand] = useState<
    (BrandTheme & { campaigns: Campaign[] }) | null
  >(null);
  const [codeModal, setCodeModal] = useState<{
    visible: boolean;
    code: string;
    campaignName: string;
  }>({ visible: false, code: "", campaignName: "" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (brandId && brandsWithCampaigns.length > 0) {
      const found = brandsWithCampaigns.find((d) => d._id === brandId);
      if (found) {
        setBrand(found);
      }
    } else {
      setBrand(null);
      Alert.alert("Error", "Invalid brand", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, []);

  const handleRedeem = (campaign: Campaign) => {
    if (!campaign.discountCodes || campaign.discountCodes.length === 0) {
      Alert.alert("No Codes", "No discount codes available for this campaign.");
      return;
    }
    const randomCode =
      campaign.discountCodes[
        Math.floor(Math.random() * campaign.discountCodes.length)
      ];
    setCopied(false);
    setCodeModal({
      visible: true,
      code: randomCode,
      campaignName: campaign.name,
    });
  };

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(codeModal.code);
    setCopied(true);
  };

  const getDaysLeft = (endDate: string) => {
    const diff = new Date(endDate).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Brand Header */}

      <View
        style={[
          styles.heroSection,
          { backgroundColor: brand?.themeColor || "#00528A" },
        ]}
      >
        <View style={styles.logoWrapper}>
          <Image
            source={{ uri: brand?.logo }}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Ionicons
            name="sparkles"
            size={20}
            color="#FFD700"
            style={styles.sparkle1}
          />
          <Ionicons
            name="star"
            size={16}
            color="#FF69B4"
            style={styles.sparkle2}
          />
          <Ionicons
            name="diamond"
            size={18}
            color="#00CED1"
            style={styles.sparkle3}
          />
        </View>
        <Text style={styles.brandName}>{brand?.companyName}</Text>
        {brand?.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{brand.category}</Text>
          </View>
        )}
      </View>

      {/* Campaigns */}
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionTitle}>
          {brand?.campaigns && brand.campaigns.length > 0
            ? "Available Campaigns"
            : ""}
        </Text>

        {brand?.campaigns && brand.campaigns.length > 0 ? (
          brand.campaigns.map((campaign) => {
            const daysLeft = getDaysLeft(campaign.endDate);
            return (
              <TouchableOpacity
                key={campaign._id}
                style={styles.campaignCard}
                activeOpacity={0.7}
                onPress={() => handleRedeem(campaign)}
              >
                {/* Top row: name + badge */}
                <View style={styles.campaignHeader}>
                  <View style={styles.campaignTitleRow}>
                    <Text style={styles.campaignName} numberOfLines={1}>
                      {campaign.name}
                    </Text>
                    {campaign.discountPercentage && (
                      <LinearGradient
                        colors={["#00528A", "#0078c8"]}
                        style={styles.discountBadge}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        <Text style={styles.discountBadgeText}>
                          {campaign.discountPercentage}% OFF
                        </Text>
                      </LinearGradient>
                    )}
                  </View>
                </View>

                {/* Details */}
                <View style={styles.campaignDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={15}
                      color="#718096"
                    />
                    <Text style={styles.detailText}>
                      {new Date(campaign.startDate).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "short" },
                      )}{" "}
                      -{" "}
                      {new Date(campaign.endDate).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>

                  {campaign.addresses.length > 0 && (
                    <View style={styles.detailRow}>
                      <Ionicons
                        name="location-outline"
                        size={15}
                        color="#718096"
                      />
                      <Text style={styles.detailText} numberOfLines={1}>
                        {campaign.addresses
                          .map((a) => a.city)
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Footer: days left + CTA */}
                <View style={styles.campaignFooter}>
                  <View style={styles.daysLeftBadge}>
                    <Ionicons name="time-outline" size={14} color="#e67e22" />
                    <Text style={styles.daysLeftText}>
                      {daysLeft > 0 ? `${daysLeft} days left` : "Ending soon"}
                    </Text>
                  </View>
                  <View style={styles.redeemCta}>
                    <Text style={styles.redeemCtaText}>Get Code</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#00528A"
                    />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyCampaigns}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="megaphone-outline" size={40} color="#00528A" />
            </View>
            <Text style={styles.emptyCampaignsText}>
              No active campaigns right now
            </Text>
            <Text style={styles.emptyCampaignsSubtext}>
              Check back soon for exciting offers from this brand!
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Code Reveal Modal */}
      <Modal
        visible={codeModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setCodeModal({ ...codeModal, visible: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setCodeModal({ ...codeModal, visible: false })}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>

            <View style={styles.modalIconCircle}>
              <Ionicons name="gift" size={32} color="#00528A" />
            </View>

            <Text style={styles.modalTitle}>Your Discount Code</Text>
            <Text style={styles.modalCampaignName}>
              {codeModal.campaignName}
            </Text>

            <View style={styles.codeContainer}>
              <Text style={styles.codeText}>{codeModal.code}</Text>
            </View>

            <TouchableOpacity
              style={[styles.copyButton, copied && styles.copyButtonCopied]}
              onPress={handleCopyCode}
            >
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={20}
                color="#fff"
              />
              <Text style={styles.copyButtonText}>
                {copied ? "Copied!" : "Copy Code"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fa",
  },
  backButton: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  heroSection: {
    paddingTop: 90,
    paddingBottom: 30,
    alignItems: "center",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  logoWrapper: {
    position: "relative",
    marginBottom: 12,
  },
  brandLogo: {
    width: 90,
    height: 90,
  },
  sparkle1: {
    position: "absolute",
    top: -5,
    right: -10,
  },
  sparkle2: {
    position: "absolute",
    bottom: 5,
    left: -12,
  },
  sparkle3: {
    position: "absolute",
    top: 10,
    left: -8,
  },
  brandName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  categoryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2d3748",
    marginBottom: 16,
  },

  // Campaign Card
  campaignCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  campaignHeader: {
    marginBottom: 12,
  },
  campaignTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  campaignName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#2d3748",
    flex: 1,
  },
  discountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  discountBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  campaignDetails: {
    gap: 8,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: "#718096",
    flex: 1,
  },
  campaignFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 12,
  },
  daysLeftBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fef3e2",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  daysLeftText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#e67e22",
  },
  redeemCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  redeemCtaText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00528A",
  },

  // Empty state
  emptyCampaigns: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#e8f4fd",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyCampaignsText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4a5568",
  },
  emptyCampaignsSubtext: {
    fontSize: 14,
    color: "#718096",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 30,
    width: "100%",
    alignItems: "center",
  },
  modalClose: {
    position: "absolute",
    top: 16,
    right: 16,
  },
  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#e8f4fd",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2d3748",
    marginBottom: 4,
  },
  modalCampaignName: {
    fontSize: 14,
    color: "#718096",
    marginBottom: 24,
  },
  codeContainer: {
    backgroundColor: "#f5f6fa",
    borderWidth: 2,
    borderColor: "#00528A",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 30,
    marginBottom: 20,
    width: "100%",
    alignItems: "center",
  },
  codeText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00528A",
    letterSpacing: 3,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00528A",
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 14,
    gap: 8,
    width: "100%",
  },
  copyButtonCopied: {
    backgroundColor: "#38a169",
  },
  copyButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default RedeemScreen;
