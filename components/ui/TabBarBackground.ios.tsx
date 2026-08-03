import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { StyleSheet } from "react-native";

export default function BlurTabBarBackground() {
  return (
    <BlurView
      // Pinned to the light material rather than systemChromeMaterial. The
      // system tint follows the device theme and renders near-black in dark
      // mode, but it draws over the bar's white backgroundColor while the tab
      // labels stay dark (#333333 / #4a5568) — dark-on-dark, unreadable. Every
      // product screen is light-only, so the bar matches them in both themes.
      // Revisit this if the app ever gains real dark-mode styling.
      tint="light"
      intensity={100}
      style={StyleSheet.absoluteFill}
    />
  );
}

export function useBottomTabOverflow() {
  return useBottomTabBarHeight();
}
