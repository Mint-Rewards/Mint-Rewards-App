import { BottomTabBarButtonProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { PlatformPressable } from 'expo-router/build/react-navigation/elements';
import * as Haptics from 'expo-haptics';

export function HapticTab({ pressColor, hoverEffect, ...props }: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      pressColor={typeof pressColor === 'string' ? pressColor : undefined}
      hoverEffect={typeof hoverEffect?.color === 'string' ? { color: hoverEffect.color } : undefined}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
