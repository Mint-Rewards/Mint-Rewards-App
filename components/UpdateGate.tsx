import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check?.isAvailable) return;

    publish({ kind: "applyingOta" });
    posthog.capture("update_gate_blocked", { reason: "forced_ota" });

    await Updates.fetchUpdateAsync();
    // Tears down and relaunches the JS runtime; nothing after this line runs
    // on the success path, including any state change that would clear the
    // overlay. That is intentional — the reload replaces this whole tree.
    await Updates.reloadAsync();
  } catch (error) {
    // Includes reloadAsync() failing after a successful fetch. Drop the
    // overlay and let the user carry on with the bundle they have; the update
    // will apply on the next cold start via checkAutomatically: "ON_LOAD"
    // anyway.
    reportFailure("ota_check", error);
    publish({ kind: "open" });
  }
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
