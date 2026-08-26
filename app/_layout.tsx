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
import LocationGate from "@/components/LocationGate";
import UpdateGate from "@/components/UpdateGate";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PostHogProvider } from "posthog-react-native";
import { posthog } from "@/utils/posthog";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://d5c83cd62b2035ca71795b5d663d8ddd@o4511899441233920.ingest.de.sentry.io/4511899447394384',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

export default Sentry.wrap(function RootLayout() {
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
          {/* redeem / deals / collections / notifications now live inside
              (tabs) so the bottom nav bar renders on them. Route paths are
              unchanged — a group segment adds nothing to the URL. */}
          <Stack.Screen name="editProfile" options={{ headerShown: false }} />
          <Stack.Screen name="otp-screen" options={{ headerShown: false }} />
          <Stack.Screen name="change-password" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
          </Stack>
          {/* Sibling overlay, not a replacement for <Stack>: checkAuth() above
              keeps running and routing underneath, so when the gate clears the
              user lands where they were already headed rather than back on the
              loading screen. Renders null unless it decides to block. */}
          <UpdateGate />
          {/* Same contract as UpdateGate: renders null unless it decides a
              location modal is due, and only on Home. */}
          <LocationGate />
          {/* Pinned to "dark" (dark glyphs) rather than "auto". "auto" follows
              the ThemeProvider above and resolves to light glyphs in dark mode,
              which vanish against the hardcoded-white screens. Same reason the
              tab bar blur is pinned in TabBarBackground.ios.tsx. */}
          <StatusBar style="dark" />
        </ThemeProvider>
      </PostHogProvider>
    </SafeAreaProvider>
  );
});