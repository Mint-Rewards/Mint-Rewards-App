/**
 * A round this household has already been through.
 *
 * The same card as an invitation, minus the question. Who came is still the
 * first thing on it — a household remembers the person, not the collection
 * id — and where the buttons were there is now what happened.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import type { PastCollection } from "@/hooks/usePastCollections";
import { whenLabel } from "@/utils/collectionDate";

const SLOT_LABEL: Record<string, string> = {
  MORNING: "morning",
  AFTERNOON: "afternoon",
  EVENING: "evening",
};

/** Two letters standing in for a face, as on the invitation card. */
function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

/** A date that has passed is a date, not "tomorrow". */
function pastLabel(date: string): string {
  const day = new Date(`${date}T00:00:00`);
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(day).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  return day.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

/**
 * What the household sees about the outcome.
 *
 * Every case is named, including the ones that are nobody's fault. "Nothing
 * recorded" is a real answer and better than an empty space that looks like
 * a bug.
 */
function outcome(c: PastCollection): {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tint: string;
  background: string;
  text: string;
} {
  switch (c.outcome) {
    case "collected":
      return {
        icon: "checkmark-circle",
        tint: "#0E9F6E",
        background: "#E9F7F1",
        text: c.weightKg > 0 ? `Collected · ${c.weightKg.toFixed(1)} kg` : "Collected",
      };
    case "missed":
      return {
        icon: "home-outline",
        tint: "#a06c12",
        background: "#FBF3E4",
        text: "Nobody was home",
      };
    case "declined":
      return {
        icon: "close-circle",
        tint: "#5d7481",
        background: "#F2F5F7",
        text: "You said not this time",
      };
    case "cancelled":
      return {
        icon: "alert-circle-outline",
        tint: "#C13030",
        background: "#FBEDED",
        text: "This round was called off",
      };
    default:
      return {
        icon: "ellipse-outline",
        tint: "#5d7481",
        background: "#F2F5F7",
        text: "Nothing recorded",
      };
  }
}

export default function PastCollectionCard({ collection }: { collection: PastCollection }) {
  const { captainName, captainAvatar, scheduledDate, timeSlot } = collection;
  const result = outcome(collection);

  return (
    <View style={styles.card}>
      <View style={styles.captainRow}>
        {captainAvatar ? (
          <Image source={{ uri: captainAvatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>{initials(captainName)}</Text>
          </View>
        )}

        <View style={styles.captainText}>
          <Text style={styles.captainName} numberOfLines={1}>
            {captainName ?? "Your collector"}
          </Text>
          <Text style={styles.captainRole}>
            {`${pastLabel(scheduledDate)}`}
            {SLOT_LABEL[timeSlot] ? ` · ${SLOT_LABEL[timeSlot]}` : ""}
          </Text>
        </View>
      </View>

      <View style={[styles.outcome, { backgroundColor: result.background }]}>
        <Ionicons name={result.icon} size={18} color={result.tint} />
        <Text style={[styles.outcomeText, { color: result.tint }]}>{result.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EEF1F4",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  captainRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#EEF4F7" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitials: { fontSize: 15, fontWeight: "700", color: "#449EB2" },
  captainText: { flex: 1 },
  captainName: { fontSize: 15, fontWeight: "700", color: "#0f2c3f" },
  captainRole: { fontSize: 13, color: "#5d7481", marginTop: 2, textTransform: "capitalize" },
  outcome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 13,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  outcomeText: { flex: 1, fontSize: 13.5, fontWeight: "600" },
});
