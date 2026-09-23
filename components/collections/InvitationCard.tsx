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

/**
 * Two letters standing in for a face.
 *
 * Holding the space either way means the card does not rearrange itself the
 * day a photograph is added, and initials say more than a grey disc does.
 */
function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

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
      {/*
        Who is coming, first and largest.
        The question being asked is "may a stranger come to your door on
        Saturday", and the answer to "which stranger" belongs above the ask
        rather than in a clause halfway through a sentence.
      */}
      <View style={styles.captainRow}>
        {captainAvatar ? (
          <Image source={{ uri: captainAvatar }} style={styles.avatar} />
        ) : (
          // Initials rather than a grey disc: the space is held either way,
          // so the card does not rearrange itself the day a photo is added.
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>{initials(captainName)}</Text>
          </View>
        )}

        <View style={styles.captainText}>
          <Text style={styles.captainName} numberOfLines={1}>
            {captainName ?? "Your collector"}
          </Text>
          <Text style={styles.captainRole}>
            {enRoute ? "On the way to you now" : "Your collector"}
          </Text>
        </View>

        <View style={styles.whenPill}>
          <Text style={styles.whenPillText}>{whenLabel(scheduledDate)}</Text>
        </View>
      </View>

      <View style={styles.rule} />

      <View style={styles.detailRow}>
        <Ionicons name="time-outline" size={16} color="#5d7481" />
        <Text style={styles.detail}>
          {`Collecting in your area ${whenLabel(scheduledDate)}`}
          {SLOT_LABEL[timeSlot] ? ` in the ${SLOT_LABEL[timeSlot]}` : ""}.
        </Text>
      </View>

      {deadline ? (
        <View style={styles.deadlineRow}>
          <Ionicons name="alert-circle-outline" size={16} color="#a06c12" />
          <Text style={styles.deadline}>{deadline}</Text>
        </View>
      ) : null}

      {state === "answerable" ? (
        <View style={styles.actions}>
          {/*
            Colour carries the meaning, not just the words. Yes is green and
            filled because it is the answer being asked for; no is outlined
            in red because it is a real choice and not a cancel.
          */}
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
                <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
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
            <Ionicons name="close-circle-outline" size={18} color="#C13030" />
            <Text style={styles.declineText}>Not this time</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={[
            styles.answered,
            status === "ACCEPTED" ? styles.answeredYes : styles.answeredNo,
          ]}
        >
          <Ionicons
            name={status === "ACCEPTED" ? "checkmark-circle" : "close-circle"}
            size={18}
            color={status === "ACCEPTED" ? "#0E9F6E" : "#8ea0aa"}
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
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EEF1F4",
    // The same lift the home cards have, so this reads as part of the app
    // rather than a panel bolted onto it.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },

  captainRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#EEF4F7" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitials: { fontSize: 17, fontWeight: "700", color: "#449EB2" },
  captainText: { flex: 1 },
  captainName: { fontSize: 16, fontWeight: "700", color: "#0f2c3f" },
  captainRole: { fontSize: 13, color: "#5d7481", marginTop: 2 },
  whenPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#EAF4F7",
  },
  whenPillText: { fontSize: 12, fontWeight: "700", color: "#2C7A91" },

  rule: { height: 1, backgroundColor: "#EEF1F4", marginVertical: 14 },

  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detail: { flex: 1, fontSize: 14, color: "#475569", lineHeight: 20 },

  deadlineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  deadline: { flex: 1, fontSize: 13, color: "#a06c12", fontWeight: "600" },

  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    // 48 is the smallest target a thumb reliably hits. The old buttons were
    // 11 points of padding and a row that shrank to its text.
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  busy: { opacity: 0.6 },
  // Colour carries the meaning, not only the words: yes is green and filled
  // because it is the answer being asked for, no is outlined in red because
  // it is a real choice rather than a cancel.
  accept: { backgroundColor: "#0E9F6E" },
  acceptText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  decline: { backgroundColor: "#ffffff", borderWidth: 1.5, borderColor: "#F0C4C4" },
  declineText: { color: "#C13030", fontWeight: "600", fontSize: 14 },

  answered: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 10,
  },
  answeredYes: { backgroundColor: "#E9F7F1" },
  answeredNo: { backgroundColor: "#F2F5F7" },
  answeredText: { flex: 1, fontSize: 13.5, color: "#33475b", lineHeight: 19 },

  changeMind: { marginTop: 12, alignSelf: "flex-start" },
  changeMindText: { color: "#449EB2", fontWeight: "700", fontSize: 13.5 },

  failed: { marginTop: 10, fontSize: 13, color: "#C13030", lineHeight: 18 },
});
