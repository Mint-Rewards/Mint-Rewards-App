/**
 * A notification that arrived while the app was open.
 *
 * iOS shows nothing for a foreground message — it hands the payload to the app
 * and expects the app to decide. Without this, someone reading the app when
 * their collection is cancelled never learns it was.
 *
 * An in-app banner rather than a re-raised system notification: the latter
 * needs a native dependency, and a system banner drawn over the app you are
 * already looking at reads as a glitch.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface BannerMessage {
  title: string;
  body: string;
  collectionId: string | null;
}

/**
 * How long a banner stays up.
 *
 * A message that leads somewhere is asking the person to do something, and
 * five seconds is not long enough to read it, decide, and reach for it — the
 * banner is gone by the time the hand moves. One that is purely informational
 * has nothing to reach for, so it leaves sooner and stops covering the screen.
 */
const VISIBLE_MS = 5000;
const VISIBLE_MS_ACTIONABLE = 10_000;

export default function NotificationBanner({
  message,
  onPress,
  onDismiss,
}: {
  message: BannerMessage | null;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  // useState, not useRef().current — reading a ref during render is what the
  // React Compiler lint forbids, and the value only has to be created once.
  const [slide] = useState(() => new Animated.Value(-160));
  // Held in a ref so a replacing message cancels the previous dismissal rather
  // than the two racing and hiding the new one early.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(
    (then?: () => void) => {
      Animated.timing(slide, { toValue: -160, duration: 200, useNativeDriver: true }).start(
        () => then?.(),
      );
    },
    [slide],
  );

  useEffect(() => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);

    Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    // Actionable means there is somewhere to go: a tap opens that collection.
    const visibleFor = message.collectionId ? VISIBLE_MS_ACTIONABLE : VISIBLE_MS;
    timer.current = setTimeout(() => hide(onDismiss), visibleFor);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, slide, hide, onDismiss]);

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8, transform: [{ translateY: slide }] },
      ]}
      // Sits above everything, but must not swallow taps meant for the screen
      // underneath once it has slid away.
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.card}
        onPress={() => hide(onPress)}
        accessibilityRole="button"
        accessibilityLabel={`${message.title}. ${message.body}`}
      >
        <View style={styles.icon}>
          <Ionicons name="leaf" size={16} color="#ffffff" />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {message.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>
            {message.body}
          </Text>
        </View>
        <Pressable
          onPress={() => hide(onDismiss)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={18} color="#8ea0aa" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#dbe3ea",
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#00528A",
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  body: { fontSize: 13, color: "#475569", lineHeight: 18, marginTop: 1 },
});
