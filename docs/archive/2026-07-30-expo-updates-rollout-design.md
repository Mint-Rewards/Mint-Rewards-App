> **ARCHIVED — superseded, kept for history.**
> The design behind the plan above. Same caveat: it describes a `fingerprint` policy that was never enabled.
> Current documentation: [`docs/HANDOFF.md`](../HANDOFF.md).

---

# Expo Updates (OTA) Rollout — Design

> **SUPERSEDED** by the UpdateGate implementation (`components/UpdateGate.tsx`, `utils/versionGate.ts`, backend `/api/app-config`). The planned `utils/otaUpdates.ts` was never built and will not be; this document is also stale on config facts — `app.config.js` now has a live `updates` block and `runtimeVersion` is `appVersion`, not `fingerprint`. Kept for history only.

Date: 2026-07-30

## Context

`expo-updates` (`~56.0.23`) is already a dependency, `app.config.js` already sets
`runtimeVersion: { policy: "fingerprint" }`, and `eas.json` build profiles already carry
`channel` fields (`development`, `preview`, `production`, `testflight-preview`). None of
this is wired up: `app.config.js` has no `updates` block (no `updates.url`), and no code
in the app calls any `expo-updates` API. Nothing currently checks for or applies an OTA
update at runtime.

## Goals

- Turn on OTA updates: check on launch, download in background, apply silently on the
  next cold start (the `expo-updates` `ON_LOAD` default).
- Give the team visibility into update adoption and failures, since this repo has no
  error monitoring today.
- Roll out to the `preview` channel only for now. `production` stays untouched until
  `preview` is validated on a real rebuilt binary.

## Non-goals

- No in-app "check for updates now" button or user-facing update prompt (silent apply
  was the explicitly chosen behavior).
- No changes to `eas.json` — the channels needed already exist.
- No rollout to `production` or `development` channels as part of this change.
- No custom rollback/recovery logic beyond what `expo-updates` already provides
  (`isEmergencyLaunch` fallback-to-embedded is SDK-native behavior); this change only adds
  *visibility* into that behavior, not new recovery mechanics.

## Design

### 1. Config layer — `app.config.js`

Add an `updates` block to the shared (non-variant) part of the exported config:

```js
updates: {
  url: `https://u.expo.dev/${easProjectId}`,
  enabled: true,
  checkAutomatically: "ON_LOAD",
  fallbackToCacheTimeout: 0,
},
```

`easProjectId` is the same id already used at `extra.eas.projectId`
(`7a49df03-9e0f-4272-acfc-5bcb7fd8e30a`) — reuse the existing constant/variable rather
than duplicating the literal.

`checkAutomatically: "ON_LOAD"` is the SDK default; setting it explicitly documents the
chosen behavior (check on launch, apply next launch) so it isn't left to tribal
knowledge. `fallbackToCacheTimeout: 0` means the app never blocks startup waiting on a
network check — it launches immediately with whatever is cached/embedded and applies any
newly-downloaded update on the following launch.

No changes to `runtimeVersion` or to `eas.json` — both are already correct for this work.

### 2. Runtime layer — `utils/otaUpdates.ts`

New file, single exported function, e.g. `reportUpdateStatus()`. Called once at boot from
`app/_layout.tsx`, alongside the other startup calls already there (auth check,
`configureGoogleSignIn()`).

Behavior:

- Read `Updates.isEmbeddedLaunch`, `Updates.isEmergencyLaunch`,
  `Updates.emergencyLaunchReason`, `Updates.updateId`, `Updates.channel`.
- Log the values through the existing `utils/logger.ts` logger.
- Fire one PostHog event (`posthog-react-native` is already integrated) with those fields
  as properties — event name `ota_update_launch`. This is what makes emergency-launch
  fallbacks (a device that rejected an update and fell back to the embedded bundle)
  visible without manually pulling device logs.
- Wrap all `Updates.*` reads in a guard (module may be a no-op stub in Expo Go / web,
  consistent with this repo's existing lazy-require pattern for fragile native modules) —
  do not let this call throw or block app startup under any circumstance.

No manual `checkForUpdateAsync` / `fetchUpdateAsync` calls — `ON_LOAD` already does the
check/download; adding manual calls on top would duplicate that behavior for no benefit.

### 3. Rollout process

Publish only to the `preview` channel:

```bash
eas update --branch preview --channel preview -m "<message>"
```

`production` is not touched by this change. A separate, explicit decision (owner
sign-off, per this repo's change-control rules) is required before ever publishing to
`production`.

### 4. Rebuild requirement

`expo-updates` was added to `package.json` in a prior commit, but no binary is confirmed
to have been rebuilt since. A device running an older binary has no native
`expo-updates` module linked in and can never check for or receive an update — this
cannot be fixed by any JS-only change. This work therefore requires a fresh
`preview`-profile build (`eas build --profile preview`) before any of it can be
validated or take effect. This makes the change class 3 (native-affecting) under this
repo's change-control rules even though no new package is being added.

### 5. Validation checklist

1. Rebuild the `preview` profile and install the resulting binary on a device/simulator.
2. Confirm at launch: `Updates.channel === "preview"`, `Updates.updateId` populated,
   PostHog receives the `ota_update_launch` event.
3. Publish a trivial JS-only change to the `preview` branch/channel.
4. Relaunch the app twice: first launch downloads the update in the background, second
   launch runs the new code.
5. Confirm the PostHog event and log line reflect the new `updateId` on the second
   launch.

## Error handling

- All `Updates.*` reads in `utils/otaUpdates.ts` are wrapped so a failure (e.g. running
  in Expo Go, where the module is a stub) degrades to a no-op log line, never a crash.
- Emergency-launch fallback (device rejects an update, reverts to embedded bundle) is
  handled by `expo-updates` itself; this change adds no new recovery code, only logging
  so the fallback is visible.

## Testing

No automated tests exist on `main` for this kind of runtime/startup behavior (repo has
no CI). Validation is the manual checklist in section 5, run against a real rebuilt
`preview` binary — this cannot be verified via typecheck/lint alone since `expo-updates`
does not run inside Expo Go's fixed native module set in a way that reflects the real
update flow.
