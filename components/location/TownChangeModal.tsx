/**
 * "Did you move, or is the area name wrong?" — the Issue 9 prompt.
 *
 * A town edit no longer clears the pin (owner ruling, 2026-08-26), because
 * under Province -> City -> Pin -> town the pin PRODUCES the town, so clearing
 * it on a town edit destroyed the evidence being corrected and left the user
 * unable to save. That ruling stands. What it leaves behind is a case the app
 * cannot read from form state alone: someone who genuinely moved house inside
 * one city can change their town and keep a pin describing where they used to
 * live. For a collection service the pin is the routing field, so that is a
 * truck at the wrong door.
 *
 * The two edits look identical to the code and are obvious to the person
 * making them, so this asks instead of guessing. `townChangeNeedsConfirm` keeps
 * it rare: it fires only on a rehydrated pin under a town nothing this session
 * derived, which means the common case — correcting a geocoder mistake on a pin
 * just placed — is never interrupted.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  visible: boolean;
  /** The town being moved away from, so the question names something concrete. */
  currentTown: string;
  /** "I moved" — the address changed, so the coordinate is wrong. */
  onMoved: () => void;
  /** "The area name is wrong" — today's behaviour: keep the pin, apply the edit. */
  onRelabel: () => void;
  /** Dismissal backs out of the edit entirely rather than picking for the user. */
  onCancel: () => void;
}

export function TownChangeModal({
  visible,
  currentTown,
  onMoved,
  onRelabel,
  onCancel,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android back must not be a silent third answer: it cancels, which is
      // the only outcome that changes nothing.
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Are you changing your area?</Text>
          <Text style={styles.subtitle}>
            {currentTown
              ? `Your saved pin was placed while your area was "${currentTown}". Which of these is it?`
              : "Your saved pin was placed under your previous area. Which of these is it?"}
          </Text>

          <TouchableOpacity
            style={styles.option}
            onPress={onMoved}
            testID="town-change-moved"
          >
            <Ionicons name="home-outline" size={22} color="#0B3B3B" />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>I&apos;ve moved house</Text>
              <Text style={styles.optionBody}>
                We&apos;ll clear your pin so you can drop it at your new address.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.option, styles.optionQuiet]}
            onPress={onRelabel}
            testID="town-change-relabel"
          >
            <Ionicons name="pricetag-outline" size={22} color="#FFFFFF" />
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, styles.optionTitleQuiet]}>
                The area name is wrong
              </Text>
              <Text style={[styles.optionBody, styles.optionBodyQuiet]}>
                Same address, wrong label. We&apos;ll keep your pin exactly where it is.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancel}
            onPress={onCancel}
            testID="town-change-cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0E4C4C",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 34,
    gap: 12,
  },
  title: { fontSize: 26, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.4 },
  subtitle: { fontSize: 16, color: "#BFE0DA", lineHeight: 23, marginBottom: 6 },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    backgroundColor: "#9FD8C8",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  optionQuiet: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  optionText: { flex: 1, gap: 3 },
  optionTitle: { fontSize: 17, fontWeight: "700", color: "#0B3B3B" },
  optionTitleQuiet: { color: "#FFFFFF" },
  optionBody: { fontSize: 14, lineHeight: 20, color: "#2C5C55" },
  optionBodyQuiet: { color: "#BFE0DA" },
  cancel: { alignItems: "center", paddingVertical: 12 },
  cancelText: { fontSize: 16, fontWeight: "600", color: "#BFE0DA" },
});
