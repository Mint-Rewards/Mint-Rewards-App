/**
 * "Finish your profile" — the gate a user meets when they have NO saved pin.
 *
 * A checklist rather than a form: it names what is missing and routes to it,
 * because the fields live on screens that already know how to collect them.
 * Someone who DOES have a pin never sees this — they get the confirm-address
 * modal instead, which can finish the job inline.
 *
 * The mockup carries a "+100 POINTS" badge and a "Continue & earn 100 points"
 * CTA. Both are omitted deliberately: `points` exists on the user model and
 * nothing anywhere awards it, so the copy would promise something the system
 * cannot pay. Owner decision, 2026-08-25 — the badge returns when the award does.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { MissingField } from "@/utils/locationGate";
import type { ProfileFocusTarget } from "@/utils/profileFocus";

/**
 * The checklist the user sees, which is NOT one row per missing field.
 *
 * City, town, sub-area and house number are one question to a person — "where
 * should we collect from" — so they collapse into a single "Pickup address"
 * row. The pin is its own row because it is its own interaction: it opens a map.
 * Name and email come from signup, so they are normally already ticked, which is
 * what makes a fresh account read "2 of 5 complete".
 */
const ROWS: {
  key: string;
  label: string;
  covers: MissingField[];
  /**
   * Where Edit Profile should jump to when this row is tapped. Null for rows
   * that can never be outstanding, so they are never tappable.
   */
  focus: ProfileFocusTarget | null;
}[] = [
  { key: "userName", label: "Name", covers: ["userName"], focus: "userName" },
  // Read-only on the form and set at signup: it has no gap to route to.
  { key: "email", label: "Email", covers: [], focus: null },
  { key: "phone", label: "Phone Number", covers: ["phone"], focus: "phone" },
  {
    key: "address",
    label: "Pickup address",
    covers: ["city", "town", "subArea", "houseNo"],
    focus: "address",
  },
  { key: "pin", label: "Map pin", covers: ["pin"], focus: "pin" },
];

interface Props {
  visible: boolean;
  missing: MissingField[];
  /** Whether a skip is offered. False under a "hard" gate. */
  dismissible: boolean;
  onContinue: () => void;
  /**
   * An outstanding row was tapped. Same destination as Continue, but says which
   * gap the user pointed at so the form can open on it.
   */
  onSelectRow: (focus: ProfileFocusTarget) => void;
  onDismiss: () => void;
}

export function FinishProfileModal({
  visible,
  missing,
  dismissible,
  onContinue,
  onSelectRow,
  onDismiss,
}: Props) {
  const rows = ROWS.map((row) => ({
    ...row,
    done: !row.covers.some((field) => missing.includes(field)),
  }));

  const doneCount = rows.filter((r) => r.done).length;
  const remaining = rows.length - doneCount;
  const progress = doneCount / rows.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android's back button must route through the same path as any other
      // dismissal, or a hard gate is trivially bypassed by pressing back.
      onRequestClose={dismissible ? onDismiss : () => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Finish your profile</Text>
          <Text style={styles.subtitle}>
            {remaining === 1
              ? "One detail left before you can book a pickup."
              : `${remaining} details left before you can book a pickup.`}
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {doneCount} of {rows.length} complete
          </Text>

          <View style={styles.rows}>
            {rows.map((row) => {
              // An outstanding row is a button; a finished one is not. The
              // chevron already promised this — it rendered on exactly the
              // outstanding rows while nothing was listening for a tap.
              const target = row.done ? null : row.focus;
              const Row = target ? TouchableOpacity : View;
              return (
                <Row
                  key={row.key}
                  style={[styles.row, row.done && styles.rowDone]}
                  {...(target
                    ? {
                        onPress: () => onSelectRow(target),
                        activeOpacity: 0.85,
                        accessibilityRole: "button" as const,
                        accessibilityLabel: `${row.label}, not filled in. Opens your profile to complete it.`,
                      }
                    : {})}
                >
                  {row.done ? (
                    <Ionicons name="checkmark" size={18} color="#9FD8C8" />
                  ) : null}
                  <Text style={[styles.rowLabel, row.done && styles.rowLabelDone]}>
                    {row.label}
                  </Text>
                  {target ? (
                    <Ionicons name="chevron-forward" size={18} color="#CFE9E2" />
                  ) : null}
                </Row>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.cta}
            onPress={onContinue}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>Continue</Text>
          </TouchableOpacity>

          {dismissible ? (
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.skip}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>Not now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0E4C4C",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 34,
    gap: 6,
  },
  title: { fontSize: 32, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 },
  subtitle: { fontSize: 17, color: "#BFE0DA", lineHeight: 24, marginBottom: 14 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: "#7FCBB4" },
  progressLabel: { fontSize: 14, color: "#BFE0DA", marginTop: 8, marginBottom: 8 },
  rows: { gap: 10, marginTop: 6, marginBottom: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  rowDone: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "transparent" },
  rowLabel: { flex: 1, fontSize: 17, fontWeight: "700", color: "#FFFFFF" },
  rowLabelDone: {
    color: "#8FB5B0",
    fontWeight: "500",
    textDecorationLine: "line-through",
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
