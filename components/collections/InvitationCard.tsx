/**
 * A collection this household has been asked about, and its answer.
 *
 * The answer is the point. Until now it could only be recorded by an admin
 * typing it in after a phone call; accepting here is the household's own word,
 * and it reaches the operations console the moment it is tapped.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { AnswerState, Invitation } from "@/hooks/useInvitations";
import { whenLabel } from "@/utils/collectionDate";

const SLOT_LABEL: Record<string, string> = {
  MORNING: "morning",
  AFTERNOON: "afternoon",
  EVENING: "evening",
};

/** Shown only while the remaining time is the pressing fact. */
function deadlineLabel(deadline: string | null): string | null {
  if (!deadline) return null;
  const hours = (new Date(deadline).getTime() - Date.now()) / 3_600_000;
  if (hours < 0) return null;
  if (hours < 1) return "Please reply within the hour";
  if (hours >= 24) return null;
  // Rounded UP, and the comparisons use the unrounded value. A deadline three
  // hours away is 2.999 by the time this renders, and flooring it told the
  // household they had two hours — under-reporting the time someone has is the
  // wrong direction to be wrong about a deadline.
  const whole = Math.ceil(hours);
  return `Please reply within ${whole} hour${whole === 1 ? "" : "s"}`;
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
  const { collectionId, scheduledDate, timeSlot, status, captainName, state } =
    invitation;
  const captainAvatar = invitation.captainAvatar;
  const enRoute = invitation.collectionStatus === "IN_PROGRESS";
  const busy = answering[collectionId] === "sending";
  const failed = answering[collectionId] === "failed";
  // Only while an answer is still possible. A deadline on a round already
  // under way is noise at best, and a prompt to do something impossible at
  // worst.
  const deadline =
    state === "answerable" ? deadlineLabel(invitation.responseDeadlineAt) : null;

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

      {/*
        Who is at the door, rather than only their name.
        Shown once there is both a photograph and a name — most captains have
        neither yet, and a grey circle with nothing in it tells a household
        less than the sentence above already did.
      */}
      {captainAvatar && captainName ? (
        <View style={styles.captain}>
          <Image source={{ uri: captainAvatar }} style={styles.captainPhoto} />
          <View style={styles.captainText}>
            <Text style={styles.captainName}>{captainName}</Text>
            <Text style={styles.captainRole}>
              {enRoute ? "On the way to you" : "Your collector"}
            </Text>
          </View>
        </View>
      ) : null}

      {deadline ? <Text style={styles.deadline}>{deadline}</Text> : null}

      {state === "answerable" ? (
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
            {status !== "ACCEPTED"
              ? "You said not this time."
              : enRoute
                ? // The question a household actually has on the day, which
                  // this screen could not answer at all until now.
                  `${captainName ?? "Your captain"} is on the way. Please have your bags out.`
                : "You are on the round. Please leave your bags out."}
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

      {/* Only while the answer window is open. Once the round is READY or
          rolling, the server refuses a late change and a button that cannot
          work is worse than no button. */}
      {state === "declined" && invitation.collectionStatus === "CONFIRMING" ? (
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
  captain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    padding: 10,
    backgroundColor: "#f4f8fb",
    borderRadius: 10,
  },
  captainPhoto: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#dbe3ea" },
  captainText: { flex: 1 },
  captainName: { fontSize: 14, fontWeight: "700", color: "#0f2c3f" },
  captainRole: { fontSize: 12, color: "#5d7481", marginTop: 1 },
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
