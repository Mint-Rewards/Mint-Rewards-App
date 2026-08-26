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
import { missingSentence } from "@/utils/locationEvaluation";
import { resolveLocationGate } from "@/utils/locationGate";
import type { PinPlacement } from "@/utils/pinState";
import {
  fetchLocationGateConfig,
  type LocationGateConfig,
} from "@/utils/locationGateConfig";
import { logError } from "@/utils/logger";
import type { ProfileFocusTarget } from "@/utils/profileFocus";
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

/**
 * How long Home is left alone before the gate appears over it.
 *
 * One second: long enough that Home has painted and the user has registered
 * arriving somewhere, short enough that the modal still reads as a response to
 * landing on Home rather than an interruption of whatever they started doing.
 */
const GATE_APPEARANCE_DELAY_MS = 1000;

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
  // The pathname the last dismissal (or a "Continue" tap) happened on, which
  // suppresses the modal for the REST OF THAT VISIT — so it is not left sitting
  // under the Edit Profile screen it just pushed.
  //
  // It is cleared on leaving Home, in the effect below. Comparing the stored
  // path against the current one cannot detect a round trip on its own: coming
  // back to Home restores the very same string, so without the clear the
  // comparison never becomes false again and the gate goes quiet for the rest
  // of the app run — whether or not the user filled anything in. That was a
  // real defect; `__tests__/locationGateReArm.test.tsx` covers it.
  const [dismissedOnPath, setDismissedOnPath] = useState<string | null>(null);
  // Whether Home has been on screen long enough for the gate to speak. See
  // GATE_APPEARANCE_DELAY_MS.
  const [homeSettled, setHomeSettled] = useState(false);

  // The gate only meets people on Home — it is "the home page modal", not an
  // app-wide interstitial. Anywhere else (including editProfile, where the
  // finish flow SENDS people) it must stay out of the way.
  //
  // Computed up here, above the effects, because the delay below keys off it.
  const onHome = pathname === "/home" || pathname === "/(tabs)/home";

  /**
   * Holds the modal back until Home has been visible for a beat, and re-arms
   * the gate when the user leaves.
   *
   * Without this the modal is mounted in the same frame Home is, so the user
   * never sees the screen they were sent to — they land on a dialog over a
   * blank-ish tab that is still laying out. Letting Home paint first makes the
   * modal read as a prompt about a screen the user has arrived at, rather than
   * as part of the navigation itself.
   *
   * Keyed on `onHome`, not on mount: leaving Home clears the flag and returning
   * re-arms the wait, so the pause is honoured every time rather than once per
   * app run. The cleanup matters — someone who taps through to another tab
   * inside the first second must not have the modal open behind them on a
   * screen the gate does not belong on.
   *
   * This is a display delay only. It does NOT touch the decision: dismissal
   * accounting, the soft/hard modes and `locationVersion` all behave exactly as
   * they did, so a user who never lingers on Home is not thereby exempt.
   *
   * The cleanup also clears the per-visit suppression, which is what lets the
   * gate ask again after a trip to Edit Profile. Note what it does NOT clear:
   * `dismissals`. That count is the bound on nagging within an app run, and
   * resetting it here would make a soft gate infinitely repeatable — every
   * navigation away and back would refund a dismissal. Per-visit suppression
   * resets; the session budget does not.
   */
  useEffect(() => {
    if (!onHome) return;
    const timer = setTimeout(() => setHomeSettled(true), GATE_APPEARANCE_DELAY_MS);
    // Re-arming happens in the CLEANUP rather than in the effect body: leaving
    // Home is exactly when the wait should reset, and clearing it here keeps
    // the body free of a synchronous setState (which the react-hooks lint
    // rejects, correctly — it would cascade a second render on every
    // navigation away from Home).
    return () => {
      clearTimeout(timer);
      setHomeSettled(false);
      setDismissedOnPath(null);
    };
  }, [onHome]);

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
    async (payload: Partial<UserProfile>, placement: PinPlacement | null) => {
      const result = await updateProfile(payload);
      if (result.Status !== "Success") {
        alertOnce("Error", result.ErrorMessage || "Could not save your address");
        return;
      }

      // The placement comes FROM the modal. It used to be hardcoded "derived"
      // here, on the reasoning that this sheet only opens for a redisplayed
      // saved coordinate — but "Adjust pin" makes that false, and the tag the
      // re-placement produced was being thrown away. `derived` maps to
      // `legacy_string`, which the server does not accept as a pin at all
      // (only `map_pin` and `collector_verified` count), so re-placing the pin
      // could never satisfy it: the save succeeded, the profile stayed
      // incomplete, and until the evaluation was surfaced nothing said so.
      const patch = buildLocationPatchPayload(payload, placement);
      if (patch.location) {
        trackLocationSaved(patch.location.source, patch.location.precision);
      }

      const patched = await patchUserLocation(patch, token || user?.token);
      if (patched.Status === "Success") {
        // The server stamps locationVersion when the evaluation completes;
        // storing the evaluation is what lets the gate fall silent without a
        // refetch.
        setLocationEvaluation(patched.evaluation ?? null);

        // A save that succeeded and STILL did not complete the profile. The
        // client and the server do not agree about "complete" and cannot — the
        // server judges the structured record, this form judges its own fields
        // — so this is reachable, most obviously for a user whose coordinate
        // predates the structured pin and counts as `legacy_string`.
        //
        // Without this the modal simply stays up: client validation passed so
        // nothing is marked, the request succeeded so nothing errors, and the
        // Save button looks broken. The server already named the gap; this is
        // the only place that reads it.
        const stillMissing = missingSentence(patched.evaluation, {
          city: payload.city,
          town: payload.town,
          hasCoordinate: !!payload.latitude?.trim(),
        });
        if (stillMissing) alertOnce("Almost there", stillMissing);
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

  if (!onHome || !configLoaded || !homeSettled) return null;

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

  /**
   * Sends the user to the form, optionally naming the gap they tapped.
   *
   * Suppresses for this visit so the modal is not left sitting under the
   * navigation it just triggered — but WITHOUT spending a dismissal, because
   * engaging with the gate is the opposite of skipping it. The suppression
   * lifts when they leave Home, so an unfinished profile is asked about again
   * on their way back.
   */
  const goToProfile = (focus?: ProfileFocusTarget) => {
    setDismissedOnPath(pathname);
    router.push(
      focus
        ? { pathname: "/editProfile", params: { focus } }
        : { pathname: "/editProfile" },
    );
  };

  if (decision.show === "finish") {
    return (
      <FinishProfileModal
        visible
        missing={decision.missing}
        dismissible={decision.dismissible}
        onContinue={() => goToProfile()}
        onSelectRow={(focus) => goToProfile(focus)}
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
