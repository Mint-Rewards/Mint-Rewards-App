/**
 * The token, on the phone, in the development build.
 *
 * Getting a push token out of a device is otherwise a matter of attaching a
 * debugger and reading a log line. The token is what a message is addressed
 * to, so until there is a server registering it, being able to copy it off the
 * handset IS the feature: paste it into Firebase Console -> Cloud Messaging ->
 * "Send test message" and the round trip is proven end to end.
 *
 * Renders only in the development variant. The production build has no code
 * path that reaches it.
 */
import { IS_DEV } from "@/config/env";
import { onPushTokenRefresh, pushIsSupported, registerForPush, type PushRegistration } from "@/utils/push";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function PushDebugPanel() {
  const [state, setState] = useState<PushRegistration | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // The guard belongs INSIDE the effect, not only around the JSX. Hooks run
    // before the early return, so without this a production build would ask
    // for notification permission it has no way to use.
    if (!IS_DEV) return;

    let alive = true;
    registerForPush().then((result) => {
      if (alive) setState(result);
    });
    // A reissued token makes the copied one dead, and a dead token looks
    // exactly like a broken pipeline. Show the new one as soon as it arrives.
    const unsubscribe = onPushTokenRefresh((token) => {
      if (alive) setState((prev) => ({ permission: prev?.permission ?? "granted", token }));
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (!IS_DEV) return null;

  const retry = async () => {
    setRetrying(true);
    setState(await registerForPush());
    setRetrying(false);
  };

  const copy = async () => {
    if (!state?.token) return;
    await Clipboard.setStringAsync(state.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Ionicons name="bug-outline" size={14} color="#00528A" />
        <Text style={styles.title}>Push (dev build only)</Text>
      </View>

      {!state || retrying ? (
        <ActivityIndicator size="small" color="#00528A" />
      ) : !pushIsSupported() ? (
        <Text style={styles.body}>Only wired up for iOS in this build.</Text>
      ) : state?.error ? (
        <Text style={[styles.body, styles.error]}>{state.error}</Text>
      ) : state?.token ? (
        <>
          <Text style={styles.label}>
            {state.permission === "provisional" ? "Provisional" : "Allowed"} · FCM token
          </Text>
          <Text style={styles.token} selectable numberOfLines={3}>
            {state.token}
          </Text>
          <TouchableOpacity style={styles.button} onPress={copy} accessibilityRole="button">
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={14}
              color="#fff"
            />
            <Text style={styles.buttonText}>{copied ? "Copied" : "Copy token"}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.body}>
            {state?.permission === "denied"
              ? "Notifications are turned off for this app. Turn them on in iOS Settings, then retry."
              : "No token yet."}
          </Text>
          <TouchableOpacity style={styles.button} onPress={retry} accessibilityRole="button">
            <Ionicons name="refresh" size={14} color="#fff" />
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#dbe3ea",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  title: { fontSize: 12, fontWeight: "600", color: "#00528A", letterSpacing: 0.4 },
  label: { fontSize: 11, color: "#64748b", marginBottom: 4 },
  body: { fontSize: 13, color: "#475569", lineHeight: 18 },
  error: { color: "#b91c1c" },
  token: {
    fontSize: 11,
    color: "#0f172a",
    fontFamily: "monospace",
    marginBottom: 10,
    lineHeight: 15,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#00528A",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
