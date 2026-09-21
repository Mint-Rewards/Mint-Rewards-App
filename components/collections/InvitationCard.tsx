/**
 * A collection this household has been asked about, and its answer.
 *
 * The answer is the point. Until now it could only be recorded by an admin
 * typing it in after a phone call; accepting here is the household's own word,
 * and it reaches the operations console the moment it is tapped.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { AnswerState, Invitation } from "@/hooks/useInvitations";

const SLOT_LABEL: Record<string, string> = {
  MORNING: "morning",
  AFTERNOON: "afternoon",
  EVENING: "evening",
};

/** "Tomorrow" beats a date nobody should have to decode. */
function whenLabel(date: string): string {
  const day = new Date(`${date}T00:00:00`);
  const today = new Date();
  const days = Math.round(
    (new Date(day).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

/** Shown only while the remaining time is the pressing fact. */
function deadlineLabel(deadline: string | null): string | null {
  if (!deadline) return null;
  const hours = Math.floor((new Date(deadline).getTime() - Date.now()) / 3_600_000);
  if (hours < 0) return null;
  if (hours < 1) return "Please reply within the hour";
  if (hours < 24) return `Please reply within ${hours} hour${hours === 1 ? "" : "s"}`;
  return null;
}

export default function InvitationCard({
  invitation,
  answering,
  onRespond,
}: {
  invitation: Invitation;
  answering: AnswerState;
  onRespond: (collectionId: number, response: "ACCEPTED" | "DECLINED") => void;
}) {
  const { collectionId, scheduledDate, timeSlot, status, captainName } = invitation;
  const busy = answering[collectionId] === "sending";
  const failed = answering[collectionId] === "failed";
  const deadline = status === "INVITED" ? deadlineLabel(invitation.responseDeadlineAt) : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="leaf-outline" size={18} color="#00528A" />
        <Text style={styles.title}>Collection {whenLabel(scheduledDate)}</Text>
      </View>

      <Text style={styles.detail}>
        {`We are collecting in your area ${whenLabel(scheduledDate)}`}
        {SLOT_LABEL[timeSlot] ? ` in the ${SLOT_LABEL[timeSlot]}` : ""}
        {captainName ? `, with ${captainName}` : ""}.
      </Text>

      {deadline ? <Text style={styles.deadline}>{deadline}</Text> : null}

      {status === "INVITED" ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.accept, busy && styles.busy]}
            onPress={() => onRespond(collectionId, "ACCEPTED")}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Accept this collection"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color="#ffffff" />
                <Text style={styles.acceptText}>Yes, collect from me</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.decline, busy && styles.busy]}
            onPress={() => onRespond(collectionId, "DECLINED")}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Decline this collection"
          >
            <Text style={styles.declineText}>Not this time</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.answered}>
          <Ionicons
            name={status === "ACCEPTED" ? "checkmark-circle" : "close-circle"}
            size={16}
            color={status === "ACCEPTED" ? "#0d9c80" : "#8ea0aa"}
          />
          <Text style={styles.answeredText}>
            {status === "ACCEPTED"
              ? "You are on the round. Please leave your bags out."
              : "You said not this time."}
          </Text>
        </View>
      )}

      {/* Only when an answer failed to reach the server. The household has
          tapped, and must not be left believing it was recorded. */}
      {failed ? (
        <Text style={styles.failed}>
          That did not reach us. Please check your connection and try again.
        </Text>
      ) : null}

      {status === "DECLINED" ? (
        <TouchableOpacity
          style={styles.changeMind}
          onPress={() => onRespond(collectionId, "ACCEPTED")}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.changeMindText}>Actually, collect from me</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#dbe3ea",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  title: { fontSize: 15, fontWeight: "700", color: "#00528A" },
  detail: { fontSize: 14, color: "#475569", lineHeight: 20 },
  deadline: { fontSize: 12, color: "#a06c12", marginTop: 8, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  busy: { opacity: 0.7 },
  accept: { flex: 1, backgroundColor: "#00528A" },
  acceptText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  decline: { paddingHorizontal: 16, backgroundColor: "#f1f5f9" },
  declineText: { color: "#475569", fontWeight: "600", fontSize: 14 },
  answered: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  answeredText: { flex: 1, fontSize: 13, color: "#475569", lineHeight: 18 },
  failed: { marginTop: 10, fontSize: 12.5, color: "#c33a30", lineHeight: 17 },
  changeMind: { marginTop: 10, alignSelf: "flex-start" },
  changeMindText: { color: "#00528A", fontWeight: "600", fontSize: 13 },
});
