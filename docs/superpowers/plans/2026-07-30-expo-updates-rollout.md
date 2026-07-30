# Expo Updates (OTA) Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on Expo OTA updates end-to-end for the `preview` channel — config is already correct, this plan adds startup visibility into update status and validates the whole flow on a real rebuilt binary.

**Architecture:** `app.config.js` already has a working `updates` block (url, fingerprint runtime version, `ON_LOAD` auto-check). This plan adds one new util (`utils/otaUpdates.ts`) that reads `expo-updates`' launch-status fields and reports them via `console.log`/`console.warn` and a PostHog event, wires a single call to it into the existing startup `useEffect` in `app/_layout.tsx`, then validates the full publish → rebuild → relaunch cycle against the `preview` channel only.

**Tech Stack:** Expo SDK 56, `expo-updates` ~56.0.23, `posthog-react-native`, TypeScript ~6.0.3, EAS Build/Update CLI.

## Global Constraints

- No automated test runner exists on `main` (no jest, no `test`/`typecheck` npm scripts) — verification for every task is `npx tsc --noEmit` (must exit 0) + `npx expo lint` (current baseline as of 2026-07-30: **24 problems — 10 errors, 14 warnings, exit code 0**; a task must not add NEW errors/warnings beyond this baseline) + manual runtime verification. Do not treat "no jest tests" as license to skip verification — run the manual steps.
- Never hand-edit `android/` or `ios/`. All native/update config lives in `app.config.js`, already correct — do not touch `runtimeVersion`, `eas.json` channels, or the `updates.url` value in this plan.
- Roll out to the `preview` channel only. Do not publish to or otherwise touch the `production` channel/branch in this plan.
- Any new native-module import must follow this repo's lazy-require guard pattern (see `utils/googleAuth.ts` lines 5–13): `require()` inside a top-level `try/catch`, `console.warn` on failure, every consumer no-ops if the module didn't load. This protects against a device still running a binary built before `expo-updates` was linked in.
- This change requires a rebuild of the `preview` EAS profile before it can be validated or take effect on any device — no JS-only step can substitute for this.
- `posthog.capture(eventName, properties)` is the existing call pattern in this repo (see `app/login.tsx:106`, `app/register.tsx:102`) — reuse it, don't introduce a second telemetry pathway.

---

### Task 1: `utils/otaUpdates.ts` — read and report update launch status

**Files:**
- Create: `utils/otaUpdates.ts`
- Test: manual (no jest on `main`; see verification steps below)

**Interfaces:**
- Consumes: `posthog` named export from `@/utils/posthog` (existing, `posthog.capture(name: string, properties?: Record<string, unknown>): void`).
- Produces: `reportUpdateStatus(): void` — synchronous entry point, safe to call and forget (never throws, never returns a promise the caller needs to await). Task 2 imports this exact name.

- [ ] **Step 1: Write `utils/otaUpdates.ts`**

```ts
import { posthog } from "@/utils/posthog";

// Loaded lazily so a device still running a binary built before expo-updates
// was linked in (or Expo Go, or web) can't crash on import — same pattern as
// utils/googleAuth.ts.
let Updates: any;

try {
  Updates = require("expo-updates");
} catch {
  console.warn(
    "[otaUpdates] expo-updates native module not found — rebuild the app to enable OTA updates."
  );
}

/**
 * Reads this launch's OTA update status and reports it via console + PostHog.
 * Call once at app startup. Never throws and never blocks startup.
 */
export function reportUpdateStatus(): void {
  if (!Updates) return;

  try {
    const status = {
      isEmbeddedLaunch: Boolean(Updates.isEmbeddedLaunch),
      isEmergencyLaunch: Boolean(Updates.isEmergencyLaunch),
      emergencyLaunchReason: Updates.emergencyLaunchReason ?? null,
      updateId: Updates.updateId ?? null,
      channel: Updates.channel ?? null,
    };

    console.log("[otaUpdates] launch status:", status);

    if (status.isEmergencyLaunch) {
      console.warn(
        `[otaUpdates] emergency launch — fell back to embedded bundle. Reason: ${status.emergencyLaunchReason}`
      );
    }

    posthog.capture("ota_update_launch", status);
  } catch (error) {
    console.warn("[otaUpdates] failed to report update status:", error);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit code 0, no new errors.

- [ ] **Step 3: Lint**

Run: `npx expo lint`
Expected: exit code 0, problem count unchanged from the 24-problem (10 errors, 14 warnings) baseline recorded above — `utils/otaUpdates.ts` introduces zero new lint problems.

- [ ] **Step 4: Manual smoke check in isolation**

Run: `npx expo start` (dev client or simulator via `npx expo run:ios` / `npx expo run:android` — Expo Go will not have `expo-updates` fully wired, a dev-client build is required to see real values), then in a scratch screen or the Metro console temporarily call `reportUpdateStatus()` — or skip straight to Task 2, since the wiring is one line and testing it in place is equivalent.
Expected: no crash; if called before Task 2 wires it in, this step can be skipped and folded into Task 2's verification instead.

- [ ] **Step 5: Commit**

```bash
git add utils/otaUpdates.ts
git commit -m "feat: add OTA update launch status reporting util"
```

---

### Task 2: Wire `reportUpdateStatus()` into app startup

**Files:**
- Modify: `app/_layout.tsx:16` (imports) and `app/_layout.tsx:70-73` (startup `useEffect`)

**Interfaces:**
- Consumes: `reportUpdateStatus` from `@/utils/otaUpdates` (produced in Task 1).
- Produces: nothing new consumed by later tasks — this is the last code task.

- [ ] **Step 1: Add the import**

In `app/_layout.tsx`, alongside the existing `import { configureGoogleSignIn } from '@/utils/googleAuth';` (line 16), add:

```ts
import { reportUpdateStatus } from "@/utils/otaUpdates";
```

- [ ] **Step 2: Call it in the startup effect**

The existing startup effect (`app/_layout.tsx:70-73`) currently reads:

```ts
    checkAuth();
    configureGoogleSignIn();
  }, []);
```

Change it to:

```ts
    checkAuth();
    configureGoogleSignIn();
    reportUpdateStatus();
  }, []);
```

Call order doesn't matter here — all three are independent, fire-and-forget startup calls (this matches the existing style: `checkAuth()` is async and not awaited, `configureGoogleSignIn()` is sync — `reportUpdateStatus()` is sync and follows the same fire-and-forget convention).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 4: Lint**

Run: `npx expo lint`
Expected: exit code 0, still 24 problems (10 errors, 14 warnings) — unchanged from baseline.

- [ ] **Step 5: Manual verification on a dev client**

Run `npx expo run:ios` (or `run:android`) to build and launch a dev client (Expo Go cannot exercise this — see `expo-react-native-reference` skill, §2). Confirm in the Metro console:
- A line `[otaUpdates] launch status: {...}` appears exactly once at startup.
- `isEmbeddedLaunch: true`, `updateId: null`, `channel: null` (a locally-run dev client has no EAS channel — this is expected and correct; real values only appear on an EAS-built `preview` binary, validated in Task 3).
- No new warnings, no crash, existing login/auth flow still works (`checkAuth()` still redirects correctly — this call must not interfere with the existing startup logic).
- Open the PostHog project (`POSTHOG_HOST`/`POSTHOG_PROJECT_TOKEN` are already configured for `preview`, confirmed via `eas env:list --environment preview`) and confirm one `ota_update_launch` event landed with the same field values as the console log.

- [ ] **Step 6: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: report OTA update launch status at app startup"
```

---

### Task 3: Rebuild, publish to `preview`, and validate the full OTA cycle

**Files:** none (CLI-only task — no code changes)

**Interfaces:**
- Consumes: `reportUpdateStatus()` wiring from Task 2 (must be committed first).
- Produces: a validated, working OTA update pipeline on the `preview` channel. Nothing downstream depends on this task's outputs in code.

This is the step that actually proves updates work — Tasks 1–2 alone cannot, since no EAS-built binary yet exists with this code AND a linked `expo-updates` native module.

- [ ] **Step 1: Confirm the channel/branch mapping exists**

Run: `eas channel:list`
Expected: a `preview` channel is listed. If it isn't linked to a branch yet, the next step's `eas update` command will prompt to create/link one — accept that prompt (do not link `preview` to any branch already used by `production`).

- [ ] **Step 2: Build the `preview` profile**

Run: `eas build --profile preview --platform ios` (repeat with `--platform android` if validating both platforms)
Expected: build succeeds. This binary is the first to have both `expo-updates` linked natively AND the Task 1–2 JS wiring baked in as its embedded bundle.

- [ ] **Step 3: Install and launch the rebuilt binary**

Install the build artifact on a device/simulator per the `preview` profile's distribution (`distribution: "internal"` — see `eas.json`).
Expected: on first launch, console (or a device log capture) shows `[otaUpdates] launch status: {"isEmbeddedLaunch": true, "isEmergencyLaunch": false, "emergencyLaunchReason": null, "updateId": null, "channel": "preview"}`. `channel: "preview"` confirms the binary is correctly bound to the `preview` EAS Update channel — if this is `null` or wrong, stop and re-check the `eas build` profile/channel before proceeding.

- [ ] **Step 4: Publish a trivial JS-only change to the `preview` branch/channel**

Make any trivial, reversible JS-only change (e.g. a temporary console log or comment), then:

```bash
eas update --branch preview --channel preview -m "Validate OTA update pipeline"
```

Revert the trivial change locally after publishing (don't leave throwaway debug code in `main`).

- [ ] **Step 5: Relaunch twice and confirm the update applies**

- First relaunch of the already-installed binary: the update downloads in the background (per `checkAutomatically: "ON_LOAD"` — no user-visible interruption, matching the chosen "silent" behavior).
- Second relaunch: console log now shows a populated `updateId` (a UUID, no longer `null`) and, if your trivial change was visible in the UI, the change is present.
Expected: `updateId` changes between first and second relaunch, `channel` stays `"preview"`, no crash, no emergency-launch fallback (`isEmergencyLaunch: false`).

- [ ] **Step 6: Confirm PostHog visibility**

In the PostHog project, confirm two distinct `ota_update_launch` events landed — one with `updateId: null` (pre-update) and one with the new UUID (post-update). This is the concrete proof that the visibility layer built in Task 1 actually works end-to-end, not just in a local dev client.

- [ ] **Step 7: Record the outcome**

No commit needed (no code changed in this task beyond the already-committed Tasks 1–2). If any step failed, stop here and diagnose before considering this plan complete — do not proceed to publishing on `production` under any circumstance as part of this plan.

---

## Explicitly out of scope for this plan (confirm before ever doing these)

- Publishing to the `production` or `development` channels.
- Any change to `eas.json`, `runtimeVersion`, or the `updates.url` value in `app.config.js`.
- A manual "check for updates" UI affordance, forced-update prompts, or staged/percentage rollouts.
- New rollback/recovery code beyond `expo-updates`' built-in emergency-launch fallback.
