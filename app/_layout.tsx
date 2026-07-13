import {
  DarkTheme,
  DefaultTheme,
  router,
  Stack,
  ThemeProvider,
  usePathname,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore } from "@/store/store";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";
import { configureGoogleSignIn } from '@/utils/googleAuth';
import { logScreenView } from "@/utils/logger";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { setUserData, getProfile, user } = useAppStore();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await SecureStore.getItemAsync("userToken");
        if (token) {
          // Set token first so getProfile can use it
          setUserData({ token });
          await getProfile();
          const user = useAppStore.getState().user;
          if (user) {
            router.replace("/(tabs)/home");
          } else {
            // Profile fetch failed — token is stale
            await SecureStore.deleteItemAsync("userToken");
            router.replace("/login");
          }
        } else {
          router.replace("/login");
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        await SecureStore.deleteItemAsync("userToken");
        router.replace("/login");
      }
    };
    checkAuth();
    configureGoogleSignIn();
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack initialRouteName="index">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="redeem" options={{ headerShown: false }} />
        <Stack.Screen name="editProfile" options={{ headerShown: false }} />
        <Stack.Screen name="discounts" options={{ headerShown: false }} />
        <Stack.Screen name="collections" options={{ headerShown: false }} />
        <Stack.Screen name="otp-screen" options={{ headerShown: false }} />
        <Stack.Screen name="change-password" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}