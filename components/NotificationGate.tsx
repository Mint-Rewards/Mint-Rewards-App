/**
 * Notices that notifications are off, and asks for them back.
 *
 * Sibling to <UpdateGate /> and <LocationGate /> in app/_layout.tsx, same
 * contract: renders null unless it decides a sheet is due, and only over Home.
 *
 * Policy is `shouldNudgeForNotifications` (pure, tested). This file gathers
 * the inputs, counts dismissals, and owns the one genuinely tricky part — a
 * permission can be revoked from OUTSIDE the app, in system settings, and
 * nothing here would ever hear about it. So the check re-runs whenever the app
 * comes back to the foreground, which is also the moment a person returns from
 * the settings screen this sheet sent them to.
 */
import { usePathname } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { NotificationNudgeModal } from "@/components/NotificationNudgeModal";
import { shouldNudgeForNotifications } from "@/utils/notificationNudge";
import { isProfileComplete } from "@/utils/profile";
import { posthog } from "@/utils/posthog";
import { checkPushPermission, promptForPush, type PushPermission } from "@/utils/push";
import { useAppStore } from "@/store/store";

/**
 * How many "not now"s before the app stops asking for this run.
 *
 * Session-scoped, exactly as LocationGate's is and for the same reason: this
 * bounds nagging within a run of the app without letting three taps months
 * apart permanently silence something the user needs. A relaunch asks again,
 * because by then the collection they will miss is a different one.
 */
const MAX_DISMISSALS = 2;

/**
 * Home is left alone briefly before the sheet arrives.
 *
 * Matches LocationGate's delay so the two feel like one app, and so this never
 * races a location modal onto the screen in the same frame.
 */
const APPEARANCE_DELAY_MS = 1200;

export default function NotificationGate() {
  const user = useAppStore((state) => state.user);
  const token = useAppStore((state) => state.token);
  const pathname = usePathname();

  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  const [dismissals, setDismissals] = useState(0);
  const [dismissedOnPath, setDismissedOnPath] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  // Exactly LocationGate's test. Home is "/home", not "/" — the tabs group
  // does not collapse to the root, and guessing it did meant this gate would
  // simply never have shown.
  const onHome = pathname === "/home" || pathname === "/(tabs)/home";

  const refresh = useCallback(async () => {
    const next = await checkPushPermission();
    setPermission(next);
    // A permission that came back re-arms the prompt path: whatever made
    // Settings necessary before no longer applies.
    if (next === "granted" || next === "provisional") setNeedsSettings(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Re-check on every return to the foreground.
   *
   * Two jobs at once. It catches someone switching notifications off in
   * settings weeks from now, and it is how this sheet learns that the user
   * did what it asked — they leave for Settings, flip the toggle, and come
   * back, and without this the sheet would still be sitting there telling
   * them to do the thing they just did.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // Let Home paint first. Tracked with a ref so leaving and returning to Home
  // does not re-arm the delay on every navigation.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!onHome || settled) return;
    settleTimer.current = setTimeout(() => setSettled(true), APPEARANCE_DELAY_MS);
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [onHome, settled]);

  if (!settled || permission === null) return null;
  if (dismissedOnPath === pathname) return null;

  const due = shouldNudgeForNotifications({
    permission,
    signedIn: Boolean(user?._id && token),
    profileComplete: isProfileComplete(user),
    onHome,
    dismissals,
    maxDismissals: MAX_DISMISSALS,
  });
  if (!due) return null;

  const dismiss = () => {
    posthog.capture("notification_nudge_dismissed", { permission });
    setDismissals((n) => n + 1);
    setDismissedOnPath(pathname);
  };

  const enable = () => {
    // Suppressed for this visit either way: the system dialog or the settings
    // app is about to cover this sheet, and leaving it underneath to be
    // revealed again is how a granted permission still looks like a refusal.
    setDismissedOnPath(pathname);

    if (needsSettings) {
      posthog.capture("notification_nudge_opened_settings");
      void Linking.openSettings().catch(() => {
        // Nothing useful to do: the sheet is already dismissed for this visit
        // and the foreground re-check will ask again next time.
      });
      return;
    }

    void promptForPush().then((result) => {
      posthog.capture("notification_nudge_prompted", {
        permission: result.permission,
        needs_settings: result.needsSettings,
      });
      setPermission(result.permission);
      // Remember that asking is spent, so the next showing offers Settings
      // instead of a button that would silently do nothing.
      setNeedsSettings(result.needsSettings);
    });
  };

  return (
    <NotificationNudgeModal
      visible
      needsSettings={needsSettings}
      onEnable={enable}
      onDismiss={dismiss}
    />
  );
}
