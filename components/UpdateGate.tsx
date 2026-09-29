import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { API_BASE_URL } from "@/config/env";
import { posthog } from "@/utils/posthog";
import { Constants } from "@/utils/constants";
import ForceUpdateScreen from "@/components/ForceUpdateScreen";
import {
  isStoreUpdateRequired,
  parseAppConfig,
  storeUrlFor,
  type GatePlatform,
} from "@/utils/versionGate";

// Both loaded lazily, following the guard pattern in utils/googleAuth.ts: a
// device may still be running a binary built before either module was linked
// in, and a top-level import of a missing native module crashes at module
// evaluation — i.e. before any of the fail-open handling below can run. Every
// consumer no-ops when the module didn't load.
let Application: any;
try {
  Application = require("expo-application");
} catch {
  console.warn(
    "[UpdateGate] expo-application native module not found — the store-version check will be skipped.",
  );
}

let Updates: any;
try {
  Updates = require("expo-updates");
} catch {
  console.warn(
    "[UpdateGate] expo-updates native module not found — the OTA check will be skipped.",
  );
}

const CONFIG_TIMEOUT_MS = 8000;

/**
 * How long the app must have been away before a resume re-checks for an OTA.
 *
 * Without a re-check, an update reaches a device only on a cold start. Android
 * keeps a backgrounded process alive, so what a tester calls "closing and
 * reopening the app" is usually a RESUME: no launch, no check, no swap. Two
 * handsets on the same APK and the same channel then sit on bundles published
 * a day and a half apart, which is exactly what QA reported — one device
 * happened to get killed for memory and the other did not.
 *
 * Five minutes, so flipping to the camera or a chat and straight back does not
 * interrupt anything, while coming back to the app later does.
 */
const BACKGROUND_RECHECK_MS = 5 * 60 * 1000;

/**
 * Fetches and applies a waiting update, showing the overlay while it does.
 *
 * `reloadAsync` tears down the JS runtime, so nothing after it runs on the
 * success path. Every failure drops the overlay and leaves the user on the
 * bundle they have — an update is never worth a broken session.
 */
async function applyPendingOta(publish: (next: GateState) => void): Promise<void> {
  if (!Updates) return;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check?.isAvailable) return;

    publish({ kind: "applyingOta" });
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  } catch (error) {
    reportFailure("ota_check", error);
    publish({ kind: "open" });
  }
}

/**
 * Duplicated from the module-private `fetchWithTimeout` in store/store.ts
 * rather than exported from there, to keep this gate off the store's import
 * graph: UpdateGate runs before auth and must not be able to pull the Zustand
 * store (and transitively utils/api.ts's 401 -> router.replace("/login")) into
 * a pre-login render. Same AbortController pattern, shorter budget — this call
 * sits between the user and their app, so it gives up sooner than 15s.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type GateState =
  | { kind: "open" }
  | { kind: "storeUpdateRequired"; storeUrl: string }
  | { kind: "applyingOta" };

/**
 * Reports a gate failure to PostHog as well as the console.
 *
 * Console-only would make this invisible: every failure path here fails OPEN,
 * so a gate that is silently broken in the field looks exactly like a gate
 * that correctly decided not to block. The event is what distinguishes them.
 */
function reportFailure(step: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[UpdateGate] ${step} failed (failing open): ${message}`);
  try {
    posthog.capture("update_gate_failed", { step, error: message });
  } catch {
    // PostHog must never be the reason the gate throws.
  }
}

/**
 * Runs both checks and reports the outcome through `publish`.
 *
 * Lives at module scope rather than inside the component: it is plain async
 * I/O with no React involvement, and hoisting it out means the effect that
 * starts it contains no synchronous path to setState (react-hooks/
 * set-state-in-effect), while `publish` gives the caller a single place to
 * drop updates that arrive after unmount.
 *
 * Returning early always means "do not block".
 */
async function runUpdateChecks(publish: (next: GateState) => void) {
  // Never gate a dev client. Its buildNumber is whatever app.config.js last
  // declared locally (14), while the backend floor tracks the EAS remote
  // counter (25+) — so the store check trips on every local run, and the store
  // link it offers cannot update a dev build anyway. Comment this out to
  // exercise the gate itself.
  //
  // The NODE_ENV clause is load-bearing: Jest also runs with __DEV__ === true,
  // and without it every case in __tests__/updateGate.test.tsx returns here
  // before reaching the behaviour it asserts on.
  if (__DEV__ && process.env.NODE_ENV !== "test") return;

  const platform = Platform.OS;
  if (platform !== "ios" && platform !== "android") return; // web: nothing to gate

  // --- Step 1: fetch config -------------------------------------------------
  let config;
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/app-config`,
      CONFIG_TIMEOUT_MS,
    );
    if (!response.ok) {
      reportFailure("config_fetch", `HTTP ${response.status}`);
      return;
    }
    config = parseAppConfig(await response.json());
  } catch (error) {
    // Covers network rejection, the AbortController timeout, and malformed
    // JSON (response.json() rejects) in one place — all the same decision.
    reportFailure("config_fetch", error);
    return;
  }

  if (!config) {
    reportFailure("config_parse", "config payload was malformed or unusable");
    return;
  }

  // --- Step 2: store check, first and short-circuiting ----------------------
  try {
    if (Application) {
      const required = isStoreUpdateRequired({
        nativeApplicationVersion: Application.nativeApplicationVersion ?? null,
        nativeBuildVersion: Application.nativeBuildVersion ?? null,
        platform: platform as GatePlatform,
        config,
      });

      if (required) {
        const storeUrl = storeUrlFor(platform as GatePlatform, config);
        // isStoreUpdateRequired already returns false without a store URL;
        // this narrows the type and keeps the invariant local.
        if (storeUrl) {
          posthog.capture("update_gate_blocked", {
            reason: "store_version",
            installed_version: Application.nativeApplicationVersion ?? null,
            installed_build: Application.nativeBuildVersion ?? null,
            min_version: config.minSupportedVersion,
          });
          publish({ kind: "storeUpdateRequired", storeUrl });
        }
        // Return either way. The OTA check is deliberately NOT run here:
        // runtimeVersion policy is "appVersion" (app.config.js), so an OTA can
        // only ever reach binaries on the same app version and can never be
        // the fix for a too-old binary. Checking it would be wasted work at
        // best, and actively misleading if it somehow found something.
        return;
      }
    }
  } catch (error) {
    reportFailure("store_check", error);
    return;
  }

  // --- Step 3: OTA check ----------------------------------------------------
  if (!config.forceOTA || !Updates) return;

  posthog.capture("update_gate_blocked", { reason: "forced_ota" });
  await applyPendingOta(publish);
}

/**
 * Blocking overlay for the two independent "you must update" triggers.
 *
 * Mounted as a sibling of <Stack> inside app/_layout.tsx, absolutely
 * positioned over it. It does NOT replace the navigator: the existing
 * checkAuth() effect keeps running underneath and routes the user as usual, so
 * when the gate clears they land wherever checkAuth() already put them rather
 * than back on the loading screen.
 *
 * Failure policy: every step fails OPEN. Network down, backend 500, malformed
 * JSON, missing native module — all render nothing and let the app proceed.
 * Blocking on a failed check would turn a backend outage into a total app
 * outage for every install at once, with no client-side recovery path.
 */
export default function UpdateGate() {
  const [state, setState] = useState<GateState>({ kind: "open" });

  useEffect(() => {
    let active = true;
    runUpdateChecks((next) => {
      // The checks outlive a fast unmount; dropping late results avoids
      // setting state on a torn-down tree.
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Re-check when the app comes back after a while away.
   *
   * `checkAutomatically: "ON_LOAD"` with `fallbackToCacheTimeout: 0` means a
   * launch runs the CACHED bundle and downloads the new one behind it, so an
   * update always lands one launch late — and a resumed Android process never
   * launches at all. That is how two handsets on the same APK end up a day
   * and a half apart. This closes it at the one moment the user is already
   * waiting for the app to come back.
   *
   * Deliberately not gated on `forceOTA`: that flag is the emergency "nobody
   * may continue on an old bundle" lever, and ordinary delivery should not
   * depend on someone remembering to set it.
   */
  const leftAt = useRef<number | null>(null);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        // Record the first departure only; "inactive" then "background" is one
        // trip away, and overwriting would reset the clock on the way out.
        leftAt.current ??= Date.now();
        return;
      }
      const away = leftAt.current === null ? 0 : Date.now() - leftAt.current;
      leftAt.current = null;
      if (away < BACKGROUND_RECHECK_MS) return;
      // Same publish contract as the mount check: the overlay goes up only if
      // there is something to apply, and comes down on any failure.
      void applyPendingOta(setState);
    });
    return () => subscription.remove();
  }, []);

  // Swallow the Android hardware back button ONLY while the non-dismissible
  // store screen is up — the overlay does not participate in navigation, so
  // without this, back would pop the Stack underneath it and leave the user
  // blocked on a screen whose backdrop silently changed.
  useEffect(() => {
    if (state.kind !== "storeUpdateRequired") return;
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => subscription.remove();
  }, [state.kind]);

  if (state.kind === "open") return null;

  return (
    <View style={styles.overlay} pointerEvents="auto" testID="update-gate">
      {state.kind === "storeUpdateRequired" ? (
        <ForceUpdateScreen
          storeUrl={state.storeUrl}
          onOpenStoreFailed={(error) => reportFailure("open_store_url", error)}
        />
      ) : (
        <View style={styles.otaContainer}>
          <ActivityIndicator size="large" color={Constants.appThemeColor} />
          <Text style={styles.otaText}>Updating Mint Rewards…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Spelled out rather than StyleSheet.absoluteFillObject — that helper is
    // no longer in React Native 0.85's type surface.
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Above the navigator it is layered over, and above EnvBanner.
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: "#ffffff",
  },
  otaContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#ffffff",
  },
  otaText: {
    color: "#666666",
    fontSize: 16,
    fontWeight: "500",
  },
});
