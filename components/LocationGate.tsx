/**
 * Mounts the location gate: decides on Home whether a user meets "Finish your
 * profile" (no pin) or "Just your house no." (has a pin), and renders nothing
 * otherwise.
 *
 * Sibling to <UpdateGate /> in app/_layout.tsx, same shape for the same
 * reason: the app keeps running and routing underneath, so when the gate
 * clears, the user lands where they were already headed.
 *
 * All POLICY lives in `resolveLocationGate` (pure, exhaustively tested — ship
 * day touches every existing user, so who-gets-blocked is enumerated in a test
 * table, not read off a component). This file only fetches inputs, counts
 * dismissals, and hosts the two modals.
 */

import { router, usePathname } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ConfirmAddressModal } from "@/components/location/ConfirmAddressModal";
import { FinishProfileModal } from "@/components/location/FinishProfileModal";
import { useAppStore, UserProfile } from "@/store/store";
import { alertOnce } from "@/utils/alert";
import {
  buildLocationPatchPayload,
  patchUserLocation,
} from "@/utils/locationApi";
import { trackLocationPatchFailed, trackLocationSaved } from "@/utils/locationAnalytics";
import { resolveLocationGate } from "@/utils/locationGate";
import {
  fetchLocationGateConfig,
  type LocationGateConfig,
} from "@/utils/locationGateConfig";
import { logError } from "@/utils/logger";
import { Platform } from "react-native";

// Lazy for the same reason UpdateGate's is: expo-application is a native
// module, and importing it at the top level crashes any environment (tests,
// Expo Go without the module) that has not linked it.
let Application: { nativeBuildVersion?: string | null } | null = null;
try {
  // Lazy native-module load, same pattern (and same reason) as UpdateGate's.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Application = require("expo-application");
} catch {
  Application = null;
}

function currentPlatform(): "ios" | "android" | "web" {
  return Platform.OS === "ios" || Platform.OS === "android"
    ? Platform.OS
    : "web";
}

function currentBuild(): number | null {
  const raw = Application?.nativeBuildVersion;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function LocationGate() {
  const { user, token, updateProfile, setLocationEvaluation } = useAppStore();
  const pathname = usePathname();

  const [config, setConfig] = useState<LocationGateConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  // Session-scoped on purpose: `maxDismissals` bounds nagging within a run of
  // the app, while the durable never-ask-again signal is the server-stamped
  // locationVersion. Persisting dismissals would let three taps months apart
  // permanently harden a soft gate.
  const [dismissals, setDismissals] = useState(0);
  // The pathname the last dismissal happened on. Comparing during render
  // replaces a "reset on navigation" effect: a dismissal is only honoured while
  // the user is still on the screen they dismissed it from, so returning to
  // Home re-arms a soft gate (until maxDismissals) with no state write at all.
  const [dismissedOnPath, setDismissedOnPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLocationGateConfig().then((cfg) => {
      if (cancelled) return;
      setConfig(cfg);
      setConfigLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The save for the confirm modal. Mirrors editProfile's flow — legacy
   * update-profile first, then the structured PATCH whose failure never breaks
   * the save — because the SERVER treats those as one progressive story, and
   * the gate must not invent a third way to save an address.
   */
  const handleConfirmSave = useCallback(
    async (payload: Partial<UserProfile>) => {
      const result = await updateProfile(payload);
      if (result.Status !== "Success") {
        alertOnce("Error", result.ErrorMessage || "Could not save your address");
        return;
      }

      // The modal only opens for a user with a saved coordinate, redisplayed —
      // "derived" by the same ruling as MapPicker's open_with_saved. A pin the
      // user re-placed inside the modal was already tagged by its confirm.
      const patch = buildLocationPatchPayload(payload, "derived");
      if (patch.location) {
        trackLocationSaved(patch.location.source, patch.location.precision);
      }

      const patched = await patchUserLocation(patch, token || user?.token);
      if (patched.Status === "Success") {
        // The server stamps locationVersion when the evaluation completes;
        // storing the evaluation is what lets the gate fall silent without a
        // refetch.
        setLocationEvaluation(patched.evaluation ?? null);
      } else {
        await logError("locationGate patch failed", {
          userId: user?.mintId,
          route: "locationGate",
          error: patched.ErrorMessage,
        });
        trackLocationPatchFailed(patched.ErrorMessage);
      }
    },
    [updateProfile, token, user, setLocationEvaluation],
  );

  // The gate only meets people on Home — it is "the home page modal", not an
  // app-wide interstitial. Anywhere else (including editProfile, where the
  // finish flow SENDS people) it must stay out of the way.
  const onHome = pathname === "/home" || pathname === "/(tabs)/home";
  if (!onHome || !configLoaded) return null;

  const decision = resolveLocationGate({
    user,
    config,
    dismissals,
    platform: currentPlatform(),
    build: currentBuild(),
  });

  if (decision.show === "none") return null;
  if (dismissedOnPath === pathname) return null;

  const dismiss = () => {
    setDismissals((n) => n + 1);
    setDismissedOnPath(pathname);
  };

  if (decision.show === "finish") {
    return (
      <FinishProfileModal
        visible
        missing={decision.missing}
        dismissible={decision.dismissible}
        onContinue={() => {
          // The fields live on a screen that already knows how to collect
          // them. Suppress for this visit so the modal is not sitting under
          // the navigation it just triggered — without spending a dismissal:
          // continuing IS engaging with the gate.
          setDismissedOnPath(pathname);
          router.push("/editProfile");
        }}
        onDismiss={dismiss}
      />
    );
  }

  return (
    <ConfirmAddressModal
      visible
      dismissible={decision.dismissible}
      onDismiss={dismiss}
      onConfirm={handleConfirmSave}
    />
  );
}
