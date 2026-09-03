# 2.1.10 submission branch — what ships, what waits for OTA

Branch: `release/2.1.10-submission`, HEAD `2e61c63`, cut from
`feature/updated_location` @ `a647604`. Jest 249/249, `tsc --noEmit` clean,
`expo lint` 30 problems (10 errors, 20 warnings) — identical to baseline.

## Ships in the binary

- **MapPicker GPS fix** (`67d87c6`, `utils/pinState.ts`) — device GPS can no longer
  become a saved pin. A standalone bug fix; strictly an improvement over what is live.
- **Karachi registry expansion** (P0.6, 29 → 96 stored / 79 offered) plus the
  deprecation set. Existing stored values stay valid (`isLegacyTownValue` accepts
  deprecated towns), so no user is forced through `LocationUpdateModal`.
- Registry export generator + generated artifact — build-inert (test fixture only).

## Deliberately NOT in the binary

- **The pin requirement in `validateForm`** — removed on this branch (`2e61c63`), with
  the exact block quoted in the comment that replaces it. Re-enable via OTA together
  with the flow.

## Waits for OTA against the 2.1.10 runtime (all JS-only, all verified as such)

Searchable city/town pickers · province-dropdown removal · `getBlockLabel` ·
structured-save wiring to `PATCH /api/users/location` · PostHog events ·
gated onboarding screens + client gate resolution · reverse-geocode prefill +
P2.6a override instrumentation · satellite basemap (`mapType` prop) ·
the pin requirement.

## Before submitting — owner actions

1. **Bump `version` to `"2.1.10"`** in `app.config.js:200` (currently `"2.1.9"`).
   Class 5, owner-only. This also defines the OTA runtime branch, since
   `runtimeVersion` policy is `appVersion` (`app.config.js:331`).
2. **Store metadata must describe the FINAL state, not this build's** — privacy
   nutrition labels and Play Data Safety ship with the binary and cannot be OTA'd.
   Declare precise-location collection now, because the OTA will introduce it.
3. **Bundle the outstanding Guideline 2.3.3 iPad screenshots** into this submission.
4. iOS usage strings need no change — `NSLocationWhenInUseUsageDescription`
   (`app.config.js:234`) already describes pinning an address for pickups. Verify the
   wording still matches the final flow before submitting; it is native and immutable
   after this build.
5. **Manual QA owed** on a device — the five MapPicker scenarios in
   `.superpowers/sdd/p2-capture-flow/task-1-report.md`.

## Open decision: the unsearchable 79-entry town dropdown

This build ships the expanded registry with the OLD hand-rolled dropdown. A Karachi
user scrolls 79 alphabetical entries instead of 29. Not blocking (no hard gate in this
build) and they can now find their real area rather than falling to `townOther` — but
it is worse ergonomics than either the current store build or the post-OTA state.

Two options:
- **Submit now**, accept the scroll for the review + rollout window, OTA the picker.
- **Land P2 Task 2 first** (searchable picker, ~one task) and submit after, so the
  binary is comfortable on its own and the OTA carries only the flow.

Recommendation: the second, if the schedule tolerates one more task before submitting.

## Ordering

Backend (`feature/location-capture-p0`) deploys with `LOCATION_GATE_MODE=soft` before
the OTA lands — not necessarily before the store build, which contains no gate logic.

**`minClientBuild` caveat:** once 2.1.10 receives the flow by OTA, build number no
longer tells the server whether the capture screens exist in a given install. Updates
apply on the launch AFTER download (`checkAutomatically: "ON_LOAD"`,
`fallbackToCacheTimeout: 0`), so there is a window where a 2.1.10 user does not yet
have them. Keep the gate `soft` until OTA adoption is confirmed, or gate on a constant
shipped inside the OTA bundle rather than on build number.
