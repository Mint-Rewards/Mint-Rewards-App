import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { ColorValue, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Constants } from "../../utils/constants";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

type TabBarIconProps = {
  /** Outline glyph, shown when the tab is not the active destination. */
  name: IoniconName;
  /** Filled glyph, shown inside the active indicator. */
  activeName: IoniconName;
  focused: boolean;
  /** Inactive tint, passed through from the navigator so it stays single-sourced. */
  color: ColorValue;
};

/**
 * The active destination gets an indicator pill rather than a tint swap, so the
 * brand reads as a shape at a glance instead of 24px of colored glyph.
 */
export default function TabBarIcon({
  name,
  activeName,
  focused,
  color,
}: TabBarIconProps) {
  const scale = useSharedValue(focused ? 1 : 0.8);
  const opacity = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    scale.value = withSpring(focused ? 1 : 0.8, { damping: 20, stiffness: 400 });
    opacity.value = withTiming(focused ? 1 : 0, { duration: 160 });
  }, [focused, scale, opacity]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.pill, pillStyle]} />
      <Ionicons
        name={focused ? activeName : name}
        size={24}
        color={focused ? "#ffffff" : color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Material's navigation-bar indicator proportions: a 32dp pill around a 24dp
  // glyph. Taller than this and the pill crowds the label beneath it.
  slot: {
    width: 60,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: Constants.appThemeColor,
  },
});
