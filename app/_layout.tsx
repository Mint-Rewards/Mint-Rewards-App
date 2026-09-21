import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, useGlobalSearchParams, usePathname, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppStore } from "@/store/store";
import {
  onNotificationOpened,
  onPushTokenRefresh,
  registerDeviceToken,
  registerForPush,
  type OpenedNotification,
} from "@/utils/push";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
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
  const token = useAppStore((state) => state.token);
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previousRoute = useRef<string | undefined>(undefined);
  const segments = useSegments();
  const [pendingNotification, setPendingNotification] =
    useState<OpenedNotification | null>(null);

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

  /**
   * Push registration, in one place rather than in each sign-in path.
   *
   * There are four ways to arrive signed in — password, register, Google,
   * Apple — plus a cold start with a stored token. Hooking each one would mean
   * five call sites and a fifth to forget. This watches the state they all end
   * up in instead.
   *
   * Re-registering on every launch is deliberate: it refreshes lastSeenAt and
   * re-binds a handset that has changed hands, and the service upserts on the
   * token so it costs one call.
   */
  useEffect(() => {
    if (!user?._id || !token) return;
    let alive = true;

    registerForPush().then((result) => {
      if (alive && result.token) registerDeviceToken(result.token, token);
    });
    // FCM reissues tokens on reinstall and restore-to-new-device. A token that
    // is never re-sent goes quietly dead, which is indistinguishable from a
    // broken pipeline.
    const unsubscribe = onPushTokenRefresh((next) => {
      if (alive) registerDeviceToken(next, token);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [user?._id, token]);

  /**
   * A tapped notification is REMEMBERED here, and acted on below.
   *
   * It cannot navigate immediately. On a cold start the tap is reported by the
   * native side within milliseconds — before checkAuth has read the stored
   * token, so there is no session to judge yet — and checkAuth then finishes
   * with router.replace("/(tabs)/home"), which would overwrite any navigation
   * done in the meantime. Whichever of the two finished first would win, and
   * on a development build the bundle download makes that ordering vary.
   */
  useEffect(() => {
    return onNotificationOpened((notification: OpenedNotification) => {
      // Worth measuring: a push nobody taps is a push worth rewriting, and the
      // event name is the only way to tell which kind is being ignored.
      posthog.capture("notification_opened", {
        event: notification.event,
        collection_id: notification.collectionId,
      });
      setPendingNotification(notification);
    });
  }, []);

  /**
   * Acted on once the app has actually settled somewhere inside the tabs.
   *
   * Keyed on the route rather than on a timer or on auth state: arriving in
   * the tab navigator is the observable event that means startup routing is
   * finished and a push() will not be overwritten. Someone sent to /login
   * keeps their pending notification until they sign in and land here.
   *
   * Every message this app sends is about a collection, and Collections is the
   * only screen that can answer "what is happening with mine" — the
   * Notifications tab is still an empty state, so routing a deliberate tap
   * there would open a blank screen.
   */
  useEffect(() => {
    // useSegments, not usePathname: groups are a routing construct and never
    // appear in a URL, so pathname reads "/home" and would never match
    // "/(tabs)". Segments keep the file structure — ["(tabs)", "home"].
    if (!pendingNotification || segments[0] !== "(tabs)") return;
    setPendingNotification(null);
    router.push("/(tabs)/collections");
  }, [pendingNotification, segments]);

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