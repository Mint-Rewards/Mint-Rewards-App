import { ENV, IS_DEV } from "@/config/env";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Thin strip identifying a development-variant build and the backend it is
 * actually talking to.
 *
 * Absent from production builds rather than hidden: the early return happens
 * before any view is constructed, and IS_DEV is a module-level constant, so a
 * production bundle renders nothing here at all.
 *
 * pointerEvents="none" — the banner overlays the top of every screen and must
 * never swallow a tap meant for the UI beneath it.
 */
export function EnvBanner() {
  const insets = useSafeAreaInsets();

  if (!IS_DEV) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <Text style={styles.text} numberOfLines={1}>
        DEV · {ENV.apiHost}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#B45309",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
    paddingVertical: 3,
  },
});
