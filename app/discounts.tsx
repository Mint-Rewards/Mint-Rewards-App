import { DiscountItem, useAppStore } from "@/store/store";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
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
import { Ionicons } from "@expo/vector-icons";

const isExpired = (endDate: string) => new Date(endDate) < new Date();

const formatExpiry = (endDate: string) => {
  const d = new Date(endDate);
  return `Expires on ${d.getDate()} ${d.toLocaleString("en-US", { month: "long" }).toLowerCase()}`;
};

type FilterType = "all" | "active";

const DiscountsScreen = () => {
  const { user, getDiscounts, availDiscount, markDiscountUsed, discounts, isDiscountsLoading, discountsError } = useAppStore();
  const isProfileComplete = !!(user?.phone?.trim() && user?.province?.trim() && user?.city?.trim());
  const [filter, setFilter] = useState<FilterType>("active");
  const [modal, setModal] = useState<{ visible: boolean; code: string; item: DiscountItem | null }>({
    visible: false,
    code: "",
    item: null,
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDiscounts().then((result) => {
      console.log("[Discounts] fetched:", JSON.stringify(result?.length), "items");
      if (result?.length === 0) console.log("[Discounts] 0 items returned — check campaign status in DB");
    });
  }, []);

  const available = discounts.filter((d) => !d.isAvailed && !isExpired(d.endDate));
  const used = discounts.filter((d) => d.isAvailed || isExpired(d.endDate));

  const handleAvail = async (item: DiscountItem) => {
    const code = await availDiscount(item._id);
    if (code) {
      setCopied(false);
      setModal({ visible: true, code, item });
    } else {
      Alert.alert("Error", "Could not retrieve discount code. Please try again.");
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(modal.code);
    // if (modal.item) await markDiscountUsed(modal.item._id);
    setCopied(true);
  };

  const renderCard = (item: DiscountItem, disabled: boolean, locked = false) => {
    const percentage = item.discountPercentage;
    const title = percentage
      ? `Enjoy ${percentage}% off on ${item.brand.companyName} deals`
      : `Exclusive deal from ${item.brand.companyName}`;

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
            <View style={[styles.expiryPill, (disabled || locked) && styles.expiryPillDisabled]}>
              <Text style={[styles.expiryText, (disabled || locked) && styles.textDisabled]}>
                {isExpired(item.endDate) ? "Expired" : formatExpiry(item.endDate)}
              </Text>
            </View>
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
              {item.isAvailed ? "Used" : isExpired(item.endDate) ? "Expired" : "Avail Offer"}
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
        <Text style={styles.headerTitle}>Discounts</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Filter Row */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterPill, filter === "active" && styles.filterPillActive]}
          onPress={() => setFilter("active")}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterPillText, filter === "active" && styles.filterPillTextActive]}>
            Active
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterPill, filter === "all" && styles.filterPillActive]}
          onPress={() => setFilter("all")}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterPillText, filter === "all" && styles.filterPillTextActive]}>
            All
          </Text>
        </TouchableOpacity>
      </View>

      {!isProfileComplete && (
        <TouchableOpacity
          style={styles.profilePromptCard}
          onPress={() => router.push("/editProfile")}
          activeOpacity={0.8}
        >
          <Ionicons name="person-circle-outline" size={22} color="#449EB2" />
          <Text style={styles.profilePromptText}>
            Complete your profile to unlock discounts
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#449EB2" />
        </TouchableOpacity>
      )}

      {isDiscountsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#449EB2" />
        </View>
      ) : discountsError ? (
        <View style={styles.emptyState}>
          <Ionicons name="warning-outline" size={48} color="#e53e3e" />
          <Text style={[styles.emptyTitle, { color: "#e53e3e", fontSize: 16, marginTop: 12 }]}>
            {discountsError}
          </Text>
        </View>
      ) : discounts.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="pricetag-outline" size={60} color="#449EB2" />
          </View>
          <Text style={styles.emptyTitle}>No Discounts Available{"\n"}Right Now</Text>
        </View>
      ) : available.length === 0 && filter === "active" ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="pricetag-outline" size={60} color="#449EB2" />
          </View>
          <Text style={styles.emptyTitle}>No Active Coupons</Text>
          <Text style={styles.emptySubtitle}>
            All your coupons have expired or been used.
          </Text>
          <TouchableOpacity
            style={styles.showAllButton}
            onPress={() => setFilter("all")}
            activeOpacity={0.8}
          >
            <Text style={styles.showAllButtonText}>Show All Coupons</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {available.map((item) => renderCard(item, false, !isProfileComplete))}
          {filter === "all" && used.length > 0 && available.length > 0 && (
            <View style={styles.sectionGap} />
          )}
          {filter === "all" && used.map((item) => renderCard(item, true))}
        </ScrollView>
      )}

      {/* Code Modal */}
      <Modal
        visible={modal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setModal({ ...modal, visible: false })}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setModal({ ...modal, visible: false })}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>

            {/* Brand logo */}
            {modal.item?.brand.logo ? (
              <Image source={{ uri: modal.item.brand.logo }} style={styles.modalLogo} resizeMode="contain" />
            ) : (
              <View style={styles.modalIconCircle}>
                <Text style={styles.modalLogoPlaceholderText}>
                  {modal.item?.brand.companyName?.charAt(0).toUpperCase() ?? "?"}
                </Text>
              </View>
            )}

            {/* Brand name */}
            <Text style={styles.modalBrandName}>{modal.item?.brand.companyName}</Text>

            {/* Campaign name */}
            {modal.item?.name ? (
              <Text style={styles.modalCampaignName}>{modal.item.name}</Text>
            ) : null}

            {/* Discount + expiry row */}
            <View style={styles.modalMetaRow}>
              {modal.item?.discountPercentage ? (
                <View style={styles.discountBadge}>
                  <Text style={styles.discountBadgeText}>{modal.item.discountPercentage}% OFF</Text>
                </View>
              ) : null}
              {modal.item?.endDate ? (
                <View style={styles.modalExpiryPill}>
                  <Ionicons name="time-outline" size={12} color="#449EB2" />
                  <Text style={styles.modalExpiryText}>
                    {formatExpiry(modal.item.endDate)}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.modalDivider} />

            <Text style={styles.modalCodeLabel}>Your Discount Code</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{modal.code}</Text>
            </View>

            <TouchableOpacity
              style={[styles.copyBtn, copied && styles.copyBtnCopied]}
              onPress={handleCopy}
            >
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={20} color="#fff" />
              <Text style={styles.copyBtnText}>{copied ? "Copied!" : "Copy Code"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
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
    backgroundColor: "#ffffff",
  },
  filterPillActive: {
    backgroundColor: "#449EB2",
    borderColor: "#449EB2",
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#718096",
  },
  filterPillTextActive: {
    color: "#ffffff",
  },
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
  showAllButtonText: {
    color: "#449EB2",
    fontSize: 14,
    fontWeight: "600",
  },
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
  lockedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
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
  profilePromptText: {
    flex: 1,
    fontSize: 13,
    color: "#449EB2",
    fontWeight: "500",
  },
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
  availRow: { alignItems: "center", paddingVertical: 12 },
  availText: { fontSize: 15, fontWeight: "600", color: "#449EB2" },
  availTextDisabled: { color: "#aaa" },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 24, padding: 28, width: "100%", alignItems: "center" },
  modalClose: { position: "absolute", top: 14, right: 14 },
  modalLogo: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#449EB2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  modalLogoPlaceholderText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  modalBrandName: { fontSize: 20, fontWeight: "700", color: "#222", marginBottom: 4 },
  modalCampaignName: { fontSize: 14, color: "#718096", textAlign: "center", marginBottom: 12 },
  modalMetaRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 16 },
  discountBadge: {
    backgroundColor: "#449EB2",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  discountBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  modalExpiryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e8f6fb",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#449EB2",
  },
  modalExpiryText: { fontSize: 12, color: "#449EB2", fontWeight: "500" },
  modalDivider: { height: 1, backgroundColor: "#f0f0f0", width: "100%", marginBottom: 16 },
  modalCodeLabel: { fontSize: 13, color: "#718096", fontWeight: "600", marginBottom: 8 },
  codeBox: {
    backgroundColor: "#f5f6fa",
    borderWidth: 2,
    borderColor: "#449EB2",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 18,
    width: "100%",
    alignItems: "center",
  },
  codeText: { fontSize: 22, fontWeight: "700", color: "#449EB2", letterSpacing: 3 },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#449EB2",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    width: "100%",
  },
  copyBtnCopied: { backgroundColor: "#38a169" },
  copyBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

export default DiscountsScreen;
