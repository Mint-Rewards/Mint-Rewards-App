import { Deal, useAppStore } from "@/store/store";
import { brandSurface } from "@/utils/brandTheme";
import { isDealExpired, mergeBrandsWithDeals } from "@/utils/deals";
import { useCouponDownload } from "@/hooks/useCouponDownload";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import { alertOnce } from "@/utils/alert";
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

const RedeemScreen = () => {
  // The iOS tab bar is absolutely positioned, so the last deal card would sit
  // underneath it without this. No-op on Android, where the bar takes layout.
  const tabBarOverflow = useBottomTabOverflow();
  const { brandId } = useLocalSearchParams();
  const {
    deals,
    getDeals,
    brands: approvedBrands,
    getBrands,
    isBrandsLoading,
  } = useAppStore();
  const { downloadCoupon, isDownloading } = useCouponDownload();

  // Approved brands are the list, deals are what each carries — so this screen
  // resolves for a brand with no live deals too, and renders the "Not Eligible
  // Yet!" state below instead of bouncing the user out as an invalid brand.
  const brand = React.useMemo(
    () =>
      mergeBrandsWithDeals(approvedBrands, deals).find(
        (b) => b._id === brandId,
      ) ?? null,
    [approvedBrands, deals, brandId],
  );

  const [detailModal, setDetailModal] = useState<{
    visible: boolean;
    deal: Deal | null;
  }>({ visible: false, deal: null });

  useEffect(() => {
    getDeals();
    getBrands();
  }, []);

  useEffect(() => {
    // Gated on the brands fetch, not the deals one: a brand can legitimately
    // have zero deals now, so `deals.length` no longer distinguishes "still
    // loading" from "this brand has nothing live".
    if (isBrandsLoading) return;
    if (!approvedBrands.length) return; // not fetched yet, or the fetch failed
    if (brand) return;
    alertOnce("Error", "Invalid brand", [
      { text: "OK", onPress: () => router.back() },
    ]);
  }, [approvedBrands, isBrandsLoading, brand]);

  const getDaysLeft = (endDate: string) => {
    const diff = new Date(endDate).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const handleDealPress = (deal: Deal) => {
    setDetailModal({ visible: true, deal });
  };

  const closeDetailModal = () =>
    setDetailModal({ visible: false, deal: null });

  const handleDownloadPress = () => {
    if (!detailModal.deal) return;
    const dealTitle = detailModal.deal.title;
    alertOnce(
      "Download & Mark as Used?",
      `This ${dealTitle} coupon is SINGLE USE. Once downloaded it will be marked as used and cannot be redeemed again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Download",
          style: "destructive",
          onPress: async () => {
            const success = await downloadCoupon(detailModal.deal!);
            if (success) {
              closeDetailModal();
              await getDeals();
            }
          },
        },
      ],
    );
  };

  // Brand colours arrive from the backend and include near-white values, so
  // every foreground on the hero is derived rather than assumed to be white.
  const surface = brandSurface(brand?.themeColor);

  return (
    <View style={styles.container}>
      <StatusBar style={surface.statusBarStyle} />

      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: surface.scrim }]}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={24} color={surface.onSurface} />
      </TouchableOpacity>

      {/* Brand Header */}
      <View
        style={[
          styles.heroSection,
          { backgroundColor: surface.background },
          surface.isLight && [
            styles.heroSectionLight,
            { borderColor: surface.hairline! },
          ],
        ]}
      >
        <View style={styles.logoWrapper}>
          <Image source={{ uri: brand?.logo }} style={styles.brandLogo} resizeMode="contain" />
        </View>
        <Text style={[styles.brandName, { color: surface.onSurface }]}>
          {brand?.brandName}
        </Text>
        {brand?.category && (
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: surface.chipBackground, borderColor: surface.chipBorder },
            ]}
          >
            <Text style={[styles.categoryText, { color: surface.onSurfaceMuted }]}>
              {brand.category}
            </Text>
          </View>
        )}
      </View>

      {/* Deal list */}
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 40 + tabBarOverflow },
        ]}
      >
        {brand?.deals && brand.deals.length > 0 && (
          <Text style={styles.sectionTitle}>Available Deals</Text>
        )}

        {brand?.deals && brand.deals.length > 0 ? (
          brand.deals.map((deal) => {
            const expired = isDealExpired(deal);
            const daysLeft = deal.endDate ? getDaysLeft(deal.endDate) : 0;
            const used = deal.isAvailed;
            const soldOut = deal.soldOut;
            const locked = expired || used || soldOut;
            return (
              <TouchableOpacity
                key={deal._id}
                style={[styles.dealCard, locked && styles.dealCardExpired]}
                activeOpacity={0.7}
                disabled={locked}
                onPress={() => handleDealPress(deal)}
              >
                <View style={styles.dealHeader}>
                  <View style={styles.dealTitleRow}>
                    <Text style={styles.dealName} numberOfLines={1}>
                      {deal.title}
                    </Text>
                    {deal.discountPercentage != null ? (
                      <LinearGradient
                        colors={["#00528A", "#0078c8"]}
                        style={styles.discountBadge}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        <Text style={styles.discountBadgeText}>
                          {deal.discountPercentage}% OFF
                        </Text>
                      </LinearGradient>
                    ) : deal.discountAmount != null ? (
                      <LinearGradient
                        colors={["#00528A", "#0078c8"]}
                        style={styles.discountBadge}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        <Text style={styles.discountBadgeText}>
                          RS {deal.discountAmount} OFF
                        </Text>
                      </LinearGradient>
                    ) : null}
                  </View>
                </View>

                <View style={styles.dealDetails}>
                  {/* A deal need not be date-bounded at either end. */}
                  {deal.startDate || deal.endDate ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={15} color="#718096" />
                      <Text style={styles.detailText}>
                        {deal.startDate
                          ? new Date(deal.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                          : "Available now"}
                        {" – "}
                        {deal.endDate
                          ? new Date(deal.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                          : "No expiry"}
                      </Text>
                    </View>
                  ) : null}
                  {deal.minimumPurchase != null && (
                    <View style={styles.detailRow}>
                      <Ionicons name="cart-outline" size={15} color="#718096" />
                      <Text style={styles.detailText} numberOfLines={1}>
                        Minimum purchase Rs {deal.minimumPurchase}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.dealFooter}>
                  {used ? (
                    <View style={styles.usedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#38a169" />
                      <Text style={styles.usedBadgeText}>Used</Text>
                    </View>
                  ) : soldOut ? (
                    <View style={styles.daysLeftBadge}>
                      <Ionicons name="close-circle-outline" size={14} color="#aaa" />
                      <Text style={[styles.daysLeftText, { color: "#aaa" }]}>Sold Out</Text>
                    </View>
                  ) : (
                    <View style={styles.daysLeftBadge}>
                      <Ionicons name="time-outline" size={14} color={expired ? "#aaa" : "#e67e22"} />
                      <Text style={[styles.daysLeftText, expired && { color: "#aaa" }]}>
                        {expired
                          ? "Expired"
                          : !deal.endDate
                            ? "No expiry"
                            : daysLeft > 0
                              ? `${daysLeft} days left`
                              : "Ending soon"}
                      </Text>
                    </View>
                  )}
                  {!locked && (
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
          <View style={styles.emptyDeals}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="lock-closed" size={40} color="#00528A" />
            </View>
            <Text style={styles.emptyDealsText}>Not Eligible Yet!</Text>
            <Text style={styles.emptyDealsSubtext}>
              Start collecting points to unlock exclusive deals from {brand?.companyName}.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Deal detail modal */}
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
              {detailModal.deal?.discountPercentage != null ? (
                <View style={styles.modalBadge}>
                  <Text style={styles.modalBadgeText}>
                    {detailModal.deal.discountPercentage}% OFF
                  </Text>
                </View>
              ) : detailModal.deal?.discountAmount != null ? (
                <View style={styles.modalBadge}>
                  <Text style={styles.modalBadgeText}>
                    RS {detailModal.deal.discountAmount} OFF
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
              {detailModal.deal?.endDate ? (
                <View style={styles.expiryRow}>
                  <Ionicons name="time-outline" size={14} color="#718096" />
                  <Text style={styles.expiryText}>
                    {formatExpiry(detailModal.deal.endDate)}
                  </Text>
                </View>
              ) : null}

              {detailModal.deal?.minimumPurchase != null ? (
                <View style={styles.expiryRow}>
                  <Ionicons name="cart-outline" size={14} color="#718096" />
                  <Text style={styles.expiryText}>
                    Minimum purchase Rs {detailModal.deal.minimumPurchase}
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

              {detailModal.deal?.isAvailed ? (
                <View style={styles.alreadyUsedBox}>
                  <Ionicons name="checkmark-circle" size={20} color="#38a169" />
                  <Text style={styles.alreadyUsedText}>
                    You have already downloaded and used this coupon.
                  </Text>
                </View>
              ) : (
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
              )}

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
  // A near-white brand colour has no edge against the page behind it, so the
  // sheet earns one from a hairline and a low shadow instead of from contrast.
  heroSectionLight: {
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  logoWrapper: { position: "relative", marginBottom: 12 },
  brandLogo: { width: 90, height: 90 },
  brandName: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  categoryBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  scrollContainer: { flex: 1 },
  scrollContent: { paddingTop: 24, paddingBottom: 40, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#2d3748", marginBottom: 16 },

  dealCard: {
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
  dealCardExpired: { opacity: 0.5 },
  dealHeader: { marginBottom: 12 },
  dealTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dealName: { fontSize: 17, fontWeight: "700", color: "#2d3748", flex: 1 },
  discountBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  discountBadgeText: { color: "#ffffff", fontSize: 13, fontWeight: "bold" },
  dealDetails: { gap: 8, marginBottom: 14 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontSize: 14, color: "#718096", flex: 1 },
  dealFooter: {
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

  emptyDeals: { alignItems: "center", paddingVertical: 60 },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#e8f4fd",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyDealsText: { fontSize: 18, fontWeight: "600", color: "#4a5568" },
  emptyDealsSubtext: {
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
  usedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f0fff4",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c6f6d5",
  },
  usedBadgeText: { fontSize: 12, fontWeight: "600", color: "#38a169" },
  alreadyUsedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f0fff4",
    borderWidth: 1,
    borderColor: "#c6f6d5",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  alreadyUsedText: { flex: 1, fontSize: 14, color: "#276749", lineHeight: 20 },
  closeBtn: { paddingVertical: 12, width: "100%", alignItems: "center" },
  closeBtnText: { color: "#999", fontSize: 14, fontWeight: "500" },
});

export default RedeemScreen;
