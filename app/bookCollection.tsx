/**
 * Asking to be collected on a date of your choosing.
 *
 * The inverse of the invitations screen next door. There, operations picks a
 * date and the household answers; here the household asks and operations
 * decides whether enough hands are up to send a van. Nothing on this screen
 * promises one will come — saying so before an operator has committed a
 * captain would be a promise we cannot keep, and the copy is careful about
 * it throughout.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Navbar from "@/components/ui/navbar";
import { useAppStore } from "@/store/store";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useCollectionSlots, type CollectionSlot, type SlotTime } from "@/hooks/useCollectionSlots";
import { formatCollectionDate } from "@/constants/mockCollectionsData";
import { alertOnce } from "@/utils/alert";
import { Constants } from "@/utils/constants";

const SLOT_LABEL: Record<SlotTime, string> = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  EVENING: "Evening",
};

/** Rough windows, so "morning" is not left to the imagination. */
const SLOT_HOURS: Record<SlotTime, string> = {
  MORNING: "8am – 12pm",
  AFTERNOON: "12pm – 4pm",
  EVENING: "4pm – 8pm",
};

/** Groups the flat list by day, preserving the server's ordering. */
function byDate(slots: CollectionSlot[]): { date: string; slots: CollectionSlot[] }[] {
  const out: { date: string; slots: CollectionSlot[] }[] = [];
  for (const slot of slots) {
    const last = out[out.length - 1];
    if (last && last.date === slot.date) last.slots.push(slot);
    else out.push({ date: slot.date, slots: [slot] });
  }
  return out;
}

export default function BookCollectionScreen() {
  const user = useAppStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const { eligible, reason, slots, hydrated, busySlotId, request, withdraw, reload } =
    useCollectionSlots();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const [expanded, setExpanded] = useState<string | null>(null);

  /**
   * The one request this household currently holds, if any.
   *
   * Surfaced at the top rather than left to be found among the dates: it is
   * the answer to the question someone opens this screen with a second time.
   */
  const mine = slots.find((s) => s.myRequestId !== null);

  const ask = async (slot: CollectionSlot) => {
    const result = await request(slot.id);
    if (!result.ok) alertOnce("Couldn't book that date", result.error ?? "");
  };

  const drop = (slot: CollectionSlot) => {
    alertOnce(
      "Cancel this request?",
      `We'll take your name off ${formatCollectionDate(slot.date)}, ${SLOT_LABEL[
        slot.timeSlot
      ].toLowerCase()}.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: async () => {
            const result = await withdraw(slot.id, slot.myRequestId!);
            if (!result.ok) alertOnce("Couldn't cancel", result.error ?? "");
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <Navbar user={user} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>Book a collection</Text>
        <Text style={styles.subtitle}>
          Pick a date that suits you. We arrange a van once enough households
          in your area have asked for the same one.
        </Text>

        {!hydrated ? (
          <ActivityIndicator style={styles.loading} color={Constants.appThemeColor} />
        ) : !eligible ? (
          <IneligibleCard reason={reason} onRetry={reload} />
        ) : slots.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={30} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No dates open yet</Text>
            <Text style={styles.emptyText}>
              We haven&apos;t opened any collection dates for your area. We&apos;ll
              let you know as soon as we do.
            </Text>
          </View>
        ) : (
          <>
            {mine ? (
              <View style={styles.bookedCard} testID="my-request">
                <Ionicons name="checkmark-circle" size={22} color="#0E7C66" />
                <View style={styles.bookedBody}>
                  <Text style={styles.bookedTitle}>
                    You&apos;ve asked for {formatCollectionDate(mine.date)}
                  </Text>
                  {/*
                    Careful wording. A request is not a booking: no captain
                    has been assigned and no van is committed. Saying
                    "confirmed" here would be the easiest and worst lie on
                    this screen.
                  */}
                  <Text style={styles.bookedText}>
                    {SLOT_LABEL[mine.timeSlot]} · {mine.zoneName}. We&apos;ll
                    confirm once a collection is arranged.
                  </Text>
                </View>
              </View>
            ) : null}

            {byDate(slots).map((group) => (
              <View key={group.date} style={styles.dayBlock}>
                <Text style={styles.dayHeading}>{formatCollectionDate(group.date)}</Text>
                {group.slots.map((slot) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    busy={busySlotId === slot.id}
                    // One live request per day is the rule the server
                    // enforces; disabling the rest is how the screen tells
                    // the truth about it before a tap is refused.
                    blocked={Boolean(mine) && slot.myRequestId === null}
                    expanded={expanded === String(slot.id)}
                    onToggle={() =>
                      setExpanded(expanded === String(slot.id) ? null : String(slot.id))
                    }
                    onAsk={() => ask(slot)}
                    onDrop={() => drop(slot)}
                  />
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Why this household cannot book, and what it can do about it.
 *
 * The two reasons are not interchangeable. A missing pin is the person's to
 * fix and the button should take them there; an unreachable backend is ours,
 * and offering "Set your location" for it would send them to correct
 * something that was never wrong.
 */
function IneligibleCard({ reason, onRetry }: { reason?: string; onRetry: () => void }) {
  if (reason === "no_pin") {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="location-outline" size={30} color="#449EB2" />
        <Text style={styles.emptyTitle}>Drop a pin first</Text>
        <Text style={styles.emptyText}>
          We need the exact spot on the map to collect from you — a written
          address isn&apos;t enough for a captain to find your door.
        </Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => router.push({ pathname: "/editProfile", params: { focus: "pin" } })}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Set your pin</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.emptyCard}>
      <Ionicons name="cloud-offline-outline" size={30} color="#94a3b8" />
      <Text style={styles.emptyTitle}>Couldn&apos;t load dates</Text>
      <Text style={styles.emptyText}>
        We couldn&apos;t reach the collections service just now. Pull down to
        try again.
      </Text>
      <TouchableOpacity style={styles.cta} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.ctaText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

function SlotRow({
  slot,
  busy,
  blocked,
  expanded,
  onToggle,
  onAsk,
  onDrop,
}: {
  slot: CollectionSlot;
  busy: boolean;
  blocked: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAsk: () => void;
  onDrop: () => void;
}) {
  const mine = slot.myRequestId !== null;

  return (
    <TouchableOpacity
      style={[styles.slotRow, mine && styles.slotRowMine, blocked && styles.slotRowBlocked]}
      onPress={onToggle}
      activeOpacity={0.85}
      accessibilityRole="button"
      testID={`slot-${slot.id}`}
    >
      <View style={styles.slotBody}>
        <Text style={styles.slotTime}>{SLOT_LABEL[slot.timeSlot]}</Text>
        <Text style={styles.slotHours}>{SLOT_HOURS[slot.timeSlot]}</Text>
        {expanded ? (
          <Text style={styles.slotDetail}>
            {slot.zoneName}, {slot.city}
            {"\n"}
            {/*
              Shown because it is the truth of how this works: a date nobody
              has asked for reads as unlikely, and one that is nearly there
              reads as worth joining. The threshold is operations' guide, not
              a guarantee, so it is phrased as one.
            */}
            {slot.pendingCount === 0
              ? "No one has asked for this date yet."
              : `${slot.pendingCount} household${slot.pendingCount === 1 ? "" : "s"} asked so far.`}
          </Text>
        ) : null}
      </View>

      {busy ? (
        <ActivityIndicator color={Constants.appThemeColor} />
      ) : mine ? (
        <TouchableOpacity
          onPress={onDrop}
          style={styles.askButtonGhost}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.askButtonGhostText}>Cancel</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onAsk}
          disabled={blocked}
          style={[styles.askButton, blocked && styles.askButtonDisabled]}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.askButtonText, blocked && styles.askButtonTextDisabled]}>
            Ask
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { flex: 1 },
  contentContainer: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 26, fontWeight: "800", color: "#0f172a", letterSpacing: -0.4 },
  subtitle: { fontSize: 15, color: "#64748b", lineHeight: 22, marginTop: 6, marginBottom: 20 },
  loading: { marginTop: 40 },

  bookedCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#E7F5F1",
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
  },
  bookedBody: { flex: 1 },
  bookedTitle: { fontSize: 15, fontWeight: "700", color: "#0B3B3B" },
  bookedText: { fontSize: 13.5, color: "#3C6B63", lineHeight: 19, marginTop: 2 },

  dayBlock: { marginBottom: 22 },
  dayHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  slotRowMine: { borderColor: "#0E7C66", backgroundColor: "#F5FBF9" },
  slotRowBlocked: { opacity: 0.55 },
  slotBody: { flex: 1 },
  slotTime: { fontSize: 15.5, fontWeight: "600", color: "#0f172a" },
  slotHours: { fontSize: 13, color: "#94a3b8", marginTop: 1 },
  slotDetail: { fontSize: 13, color: "#475569", lineHeight: 19, marginTop: 8 },

  askButton: {
    backgroundColor: "#449EB2",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  askButtonDisabled: { backgroundColor: "#cbd5e1" },
  askButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  askButtonTextDisabled: { color: "#f8fafc" },
  askButtonGhost: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  askButtonGhostText: { color: "#64748b", fontSize: 14, fontWeight: "600" },

  emptyCard: {
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 24,
    marginTop: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  emptyText: { fontSize: 14, color: "#64748b", lineHeight: 20, textAlign: "center" },
  cta: {
    marginTop: 10,
    backgroundColor: "#449EB2",
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
