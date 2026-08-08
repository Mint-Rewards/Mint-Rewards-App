import { Deal, useAppStore } from "@/store/store";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { isProfileComplete } from "@/utils/profile";
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
import { Ionicons } from "@expo/vector-icons";
import { useCouponDownload } from "@/hooks/useCouponDownload";
import { dealCtaLabel, isDealExpired, partitionDeals } from "@/utils/deals";

const formatExpiry = (endDate: string) => {
  const d = new Date(endDate);
  return `Expires ${d.getDate()} ${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`;
};

type FilterType = "all" | "active";

const DealsScreen = () => {
  const { user, getDeals, deals, isDealsLoading, dealsError } = useAppStore();
  const profileComplete = isProfileComplete(user);

  const [filter, setFilter] = useState<FilterType>("active");
  const [couponModal, setCouponModal] = useState<{
    visible: boolean;
    item: Deal | null;
  }>({ visible: false, item: null });

  const { downloadCoupon, isDownloading } = useCouponDownload();

  useEffect(() => {
    getDeals();
  }, []);

  // Claimed and sold-out deals drop out of Active and reappear, greyed, under
  // All — the same bucketing used/expired coupons always had.
  const { available, used } = partitionDeals(deals);

  const handleAvail = (item: Deal) => {
    setCouponModal({ visible: true, item });
  };

  const closeCouponModal = () =>
    setCouponModal({ visible: false, item: null });

  const handleDownloadPress = () => {
    if (!couponModal.item) return;
    const brandName = couponModal.item.brand.companyName;
    Alert.alert(
      "Download & Mark as Used?",
      `This ${brandName} coupon is SINGLE USE. Once downloaded it will be marked as used and cannot be redeemed again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Download",
          style: "destructive",
          onPress: async () => {
            const success = await downloadCoupon(couponModal.item!);
            if (success) {
              closeCouponModal();
              await getDeals();
            }
          },
        },
      ],
    );
  };

  const renderCard = (item: Deal, disabled: boolean, locked = false) => {
    // The brand writes the title in BrandHub; it is not synthesized here.
    const title = item.title;

    return (
      <View key={item._id} style={[styles.card, (disabled || locked) && styles.cardDisabled]}>
        <View style={styles.cardBody}>
          {item.brand.logo ? (
            <Image source={{ uri: item.brand.logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoPlaceholderText}>
                {item.brand.companyName?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={[styles.cardTitle, (disabled || locked) && styles.textDisabled]} numberOfLines={2}>
              {title}
            </Text>
            {/* A deal need not be date-bounded — no end date, no pill. */}
            {item.endDate ? (
              <View style={[styles.expiryPill, (disabled || locked) && styles.expiryPillDisabled]}>
                <Text style={[styles.expiryText, (disabled || locked) && styles.textDisabled]}>
                  {isDealExpired(item) ? "Expired" : formatExpiry(item.endDate)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.availRow}
          disabled={disabled}
          onPress={() => locked ? router.push("/editProfile") : handleAvail(item)}
          activeOpacity={0.7}
        >
          {locked ? (
            <View style={styles.lockedRow}>
              <Ionicons name="lock-closed" size={14} color="#aaa" />
              <Text style={styles.availTextDisabled}>Complete profile to unlock</Text>
            </View>
          ) : (
            <Text style={[styles.availText, disabled && styles.availTextDisabled]}>
              {dealCtaLabel(item)}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deals</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Filter Row */}
      <View style={styles.filterRow}>
        {(["active", "all"] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterPill, filter === f && styles.filterPillActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
              {f === "active" ? "Active" : "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!profileComplete && (
        <TouchableOpacity
          style={styles.profilePromptCard}
          onPress={() => router.push("/editProfile")}
          activeOpacity={0.8}
        >
          <Ionicons name="person-circle-outline" size={22} color="#449EB2" />
          <Text style={styles.profilePromptText}>
            Complete your profile to unlock deals
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#449EB2" />
        </TouchableOpacity>
      )}

      {isDealsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#449EB2" />
        </View>
      ) : dealsError ? (
        <View style={styles.emptyState}>
          <Ionicons name="warning-outline" size={48} color="#e53e3e" />
          <Text style={[styles.emptyTitle, { color: "#e53e3e", fontSize: 16, marginTop: 12 }]}>
            {dealsError}
          </Text>
        </View>
      ) : deals.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="pricetag-outline" size={60} color="#449EB2" />
          </View>
          <Text style={styles.emptyTitle}>No Deals Available{"\n"}Right Now</Text>
        </View>
      ) : available.length === 0 && filter === "active" ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="pricetag-outline" size={60} color="#449EB2" />
          </View>
          <Text style={styles.emptyTitle}>No Active Deals</Text>
          <Text style={styles.emptySubtitle}>All your deals have expired or been used.</Text>
          <TouchableOpacity
            style={styles.showAllButton}
            onPress={() => setFilter("all")}
            activeOpacity={0.8}
          >
            <Text style={styles.showAllButtonText}>Show All Deals</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {available.map((item) => renderCard(item, false, !profileComplete))}
          {filter === "all" && used.length > 0 && available.length > 0 && (
            <View style={styles.sectionGap} />
          )}
          {filter === "all" && used.map((item) => renderCard(item, true))}
        </ScrollView>
      )}

      {/* ── Step 1: Coupon detail modal ── */}
      <Modal
        visible={couponModal.visible}
        transparent
        animationType="slide"
        onRequestClose={closeCouponModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.couponSheet}>

            {/* Teal header */}
            <View style={styles.couponHeader}>
              <Text style={styles.couponAppName}>MINT REWARDS</Text>
              {couponModal.item?.brand.logo ? (
                <Image
                  source={{ uri: couponModal.item.brand.logo }}
                  style={styles.couponLogo}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.couponLogoPlaceholder}>
                  <Text style={styles.couponLogoInitial}>
                    {couponModal.item?.brand.companyName?.charAt(0).toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              <Text style={styles.couponBrandName}>{couponModal.item?.brand.companyName}</Text>
              {/* A Discount-type deal states a percentage or a fixed amount. */}
              {couponModal.item?.discountPercentage != null ? (
                <View style={styles.couponBadge}>
                  <Text style={styles.couponBadgeText}>
                    {couponModal.item.discountPercentage}% OFF
                  </Text>
                </View>
              ) : couponModal.item?.discountAmount != null ? (
                <View style={styles.couponBadge}>
                  <Text style={styles.couponBadgeText}>
                    RS {couponModal.item.discountAmount} OFF
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Perforation */}
            <View style={styles.perfRow}>
              <View style={styles.perfCircleLeft} />
              <View style={styles.perfDash} />
              <View style={styles.perfCircleRight} />
            </View>

            {/* Body */}
            <View style={styles.couponBody}>
              {couponModal.item?.endDate ? (
                <View style={styles.expiryRow}>
                  <Ionicons name="time-outline" size={14} color="#718096" />
                  <Text style={styles.couponExpiry}>
                    {formatExpiry(couponModal.item.endDate)}
                  </Text>
                </View>
              ) : null}

              {/* Conditions the card deliberately leaves off, so a deal card
                  stays visually identical whatever shape the deal takes. */}
              {couponModal.item?.minimumPurchase != null ? (
                <View style={styles.expiryRow}>
                  <Ionicons name="cart-outline" size={14} color="#718096" />
                  <Text style={styles.couponExpiry}>
                    Minimum purchase Rs {couponModal.item.minimumPurchase}
                  </Text>
                </View>
              ) : null}

              {/* Present once claimed. The PDF carries the same code. */}
              {couponModal.item?.code ? (
                <View style={styles.codeBox}>
                  <Text style={styles.codeLabel}>YOUR CODE</Text>
                  <Text style={styles.codeValue}>{couponModal.item.code}</Text>
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

              <TouchableOpacity style={styles.closeBtn} onPress={closeCouponModal}>
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
  container: { flex: 1, backgroundColor: "#fff" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#333" },

  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  filterPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#d0d0d0",
    backgroundColor: "#fff",
  },
  filterPillActive: { backgroundColor: "#449EB2", borderColor: "#449EB2" },
  filterPillText: { fontSize: 14, fontWeight: "600", color: "#718096" },
  filterPillTextActive: { color: "#fff" },

  profilePromptCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F8FF",
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#D0E8F5",
    gap: 8,
  },
  profilePromptText: { flex: 1, fontSize: 13, color: "#449EB2", fontWeight: "500" },

  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e8f6fb",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#333", textAlign: "center", lineHeight: 28 },
  emptySubtitle: {
    fontSize: 14,
    color: "#718096",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  showAllButton: {
    borderWidth: 1.5,
    borderColor: "#449EB2",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 22,
  },
  showAllButtonText: { color: "#449EB2", fontSize: 14, fontWeight: "600" },

  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  sectionGap: { height: 8 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardDisabled: { opacity: 0.5 },
  cardBody: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 24 },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#449EB2",
    justifyContent: "center",
    alignItems: "center",
  },
  logoPlaceholderText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  cardInfo: { flex: 1, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#222", lineHeight: 20 },
  textDisabled: { color: "#999" },
  expiryPill: {
    alignSelf: "flex-start",
    backgroundColor: "#e8f6fb",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#449EB2",
  },
  expiryPillDisabled: { borderColor: "#ccc", backgroundColor: "#f5f5f5" },
  expiryText: { fontSize: 12, color: "#449EB2", fontWeight: "500" },
  divider: { height: 1, backgroundColor: "#f0f0f0", marginHorizontal: 14 },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  availRow: { alignItems: "center", paddingVertical: 12 },
  availText: { fontSize: 15, fontWeight: "600", color: "#449EB2" },
  availTextDisabled: { color: "#aaa" },

  // ── Coupon detail modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  couponSheet: {
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
  couponHeader: {
    backgroundColor: "#449EB2",
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  couponAppName: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 14,
  },
  couponLogo: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#fff" },
  couponLogoPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  couponLogoInitial: { color: "#fff", fontSize: 26, fontWeight: "700" },
  couponBrandName: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 8,
  },
  couponBadge: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  couponBadgeText: { color: "#449EB2", fontSize: 14, fontWeight: "700" },

  perfRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff" },
  perfCircleLeft: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.52)",
    marginLeft: -11,
  },
  perfDash: {
    flex: 1,
    height: 1.5,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderStyle: "dashed",
    marginVertical: 11,
  },
  perfCircleRight: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.52)",
    marginRight: -11,
  },

  couponBody: {
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
  couponExpiry: {
    fontSize: 13,
    color: "#718096",
  },
  codeBox: {
    backgroundColor: "#003E47",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: "center",
    marginTop: 14,
    marginBottom: 4,
  },
  codeLabel: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "600",
    color: "rgba(255,255,255,0.65)",
    marginBottom: 6,
  },
  codeValue: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 3,
    color: "#fff",
  },
  termsDivider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginBottom: 14,
  },
  termsHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  termsText: {
    fontSize: 12,
    color: "#718096",
    lineHeight: 20,
    marginBottom: 22,
  },
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

export default DealsScreen;
