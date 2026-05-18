import { BrandTheme, Campaign, DiscountItem, useAppStore } from "@/store/store";
import { useCouponDownload } from "@/hooks/useCouponDownload";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const formatExpiry = (endDate: string) => {
  const d = new Date(endDate);
  return `Expires ${d.getDate()} ${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`;
};

const isExpired = (endDate: string) => new Date(endDate) < new Date();

const RedeemScreen = () => {
  const { brandId } = useLocalSearchParams();
  const { brandsWithCampaigns } = useAppStore();
  const { downloadCoupon, isDownloading } = useCouponDownload();

  const [brand, setBrand] = useState<(BrandTheme & { campaigns: Campaign[] }) | null>(null);
  const [detailModal, setDetailModal] = useState<{
    visible: boolean;
    campaign: Campaign | null;
  }>({ visible: false, campaign: null });

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

  const getDaysLeft = (endDate: string) => {
    const diff = new Date(endDate).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  // Map Campaign + brand into the DiscountItem shape useCouponDownload expects
  const toDiscountItem = (campaign: Campaign): DiscountItem => ({
    _id: campaign._id,
    name: campaign.name,
    discountPercentage: campaign.discountPercentage,
    brand: {
      _id: brand?._id ?? "",
      companyName: brand?.companyName ?? "",
      logo: brand?.logo,
      themeColor: brand?.themeColor,
      category: brand?.category,
    },
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    isAvailed: false,
  });

  const handleCampaignPress = (campaign: Campaign) => {
    setDetailModal({ visible: true, campaign });
  };

  const closeDetailModal = () =>
    setDetailModal({ visible: false, campaign: null });

  const handleDownloadPress = () => {
    if (!detailModal.campaign) return;
    const campaignName = detailModal.campaign.name;
    Alert.alert(
      "Download & Mark as Used?",
      `This ${campaignName} coupon is SINGLE USE. Once downloaded it will be marked as used and cannot be redeemed again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Download",
          style: "destructive",
          onPress: async () => {
            const item = toDiscountItem(detailModal.campaign!);
            const success = await downloadCoupon(item);
            if (success) closeDetailModal();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Brand Header */}
      <View style={[styles.heroSection, { backgroundColor: brand?.themeColor || "#00528A" }]}>
        <View style={styles.logoWrapper}>
          <Image source={{ uri: brand?.logo }} style={styles.brandLogo} resizeMode="contain" />
          <Ionicons name="sparkles" size={20} color="#FFD700" style={styles.sparkle1} />
          <Ionicons name="star"     size={16} color="#FF69B4" style={styles.sparkle2} />
          <Ionicons name="diamond"  size={18} color="#00CED1" style={styles.sparkle3} />
        </View>
        <Text style={styles.brandName}>{brand?.companyName}</Text>
        {brand?.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{brand.category}</Text>
          </View>
        )}
      </View>

      {/* Campaign list */}
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {brand?.campaigns && brand.campaigns.length > 0 && (
          <Text style={styles.sectionTitle}>Available Campaigns</Text>
        )}

        {brand?.campaigns && brand.campaigns.length > 0 ? (
          brand.campaigns.map((campaign) => {
            const daysLeft = getDaysLeft(campaign.endDate);
            const expired = isExpired(campaign.endDate);
            return (
              <TouchableOpacity
                key={campaign._id}
                style={[styles.campaignCard, expired && styles.campaignCardExpired]}
                activeOpacity={0.7}
                disabled={expired}
                onPress={() => handleCampaignPress(campaign)}
              >
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

                <View style={styles.campaignDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={15} color="#718096" />
                    <Text style={styles.detailText}>
                      {new Date(campaign.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {" – "}
                      {new Date(campaign.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  {campaign.addresses.length > 0 && (
                    <View style={styles.detailRow}>
                      <Ionicons name="location-outline" size={15} color="#718096" />
                      <Text style={styles.detailText} numberOfLines={1}>
                        {campaign.addresses.map((a) => a.city).filter(Boolean).join(", ")}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.campaignFooter}>
                  <View style={styles.daysLeftBadge}>
                    <Ionicons name="time-outline" size={14} color={expired ? "#aaa" : "#e67e22"} />
                    <Text style={[styles.daysLeftText, expired && { color: "#aaa" }]}>
                      {expired ? "Expired" : daysLeft > 0 ? `${daysLeft} days left` : "Ending soon"}
                    </Text>
                  </View>
                  {!expired && (
                    <View style={styles.redeemCta}>
                      <Text style={styles.redeemCtaText}>View Offer</Text>
                      <Ionicons name="chevron-forward" size={16} color="#00528A" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyCampaigns}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="megaphone-outline" size={40} color="#00528A" />
            </View>
            <Text style={styles.emptyCampaignsText}>No active campaigns right now</Text>
            <Text style={styles.emptyCampaignsSubtext}>
              Check back soon for exciting offers from this brand!
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Campaign detail modal */}
      <Modal
        visible={detailModal.visible}
        transparent
        animationType="slide"
        onRequestClose={closeDetailModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Teal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalAppName}>MINT REWARDS</Text>
              {brand?.logo ? (
                <Image source={{ uri: brand.logo }} style={styles.modalLogo} resizeMode="contain" />
              ) : (
                <View style={styles.modalLogoPlaceholder}>
                  <Text style={styles.modalLogoInitial}>
                    {brand?.companyName?.charAt(0).toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              <Text style={styles.modalBrandName}>{brand?.companyName}</Text>
              {detailModal.campaign?.discountPercentage ? (
                <View style={styles.modalBadge}>
                  <Text style={styles.modalBadgeText}>
                    {detailModal.campaign.discountPercentage}% OFF
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Perforated divider */}
            <View style={styles.perfRow}>
              <View style={styles.perfCircleLeft} />
              <View style={styles.perfDash} />
              <View style={styles.perfCircleRight} />
            </View>

            {/* Body */}
            <View style={styles.modalBody}>
              {detailModal.campaign?.endDate ? (
                <View style={styles.expiryRow}>
                  <Ionicons name="time-outline" size={14} color="#718096" />
                  <Text style={styles.expiryText}>
                    {formatExpiry(detailModal.campaign.endDate)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.termsDivider} />
              <Text style={styles.termsHeading}>Terms & Conditions</Text>
              <Text style={styles.termsText}>
                • Valid for one-time use only.{"\n"}
                • One coupon per member, per order.{"\n"}
                • Cannot be combined with other promotions.{"\n"}
                • Excludes gift cards and sale items.{"\n"}
                • Mint Rewards reserves the right to modify or cancel this offer at any time.
              </Text>

              <TouchableOpacity
                style={[styles.downloadBtn, isDownloading && styles.downloadBtnDisabled]}
                onPress={handleDownloadPress}
                disabled={isDownloading}
                activeOpacity={0.8}
              >
                {isDownloading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="download-outline" size={18} color="#fff" />}
                <Text style={styles.downloadBtnText}>
                  {isDownloading ? "Downloading…" : "Download Coupon"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeBtn} onPress={closeDetailModal}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
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
  logoWrapper: { position: "relative", marginBottom: 12 },
  brandLogo: { width: 90, height: 90 },
  sparkle1: { position: "absolute", top: -5,  right: -10 },
  sparkle2: { position: "absolute", bottom: 5, left: -12 },
  sparkle3: { position: "absolute", top: 10,  left: -8  },
  brandName: { fontSize: 22, fontWeight: "bold", color: "#ffffff", marginBottom: 8 },
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

  scrollContainer: { flex: 1 },
  scrollContent: { paddingTop: 24, paddingBottom: 40, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#2d3748", marginBottom: 16 },

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
  campaignCardExpired: { opacity: 0.5 },
  campaignHeader: { marginBottom: 12 },
  campaignTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  campaignName: { fontSize: 17, fontWeight: "700", color: "#2d3748", flex: 1 },
  discountBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  discountBadgeText: { color: "#ffffff", fontSize: 13, fontWeight: "bold" },
  campaignDetails: { gap: 8, marginBottom: 14 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontSize: 14, color: "#718096", flex: 1 },
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
  daysLeftText: { fontSize: 12, fontWeight: "600", color: "#e67e22" },
  redeemCta: { flexDirection: "row", alignItems: "center", gap: 4 },
  redeemCtaText: { fontSize: 14, fontWeight: "700", color: "#00528A" },

  emptyCampaigns: { alignItems: "center", paddingVertical: 60 },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#e8f4fd",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyCampaignsText: { fontSize: 18, fontWeight: "600", color: "#4a5568" },
  emptyCampaignsSubtext: {
    fontSize: 14,
    color: "#718096",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },

  // ── Detail modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  modalHeader: {
    backgroundColor: "#449EB2",
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  modalAppName: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 14,
  },
  modalLogo: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#fff" },
  modalLogoPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalLogoInitial: { color: "#fff", fontSize: 26, fontWeight: "700" },
  modalBrandName: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 8,
  },
  modalBadge: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  modalBadgeText: { color: "#449EB2", fontSize: 14, fontWeight: "700" },

  perfRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff" },
  perfCircleLeft: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.52)",
    marginLeft: -11,
  },
  perfDash: {
    flex: 1, height: 1.5,
    borderWidth: 1, borderColor: "#e0e0e0", borderStyle: "dashed",
    marginVertical: 11,
  },
  perfCircleRight: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.52)",
    marginRight: -11,
  },

  modalBody: {
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 4,
  },
  expiryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 12,
  },
  expiryText: { fontSize: 13, color: "#718096" },
  termsDivider: { height: 1, backgroundColor: "#f0f0f0", marginBottom: 14 },
  termsHeading: { fontSize: 12, fontWeight: "700", color: "#333", marginBottom: 8 },
  termsText: { fontSize: 12, color: "#718096", lineHeight: 20, marginBottom: 22 },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#449EB2",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    width: "100%",
    marginBottom: 10,
  },
  downloadBtnDisabled: { opacity: 0.65 },
  downloadBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  closeBtn: { paddingVertical: 12, width: "100%", alignItems: "center" },
  closeBtnText: { color: "#999", fontSize: 14, fontWeight: "500" },
});

export default RedeemScreen;
