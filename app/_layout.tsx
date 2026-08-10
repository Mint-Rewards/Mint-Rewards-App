import {
  DarkTheme,
  DefaultTheme,
  router,
  Stack,
  ThemeProvider,
  usePathname,
  useGlobalSearchParams,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore } from "@/store/store";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";
import { configureGoogleSignIn } from '@/utils/googleAuth';
import { logScreenView } from "@/utils/logger";
import { EnvBanner } from "@/components/EnvBanner";
import UpdateGate from "@/components/UpdateGate";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PostHogProvider } from "posthog-react-native";
import { posthog } from "@/utils/posthog";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { setUserData, getProfile, user } = useAppStore();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previousRoute = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousRoute.current === pathname) return;
    logScreenView(pathname, previousRoute.current, user?._id);
    posthog.screen(pathname, {
      previous_screen: previousRoute.current ?? null,
      ...params,
    });
    previousRoute.current = pathname;
  }, [pathname, params, user?._id]);

  useEffect(() => {
    const checkAuth = async () => {
      // TEMP DIAGNOSTIC — remove once the sign-in bounce is diagnosed.
      console.log("[checkAuth] start");
      try {
        const token = await SecureStore.getItemAsync("userToken");
        console.log(`[checkAuth] stored token: ${token ? "present" : "NONE"}`);
        if (token) {
          // Set token first so getProfile can use it
          setUserData({ token });
          await getProfile();
          const user = useAppStore.getState().user;
          if (user) {
            console.log("[checkAuth] profile OK -> /(tabs)/home");
            router.replace("/(tabs)/home");
          } else {
            // Profile fetch failed — token is stale
            console.warn("[checkAuth] profile FAILED -> deleting token, /login");
            await SecureStore.deleteItemAsync("userToken");
            router.replace("/login");
          }
        } else {
          console.log("[checkAuth] no token -> /login");
          router.replace("/login");
        }
      } catch (error) {
        console.error("[checkAuth] threw -> /login. Auth check failed:", error);
        await SecureStore.deleteItemAsync("userToken");
        router.replace("/login");
      }
    };
    checkAuth();
    configureGoogleSignIn();
  }, []);

  return (
    // SafeAreaProvider added so EnvBanner can read the top inset from outside
    // the navigator. The navigators' own SafeAreaProviderCompat detects this
    // provider and defers to it.
    <SafeAreaProvider>
      <PostHogProvider
        client={posthog}
        autocapture={{
          captureScreens: false,
          captureTouches: true,
          propsToCapture: ['testID'],
          maxElementsCaptured: 20,
        }}
      >
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <EnvBanner />
          <Stack initialRouteName="index">
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="verify-email" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="redeem" options={{ headerShown: false }} />
          <Stack.Screen name="editProfile" options={{ headerShown: false }} />
          <Stack.Screen name="deals" options={{ headerShown: false }} />
          <Stack.Screen name="collections" options={{ headerShown: false }} />
          <Stack.Screen name="otp-screen" options={{ headerShown: false }} />
          <Stack.Screen name="change-password" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
          </Stack>
          {/* Sibling overlay, not a replacement for <Stack>: checkAuth() above
              keeps running and routing underneath, so when the gate clears the
              user lands where they were already headed rather than back on the
              loading screen. Renders null unless it decides to block. */}
          <UpdateGate />
          {/* Pinned to "dark" (dark glyphs) rather than "auto". "auto" follows
              the ThemeProvider above and resolves to light glyphs in dark mode,
              which vanish against the hardcoded-white screens. Same reason the
              tab bar blur is pinned in TabBarBackground.ios.tsx. */}
          <StatusBar style="dark" />
        </ThemeProvider>
      </PostHogProvider>
    </SafeAreaProvider>
  );
}