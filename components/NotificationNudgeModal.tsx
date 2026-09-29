/**
 * "Turn on notifications" — the sheet, with no policy in it.
 *
 * Presentation only: whether it is due is `shouldNudgeForNotifications`, and
 * whether the button prompts or opens Settings is the caller's. Same split,
 * and the same visual language, as FinishProfileModal — the two are asking
 * the same kind of favour and should not look like different apps.
 */
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface Props {
  visible: boolean;
  /**
   * True once the system prompt is spent, so the button has to lead to
   * Settings. Changes the copy as well as the action: "Allow notifications"
   * on a button that opens Settings is a small lie, and the user is left
   * hunting for a dialog that will never appear.
   */
  needsSettings: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

export function NotificationNudgeModal({
  visible,
  needsSettings,
  onEnable,
  onDismiss,
}: Props) {
  return (
    /*
     * Backdrop tap and drag-down are a dismissal, the same as "Not now" —
     * which stays, because it is the honest label for what it does and
     * spends one of the two the gate allows.
     */
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      style={styles.sheet}
      extraInset={34}
      handleTint="light"
    >
      <>
          <View style={styles.iconRing}>
            <Ionicons name="notifications" size={28} color="#0B3B3B" />
          </View>

          <Text style={styles.title}>Turn on notifications</Text>
          {/*
            Concrete about what they miss, not "stay updated". The things this
            app sends are time-bound and physical — a van is on its way to
            their gate — so the cost of having them off is a missed collection,
            and that is the honest reason to ask.
          */}
          <Text style={styles.subtitle}>
            We use notifications to tell you when a collection is booked, when
            the van is on its way, and if a pickup is cancelled. With them off,
            you will not hear from us and could be out when we arrive.
          </Text>

          {needsSettings ? (
            <Text style={styles.hint}>
              Notifications are switched off for Mint Rewards. You can turn
              them back on in your phone&apos;s settings.
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.cta}
            onPress={onEnable}
            activeOpacity={0.85}
            accessibilityRole="button"
            testID="notification-nudge-enable"
          >
            <Text style={styles.ctaText}>
              {needsSettings ? "Open settings" : "Allow notifications"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skip}
            onPress={onDismiss}
            accessibilityRole="button"
            testID="notification-nudge-dismiss"
          >
            <Text style={styles.skipText}>Not now</Text>
          </TouchableOpacity>
      </>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#0E4C4C",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 6,
  },
  iconRing: {
    alignSelf: "flex-start",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#9FD8C8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: { fontSize: 30, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: "#BFE0DA", lineHeight: 23, marginBottom: 18 },
  hint: {
    fontSize: 14,
    color: "#9FD8C8",
    lineHeight: 20,
    marginTop: -8,
    marginBottom: 18,
  },
  cta: {
    backgroundColor: "#9FD8C8",
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
  },
  ctaText: { fontSize: 18, fontWeight: "700", color: "#0B3B3B" },
  skip: { alignItems: "center", paddingTop: 14 },
  skipText: { fontSize: 15, color: "#BFE0DA" },
});
