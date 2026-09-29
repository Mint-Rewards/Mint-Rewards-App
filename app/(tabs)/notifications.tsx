/**
 * What this household has been told.
 *
 * Was a static illustration: the app received notifications and had nowhere to
 * show them, so anything missed on the lock screen was gone. The empty state
 * is still here and still matters — most people will have nothing yet — but it
 * is now the empty case rather than the only case.
 */
import PushDebugPanel from "@/components/PushDebugPanel";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import Navbar from "@/components/ui/navbar";
import { IS_DEV } from "@/config/env";
import { useNotifications, type InboxItem } from "@/hooks/useNotifications";
import { useAppStore } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/** An icon per event family, so the list is scannable without reading it. */
function iconFor(event: string): keyof typeof Ionicons.glyphMap {
  if (event.startsWith("collection.cancelled")) return "close-circle";
  if (event.startsWith("collection.started")) return "car";
  if (event.startsWith("pickup.collected")) return "checkmark-circle";
  if (event.startsWith("pickup.no_collection")) return "alert-circle";
  return "leaf";
}

/**
 * "2 hours ago" rather than a timestamp.
 *
 * A notification's age is the only temporal fact that matters here — nobody
 * needs the minute a reminder arrived, they need to know whether it is stale.
 */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Row({ item }: { item: InboxItem }) {
  const unread = !item.readAt;
  const collectionId = item.data?.collectionId;

  return (
    <TouchableOpacity
      style={[styles.row, unread && styles.rowUnread]}
      activeOpacity={collectionId ? 0.7 : 1}
      disabled={!collectionId}
      onPress={() => router.push("/(tabs)/collections")}
      accessibilityRole={collectionId ? "button" : "text"}
      accessibilityLabel={`${item.title}. ${item.body}. ${ago(item.createdAt)}`}
    >
      <View style={[styles.rowIcon, unread && styles.rowIconUnread]}>
        <Ionicons name={iconFor(item.event)} size={17} color={unread ? "#ffffff" : "#64748b"} />
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.rowAge}>{ago(item.createdAt)}</Text>
        </View>
        <Text style={styles.rowBody}>{item.body}</Text>
      </View>
    </TouchableOpacity>
  );
}

const NotificationsScreen = () => {
  // Keeps the centred empty state optically centred in the space above the
  // absolutely-positioned iOS tab bar. No-op on Android.
  const tabBarOverflow = useBottomTabOverflow();
  const { user } = useAppStore();
  const { notifications, unread, hasMore, loading, loadingMore, refresh, loadMore, markAllRead } =
    useNotifications();

  // Opening the screen IS reading them. Asking someone to tap "mark all read"
  // after they have plainly read it is a chore invented by the software.
  React.useEffect(() => {
    if (unread > 0) markAllRead();
  }, [unread, markAllRead]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Navbar user={user} />

      {/* Development builds only. The component guards itself too. */}
      {IS_DEV && <PushDebugPanel />}

      {notifications.length === 0 ? (
        <View style={[styles.content, { paddingBottom: tabBarOverflow }]}>
          <View style={styles.emptyStateContainer}>
            <View style={styles.illustrationContainer}>
              <LinearGradient colors={["#f8f9fa", "#e9ecef"]} style={styles.illustrationBackground}>
                <Ionicons name="notifications-outline" size={80} color="#00528A" />
              </LinearGradient>
            </View>

            <View style={styles.textContainer}>
              <Text style={styles.title}>No notifications yet</Text>
              <Text style={styles.subtitle}>
                When a collection is coming to your area, you will hear about it here.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push("/(tabs)/collections")}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>View collections</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <Row item={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarOverflow + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#00528A" />
          }
          onEndReachedThreshold={0.4}
          onEndReached={hasMore ? loadMore : undefined}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footer} color="#00528A" /> : null
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 30 },
  emptyStateContainer: { alignItems: "center" },
  illustrationContainer: { marginBottom: 28 },
  illustrationBackground: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: { alignItems: "center", marginBottom: 26 },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 20 },
  primaryButton: {
    backgroundColor: "#00528A",
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },

  list: { paddingTop: 8 },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
  },
  // A faint wash rather than a dot: it marks the whole row, which is what the
  // eye is scanning, and it survives being read at a glance.
  rowUnread: { backgroundColor: "#f5f9fc" },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eef2f5",
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconUnread: { backgroundColor: "#00528A" },
  rowText: { flex: 1 },
  rowTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: "#334155" },
  rowTitleUnread: { color: "#0f172a", fontWeight: "700" },
  rowAge: { fontSize: 11.5, color: "#94a3b8" },
  rowBody: { fontSize: 13, color: "#64748b", lineHeight: 18, marginTop: 2 },
  footer: { paddingVertical: 18 },
});

export default NotificationsScreen;
