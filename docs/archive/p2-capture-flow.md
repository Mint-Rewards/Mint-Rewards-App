> **ARCHIVED — superseded, kept for history.**
> The P2 mobile capture-flow plan and the 15 journey-map issues it surfaced, with rulings. All 15 were closed; the shipped result is the location subsystem described in HANDOFF.md §10.
> Current documentation: [`docs/HANDOFF.md`](../HANDOFF.md).

---

# P2 Mobile Capture Flow — Location Capture

Spec authority: the master location-capture plan §P2. Repo: `Mint-Rewards-App`, branch
`feature/updated_location`. Backend counterpart (`feature/location-capture-p0`) already
serves `locationGate` on `/api/app-config`, `PATCH /api/users/location`, and
`POST /api/location/reverse-geocode`.

## Global Constraints

- **Class 2 discipline** (mint-rewards-change-control): `npx tsc --noEmit` clean;
  `npx expo lint` introduces no NEW errors/warnings over the recorded baseline; no
  native-affecting change (no app.json plugin/permission edits, no new native packages).
- **Never weaken profile-completeness gating** (`isProfileComplete`, consumed by
  `app/(tabs)/home.tsx` and `app/(tabs)/deals.tsx` — there is no `discounts.tsx`; that name
  was stale) — a business rule needing owner approval to change. As of `c478320` the rule
  INCLUDES the saved coordinate and address, by owner ruling; the screens no longer keep
  their own copies of it.
- **Device GPS is viewport only** — locked decision. A GPS fix must never enter pin
  state; only a deliberate tap/drag (or a previously saved coordinate) may.
- **Never silently overwrite a `user_placed` pin.**
- **Every geocoder-derived field is an editable dropdown; nothing is ever locked; no
  "FROM PIN" chips.**
- Auth header is the RAW token (no "Bearer") via `authenticatedFetch` in utils/api.ts —
  all new API calls go through it (mint-rewards-backend-api-contract).
- Registry strings are never edited; UI reads registry accessors from
  `utils/pakistan_areas.ts` only.
- Jest suite (231 tests) and tsc stay green. Pure logic goes in `utils/` modules with
  unit tests; component wiring is verified by typecheck + manual QA note.
- Commit messages end with the project's Claude trailer (see git log).

---

## Task 1 — MapPicker pin-state machine (P2.2)

**The bug:** `components/ui/MapPicker.tsx:78` — `requestAndCenter()` writes the device
GPS fix into pin state (`setPin(coords)`), and it runs automatically on open when no
saved coordinate exists (`:54`). A user who never touches the map can then hit Confirm
and save a coordinate that looks deliberate. This violates the locked "GPS is viewport
only" decision.

**1a. Pure state module `utils/pinState.ts`** with unit tests:

```ts
export type PinPlacement = "default" | "derived" | "user_placed";
export interface PinState {
  placement: PinPlacement;
  pin: { latitude: number; longitude: number } | null;
}
export const initialPinState: PinState; // { placement: "default", pin: null }
export type PinEvent =
  | { type: "open_with_saved"; latitude: number; longitude: number } // saved profile coordinate
  | { type: "gps_fix" }                                              // GPS arrived — viewport only
  | { type: "user_place"; latitude: number; longitude: number }      // tap or drag end
  | { type: "centroid"; latitude: number; longitude: number };       // selection-driven reposition
export function pinReducer(state: PinState, event: PinEvent): PinState;
```

Rules (each pinned by a test):
- `open_with_saved` → pin at the saved coordinate, placement `derived` (it was saved
  before; redisplaying it is not a new deliberate placement).
- `gps_fix` → **state unchanged, always**. The event exists so the invariant is
  testable: GPS can never mutate pin state.
- `user_place` → pin set, placement `user_placed`.
- `centroid` → if placement is `user_placed`, **state unchanged** (never silently
  overwrite); otherwise pin set, placement `derived`.

**1b. Rewire `components/ui/MapPicker.tsx`:**
- Replace the `pin` useState with the reducer (useReducer or useState + pinReducer).
- `requestAndCenter` animates the camera to the GPS fix and dispatches `gps_fix` —
  it must NOT place the marker. Keep `showsUserLocation` (the blue dot still shows
  where the user is; the marker is separate).
- Map tap and marker drag dispatch `user_place`.
- On open with parseable `initialLatitude/Longitude`, dispatch `open_with_saved`.
- Footer: when no pin, keep "No pin placed yet" and disabled Confirm (already
  correct); additionally show a small hint after a GPS center with no pin — reuse the
  existing hint line, change copy to "Drag the pin to your door — so the collector can
  find it" per the master plan's reframe (routing, not autofill).
- `onConfirm` gains an OPTIONAL third argument `placement: PinPlacement` (additive —
  existing caller keeps working). Pass the current placement.
- No styling overhaul; keep the file's existing visual language.

**1c. Make the pin actually required in `app/editProfile.tsx`:**
- `validateForm` (~:263-299) currently never checks lat/lng despite the
  "Exact Location (Pin) *" label at ~:641. Add: latitude and longitude must be
  non-empty parseable numbers, else validation error "Please pin your exact location
  on the map". Do not change any other validation rule.
- Capture the placement from the new third onConfirm argument into component state so
  Task 3 can persist `location.source` correctly. For now it is stored, not sent.

**Tests:** `__tests__/pinState.test.ts` covering every rule above, including:
gps_fix after open is a no-op; user_place then centroid is a no-op; centroid then
user_place upgrades; open_with_saved then gps_fix stays derived at the saved coords.
Component/validateForm changes are covered by tsc + the manual QA checklist note.

---

## Task 2 — Searchable pickers + province removal (P2.1 partial)

- Adopt `components/ui/LocationPicker.tsx` (currently dead code, zero imports) for BOTH
  city and town selection in `app/editProfile.tsx`, replacing the hand-rolled
  `renderDropdown` for those two levels (sub-area keeps the existing dropdown for now).
  Karachi's town list is 79 offered entries — unsearchable is a completion-rate risk.
- Town options come from `getSelectableTownsForCity(city)`; stored legacy values that
  are no longer selectable must still display (isLegacyTownValue) without being
  re-offerable.
- Remove the province dropdown: render at ~:615, options ~:143, cascade-clear ~:222-229,
  validateForm branch ~:269. `buildPayload` keeps sending `province`, now from
  `getProvinceForCity(city)`; when it returns null, send "" and do NOT block save
  (the P0.2d null path). `utils/profile.ts` `isProfileComplete` keeps requiring
  province — verify a city-picked save still satisfies it (test with a real city).
- Cascade: city change clears town + sub-area (existing behavior — preserve);
  town change clears sub-area.
- Sub-area label reads `getBlockLabel(city, town)` instead of a hard-coded "Block"/
  "Sub Area" string.
- Tests: pure helpers only (e.g. a small `utils/locationForm.ts` if logic is extracted);
  picker wiring verified by tsc + manual QA.

## Task 3 — Persist structured location (P2.3 + P1.4 wiring)

- New `utils/locationApi.ts`: `patchUserLocation(payload)` via authenticatedFetch to
  `PATCH ${API_BASE_URL}/api/users/location`; typed request/response mirroring the
  backend contract ({ Status, evaluation }).
- On editProfile save, AFTER the existing update-profile call succeeds, also PATCH the
  structured subset: cityId/areaId/blockId (+ *Other variants), houseNo (from the
  existing address field split? NO — keep houseNo out until the dedicated field ships;
  send only what the form actually captures today: cityId, areaId/areaOther,
  blockId/blockOther), and location { coordinates: [lng, lat], source, precision }
  where source/precision derive from Task 1's placement:
  user_placed → map_pin/building; derived-from-saved → legacy_string/unknown;
  no pin → omit location entirely.
- Failures of the PATCH are non-blocking: log via the existing logging path, do not
  break the save UX (the legacy dual-write on update-profile already persisted the
  strings server-side).
- Tests: pure mapper `buildLocationPatchPayload(formState)` unit-tested (placement →
  source/precision table, [lng,lat] order, omission rules).

## Task 4 — Analytics events (P2.7 subset)

- PostHog is already integrated (utils/posthog.ts). Emit: `map_opened
  { viewportSource }`, `pin_interacted { dragCount }`, `location_saved
  { source, precision }`, `area_overridden { geocodedAreaName?, selectedAreaName }`
  (fires only when a prefill existed — inert until prefill wiring), `flow_abandoned
  { lastStep }` on modal close without confirm.
- Event names/props verbatim from the master plan. A thin `utils/locationAnalytics.ts`
  wrapper, unit-tested for payload shape; call sites in MapPicker/editProfile.

## Deferred out of this plan (recorded, not dropped)

- Full new-user gated onboarding screens + client gate resolution order (P1.3 client
  side) — needs UX decisions (screen sequence vs editProfile) and the completion-award
  decision (open item 7). Next plan.
- Reverse-geocode prefill wiring + P2.6a override dashboard/demotion — ships with the
  gate flow, not before analytics exist.
- Sub-area picker curation (`subAreaRequired`), containment warning (needs centroids),
  disambiguation screen (P3.3), store compliance (P2.6 — non-code), satellite basemap
  (mapType prop is JS-only; include in the gate-flow plan alongside its QA).

---

# Issues surfaced by the journey map

Derived by walking every route in the journey map (`Pin to Doorstep`) against the code as
built at `b05efa2`. Each entry names the journey that surfaced it. Every claim below was
verified in the source, not inferred from the plan text.

Priority scale:

- **P0** — ship-blocking. Loses or corrupts data a user already gave us, or breaks the
  stated contract of a shipped behaviour.
- **P1** — high. A user hits it on a normal path and the result is wrong, lost or invisible.
- **P2** — medium. Degrades the flow or blinds us to it, but nothing breaks.
- **P3** — low / recorded. Known, bounded, and deliberately deferred.

---

## P0-1 · Saving the profile without opening the map destroys pin precision
**Journey J3, J8** · `app/editProfile.tsx:90,384` · `utils/locationApi.ts`

> **FIXED** in `f6d9d32`. `placement === null` now omits `location` entirely. Pinned by four tests, including one asserting that a pin the user *did* confirm as-is still reports — the omission rule must not swallow it.

`pinPlacementRef` initialises to `null` and is only written when the map confirms a pin.
A user who edits their phone number and saves — never touching the map — still reaches
`buildLocationPatchPayload(payload, null)`, and because their saved coordinates were
rehydrated into `formData`, `location` IS emitted:

```
null -> PLACEMENT_TRUST["derived"] -> { source: "legacy_string", precision: "unknown" }
```

So a coordinate that a user deliberately placed (`map_pin` / `building`, routable) is
overwritten as untrusted on the next unrelated profile edit, and `location.capturedAt` is
reset to now. The record gets monotonically worse the more a user maintains their profile
— the exact inverse of the intent.

The same path fires `location_saved` on every save, so the event over-counts pin captures
by however many profile edits happen.

**Fix direction:** omit `location` entirely when the user did not interact with the map
this session AND the coordinates are unchanged from the loaded profile. An absent key
means "don't touch", which is exactly the right message here. Only send `location` for a
coordinate this session actually produced.

**Regression test to add:** a save with `placement: null` and coordinates identical to the
loaded profile emits no `location` key at all.

---

## P0-2 · The awaited PATCH has no timeout, so "non-blocking" isn't
**Journey J1, J8** · `app/editProfile.tsx` (`submitProfile`) · `utils/api.ts`

> **FIXED** in `f6d9d32`. Bounded at 8s via a hand-built `AbortController` (`AbortSignal.timeout` is not reliably present on this runtime). A timeout is reported distinctly from a network fault. The test drives a real abort through the signal and was mutation-checked: raising the constant makes it hang exactly as the bug did.

`persistStructuredLocation` is awaited before the success alert, and `authenticatedFetch`
is a bare `fetch` with no `AbortSignal` and no timeout. On a stalled connection the user
sits on a spinner indefinitely after a save that has *already succeeded* server-side.

Task 3 committed to this call being non-blocking. It is non-blocking with respect to
*errors* but not with respect to *time*, which is the failure mode the debugging playbook
already records for this app ("requests hanging forever").

**Fix direction:** bound the call — `AbortSignal.timeout(~8s)` on the PATCH, treated as an
ordinary logged failure. Keep the await (it still guarantees the request goes out before
navigation); just cap what the user can be made to wait for.

---

## P1-3 · Android back button bypasses the map's close handler
**Journey J6** · `components/ui/MapPicker.tsx:188`

> **FIXED** in `f6d9d32`. `onRequestClose={handleClose}`.

```
<Modal visible={visible} animationType="slide" statusBarTranslucent>
```

No `onRequestClose`. React Native requires it on Android, and without it the hardware back
press does not route through `handleClose` — so `flow_abandoned` never fires for whatever
share of Android users close the map that way, and RN logs a warning. The abandonment
funnel silently under-reports on one platform.

Note both other modals in this flow get this right: `LocationPicker` and editProfile's own
picker modal both pass `onRequestClose`. MapPicker is the outlier.

**Fix direction:** `onRequestClose={handleClose}`. One line, and it makes the funnel
platform-symmetric.

---

## P1-4 · Changing city leaves the old city's pin attached
**Journey J5** · `app/editProfile.tsx` (`handleCitySelect`)

> **FIXED** in `f6d9d32`. A city change now clears `latitude`, `longitude` and the placement ref, so the user is sent back through the map and the next pin cannot inherit precision it never earned. **Open question deliberately not answered:** a TOWN change still keeps the pin, which within Karachi can still be ~30km wrong. Narrower than the city case and not part of this issue — decide it with the containment warning (P2-6).

The cascade clears `town`, `townOther`, `subArea` and `subAreaOther` — but not `latitude`
or `longitude`. Someone who moves from Karachi to Lahore keeps their Karachi coordinate,
and `validateForm` only checks that the pin *parses*, not that it is anywhere near the
selected city. The save is accepted and the structured record gets a Lahore address with a
Karachi point, tagged with whatever precision the old pin carried.

This is the highest-severity instance of the missing containment check, and unlike the
general case it needs no centroid data to detect — the city changed, so the pin is
by definition unverified.

**Fix direction:** clear the pin on a city change (with the placement ref), so the user is
sent back through the map. Cheaper interim: keep the pin but force placement back to
`derived` so it cannot claim `building` precision under a city it was not placed in.

---

## P3-5 · The "update your area" prompt names only the area  <sub>(was P1-5)</sub>
**Journey J7, J9** · `components/LocationUpdateModal.tsx` · `validateForm`

> **FIXED in `d7932b2`.** `LocationUpdateModal` takes `alsoNeedsPin`; home.tsx passes
> `!isDeliveryPointSet(user)`. Users who will be stopped by the pin requirement are told
> so in the prompt instead of discovering it when their save is blocked.

The E3 modal says: *"Please re-select your town and area."* Since Task 1, saving also
requires a map pin. A prompted user who has no saved coordinate — older accounts, the
population most likely to be caught by a registry retirement — is stopped by a requirement
the prompt never mentioned, after being told the job was re-selecting an area.

(Users who *do* have a saved coordinate are unaffected: rehydrate keeps `latitude` /
`longitude`, so only town and sub-area are blanked.)

**Fix direction:** either widen the modal copy to say a pin is needed, or exempt the E3
path from the pin requirement until the gate-flow plan lands. This is a copy/UX decision,
so it wants an owner ruling rather than a default.

> **RESOLVED by owner ruling.** A user with no saved coordinate has an incomplete profile
> and falls in the same category as a new user. So there is no unadvertised requirement to
> apologise for: that population was already blocked from deals for want of a coordinate,
> and being asked for a pin is the normal path for anyone incomplete, not an extra toll
> levied by the E3 prompt.
>
> **The exemption option is struck** — exempting the E3 path would have let an incomplete
> profile save as though it were complete, which is the opposite of the rule.
>
> What survives is the smaller half: the E3 modal's copy names only the area. Widening it
> for the subset who also lack a coordinate is optional polish, now **P3**, not a blocker
> for the QA round. Downgraded from P1.

---

## P2-6 · GPS-denied users start from a whole-country view, and the fix path is dead code
**Journey J2** · `components/ui/MapPicker.tsx` · `utils/pinState.ts`

> **PARTIALLY FIXED in `d7932b2` — the code half is done, the DATA half is not.**
> New `getSelectionRegion(city, town)` in `utils/locationForm.ts` reads the registry
> centroid (area first, then city) and the map opens there instead of on PAKISTAN_CENTER.
> It positions the CAMERA only, and that is a deliberate narrowing of the original fix
> direction: a centroid is where an area *is*, not where a person lives, and a marker
> nobody placed is one that can be confirmed by accident. `pinReducer`'s `centroid` event
> therefore stays unused — it belongs to the prefill flow, which asks a different question
> and ships with the gate-flow plan. That branch is inert on purpose now, same category as
> `area_overridden` (P3-10), not dead by neglect.
>
> **STILL OPEN — needs a sourced dataset.** `CITY_CENTROIDS` and `AREA_CENTROIDS` are both
> `{}`, so every lookup misses and the fallback is unchanged in the app today. Coordinates
> were NOT invented to fill them: a wrong centroid silently misplaces every user in that
> area. A test asserts the current all-null behaviour precisely so it FAILS the day the
> dataset lands, forcing the fallback assumptions to be revisited deliberately. City
> centroids alone would cover most of the benefit and are the smaller dataset.

With permission denied the map opens on `PAKISTAN_CENTER` (15° deltas) and the user must
pinch from national scale down to their rooftop. By that point the form already knows their
city and town.

`pinReducer` has a `centroid` event built and unit-tested for exactly this — reposition
from a selection, without overwriting a `user_placed` pin. **It is never dispatched
anywhere**; grep across `app/` and `components/` returns no caller. It is unreachable
because `CITY_CENTROIDS` and `AREA_CENTROIDS` in the registry are both empty objects.

Two separate gaps wearing one coat: no centroid data, and no wiring even if there were.

**Fix direction:** populate city centroids first (a much smaller dataset than area
centroids), then dispatch `centroid` on city/town selection when no pin exists. The
reducer rule already guarantees it cannot disturb a deliberate pin.

---

## P2-7 · A failed structured write is invisible and never retried
**Journey J8**

> **FIXED in `d7932b2`.** `location_patch_failed { reason }` fires alongside the existing
> log. Retry deliberately NOT added — as recorded in the original fix direction, the
> failure rate should be known before anything is retried against it. The event is what
> makes it knowable.

The PATCH failure is logged and swallowed, which is correct for the user. But:

- there is **no analytics counter**, so the failure *rate* cannot be seen next to
  `location_saved` — and `location_saved` fires regardless, so the dashboard will always
  show more structured saves than the database holds;
- there is **no retry**. The record stays stale until the user happens to save again.

**Fix direction:** emit a `location_patch_failed { reason }` event alongside the log, so the
gap between attempted and persisted is measurable. Retry is optional — the progressive-save
endpoint is safe to resend — but it should not be added before the failure rate is known.

---

## P2-8 · The `evaluation` response is thrown away
**Journey J1**

> **FIXED in `d7932b2`.** Kept in the store as `locationEvaluation`, set on every
> successful PATCH. Nothing reads it yet — it is the state the gate-flow plan resolves
> against, and it is the only authority on whether a location is finished, since the
> client's own check cannot know about `houseNo`.

`PATCH /api/users/location` returns `{ complete, missing, version, currentVersion, bucket }`
— the server's own verdict on whether this user's location is finished. The client parses it
into `LocationPatchResult` and then discards it.

Nothing consumes `bucket` or `missing`, so the client cannot tell a user what is still
needed, and the eventual location gate has no state to resolve against.

**Fix direction:** carry `evaluation` into the store on success. It is the natural
foundation for the gate-flow plan's client-side resolution order, and storing it now costs
nothing.

---

## P1-13 · "No coordinate means incomplete" is nowhere in the code that says `complete`
**Surfaced by the owner ruling on P3-5** · `utils/profile.ts` · `app/(tabs)/home.tsx:199`
· `app/(tabs)/deals.tsx:37`

The ruling is enforced today, but not by `isProfileComplete`. That function checks phone,
province, city, town/townOther and sub-area — **it never reads `latitude`, `longitude` or
`address`.** It returns `true` for a user the ruling calls incomplete.

The rule actually lives in two hand-written expressions in the screens, and they already
disagree about what `hasLocation` means:

| File | `hasLocation` | |
|---|---|---|
| `deals.tsx:37` | `lat && lng && address` | address folded in |
| `home.tsx:199` | `lat && lng` | address kept separate as `hasAddress` |

home.tsx compensates by writing `hasLocation && hasAddress` at the gates (`:302`, `:361`,
`:474`) — but **`:344` uses `hasLocation` alone**, so a user with coordinates and no street
address gets a "See All" link on the Upcoming Collections header while the card beneath it
is replaced by the "Location not set" prompt. That is the divergence already leaking.

Two smaller notes from the same read:

- This plan's own Global Constraints still say *"`isProfileComplete` in home.tsx and its
  duplicate in discounts.tsx"*. There is no `discounts.tsx` — it is `deals.tsx`. Stale text
  in a constraint that exists to protect a business rule.
- Nothing else in the app calls `isProfileComplete`; the only two call sites are these two
  screens. Consolidating is therefore cheap.

**Fix direction (needs owner sign-off — this is the gating rule the constraints protect):**
add one exported predicate that states the ruling once, e.g.
`isLocationCaptured(user)` = `lat && lng && address`, plus a `canUnlockDeals(user)`
combining it with `isProfileComplete` and `!needsLocationUpdate`. Both screens import it;
the two divergent definitions collapse; `:344` stops disagreeing with `:361`.

> **FIXED in `c478320` — owner chose the fold instead.** `isProfileComplete` now requires
> `latitude`, `longitude` and `address` directly. Both screens dropped their local copies
> of the rule, and the Upcoming Collections header (`:344`) now agrees with the card below
> it. The gate outcome is unchanged for every user — deals already required both halves —
> so this moved where the rule is written, not who gets in. Truthiness rather than
> parseability, mirroring exactly what the screens tested before, so no existing user's
> gate flips as a side effect.
>
> **The copy consequence was accepted with the decision.** home.tsx branches its prompt on
> `profileComplete`, so "Set your location to unlock deals" became unreachable and was
> removed rather than left as dead UI; deals.tsx lost the same string for the same reason.
> Users missing only a coordinate now see the generic "Complete your profile to unlock
> deals".
>
> **Reopened as P2-14** below — restoring the specific copy is now a small presentational
> change, not a gating one.

---

## P2-14 · The specific "set your location" copy is gone
**Consequence of the P1-13 fold, accepted at decision time** · `app/(tabs)/home.tsx` ·
`app/(tabs)/deals.tsx`

> **FIXED in `d7932b2`.** `isProfileComplete` is now composed of `isAreaAnswered` and
> `isDeliveryPointSet`. The gate still calls `isProfileComplete` and nothing else, so the
> split that caused P1-13 cannot return; the halves exist only to choose words. Both
> screens read "Set your location to unlock deals" again when the pin is the only gap.

A user whose only missing field is the pin now reads "Complete your profile to unlock
deals" — true, but it does not tell them which field to go and fill. Before `c478320` they
read "Set your location to unlock deals".

Nothing is broken and no gate is wrong; this is purely what the prompt says.

**Fix direction (presentational only — does not touch the gating rule):** branch the text of
the surviving prompt on whether the strings are already answered, e.g. an unexported
`isAddressAnswered(user)` used for copy selection alone. Both screens already have the user
object in hand.

---

## P3-9 · Nobody can reach `complete` — `houseNo` is never collected
**Journey J1** · recorded ruling

> **FIXED in `7db6ea7` — owner un-deferred it and chose MANDATORY.** The field ships in
> editProfile now, not with the gate-flow plan. Wording comes from `getHouseNoField`, so a
> household is asked for a house/flat number and an industrial plot for a unit/building
> name. It rides BOTH the update-profile call and the structured PATCH: the PATCH may fail
> or time out, and a field the user is now forced to fill must not be what a timeout
> discards. `update-profile` was checked in the backend first — it writes the leaf as a
> dotted `$set`, so it cannot wipe the siblings the PATCH writes.
>
> **`isProfileComplete` deliberately does NOT require it**, and the distinction is
> load-bearing. No existing user has a house number, so gating on it would lock every user
> out of deals until they re-saved. The coordinate could join `isProfileComplete` in
> `c478320` only because deals already required it — that moved where a rule lived without
> changing who got in. This would change who gets in, from everyone to nobody.
>
> **Open decision:** whether a profile without a house number should eventually count as
> incomplete. It is what the backend's tier-A completion already means, so the two
> definitions now disagree on purpose. Sequencing it behind a migration or a grace period
> is the safe path; doing it as a flag flip is not.

Every save returns `bucket: "has_pin_partial"`, because tier-A completion needs `houseNo`
and no field collects one. Harmless while the gate is soft; blocking the day it hardens.
Ships with the gate-flow plan.

---

## P3-10 · `area_overridden` has no call site
Deliberate, per the P2.6a ordering ruling — instrumentation ships before the thing it
measures. Listed only so a future reader does not "clean up" a dead export.

> **NO ACTION — correct as it stands.** Inert by the P2.6a ordering ruling: instrumentation
> ships before the thing it measures. Now joined by `pinReducer`'s `centroid` branch, inert
> for the same reason (P2-6).

---

## P3-11 · A 401 on the PATCH signs the user out immediately after a success alert
**Journey J8**

> **FIXED in `d7932b2`.** It was worse than first written up: because the PATCH is awaited
> *before* the alert, the sign-out redirect fired first and the congratulation landed on
> top of the login screen. The result now carries `unauthorized` and the alert is skipped.
> The save itself did land and shows on next login.

`patchUserLocation` goes through `authenticatedFetch`, which triggers the global
sign-out-and-redirect on 401. If the token expires between the PUT and the PATCH, the user
is bounced to the login screen seconds after "Profile updated successfully!".

Very narrow (the PUT would normally 401 first) but it is a user-visible consequence of a
call documented as non-blocking.

---

## P3-12 · An off-registry city empties `province` and un-completes the profile
**Journey J5** · the P0.2d null path

> **NO ACTION — unreachable and tested.** City is a closed list drawn from the same
> registry, so the null path cannot be entered today. Re-check the day a `cityOther` escape
> is added; the test will already be there.

`resolveProvinceForPayload` returns `""` for a city not in the registry, and
`isProfileComplete` requires `province` — so such a save would lock the user out of deals.
Unreachable today: city has always been a closed list drawn from the same registry. Tested,
recorded, and worth re-checking the day a `cityOther` escape is added.

---

## Status

**Every issue is closed.** 302/302 tests, tsc clean, lint at its 30-problem baseline.

| Issue | Outcome | Commit |
|---|---|---|
| P0-1 pin precision destroyed on save | Fixed | `f6d9d32` |
| P0-2 unbounded PATCH wait | Fixed | `f6d9d32` |
| P1-3 Android back bypasses close | Fixed | `f6d9d32` |
| P1-4 stale pin after city change | Fixed | `f6d9d32` |
| P1-13 completeness rule not in `isProfileComplete` | Fixed | `c478320` |
| P2-6 country-wide opening view | **Closed — dataset sourced and landed** | `d7932b2` + this pass |
| P2-7 failed write invisible | Fixed | `d7932b2` |
| P2-8 `evaluation` discarded | Fixed | `d7932b2` |
| P2-14 generic prompt copy | Fixed | `d7932b2` |
| P3-5 E3 prompt understates the ask | Fixed | `d7932b2` |
| P3-11 success alert over the login screen | Fixed | `d7932b2` |
| P3-9 `houseNo` uncollected | **Fixed — mandatory field** | `7db6ea7` |
| P3-10 `area_overridden` inert | No action — correct as-is | — |
| P3-12 off-registry city | No action — unreachable, tested | — |
| P2-15 house number outlives its town | **Closed — option 2, clears on a CITY change** | this pass |

### P2-6's dataset — closed 2026-08-26

`CITY_CENTROIDS` and `AREA_CENTROIDS` now hold **54/58 cities and 214/263 areas**, sourced
by `scripts/geocode-spike/centroid-sweep.js`: every registry name forward-geocoded through
LocationIQ *and* Google, kept only where the two agreed within the viewport the number
feeds (20km city / 5km area). The shipped coordinate is always LocationIQ's — OSM/ODbL,
which permits a persistent lookup; Google gates acceptance and contributes no value,
because its terms forbid building one from its output.

Nothing was invented. Coverage is partial because everything the two providers disagreed
about was dropped, and a drop is cheap: an area falls back to its city, a city to
PAKISTAN_CENTER — today's behaviour. `out/centroids-report.md` names every rejection.

Two guards earned their place on the first run. LocationIQ returned one identical "Sector G,
DHA Phase 2" point for *every* Islamabad sector query — a phrasing artifact that would have
dropped a whole tier-B city over the word "Sector"; asking for "F-6" as well recovered them.
And a duplicate-point check, run over the whole sweep at the end, revoked 7 entries that
cross-provider agreement had passed.

### Decisions taken since

- **P3-9 → mandatory house number** (`7db6ea7`). Un-deferred by the owner.
- **Town change clears the pin** (`7db6ea7`). The P1-4 sibling, closed.
  **REVERSED 2026-08-26** by owner ruling — see below. A CITY change still clears it.

## P2-15 · A house number outlives the town it was written for
**Surfaced by re-walking J5 after `7db6ea7`** · `app/editProfile.tsx`

Changing city or town clears the pin (P1-4 and its sibling) but keeps `houseNo`. "14-B" from
DHA Karachi survives a switch to Model Town Lahore, and since the field is now MANDATORY the
stale value satisfies validation and saves silently.

Introduced by the mandatory-house-number change: before it, there was no value to carry.

**Genuinely arguable, unlike the pin.** A coordinate is absolute — after a place change it is
provably wrong. A house number is relative: it is meaningless without its area rather than
incorrect within it, and someone who mis-tapped a town and corrected it usually still lives at
14-B. Clearing forces a retype in that case.

**CLOSED 2026-08-26 — option 2.** A city change now clears `houseNo`; a town change does
not. Both clearing sets are single exported constants in `hooks/useLocationForm.ts`
(`CLEARED_BY_CITY_CHANGE` / `CLEARED_BY_TOWN_CHANGE`), spread by all five paths that change
a place, so the asymmetry is stated once and unit-tested directly rather than being an
emergent property of five copied literals.

Options as they stood, in order of how much they trust the user:

1. Keep it (current). Fastest for the common correction; carries an unverified value otherwise.
2. Keep it but clear on a CITY change only — a different city is a much stronger signal than a
   different town within one.
3. Clear on any place change, matching the pin exactly.

Option 2 is the one worth considering: it matches the strength of the signal. Needs an owner
call, since all three are defensible.

---

### Still open

- ~~**P2-6's centroid dataset**~~ — closed 2026-08-26, see above.
- ~~**P2-15**~~ — closed 2026-08-26, option 2.
- **Whether a missing house number should make a profile INCOMPLETE.** The backend's
  tier-A completion already means that, so the client and server definitions now differ on
  purpose. Flipping it without a migration or grace period locks out every existing user.
- ~~**A `viewportSource: "area_centroid"` value** for `map_opened`, once centroids land.~~
  Added 2026-08-26 with the dataset, as `area_centroid` AND `city_centroid`. Without them
  the dataset would have silently redefined `default` from "shown the whole country" to
  "shown the whole country OR their own city", changing what the funnel counts with no
  dashboard change to explain it.

**Resolved by owner ruling:** P1-5 → downgraded to P3-5. No coordinate = incomplete = same
category as a new user, so the pin requirement needs no exemption and no apology.

### QA these fixes require (adds to the handoff checklist)

16. Save the profile with ONLY the phone number changed, never opening the map. Confirm
    the stored `location.source` / `location.precision` are **unchanged** (a previously
    `map_pin` / `building` pin must still say so) and `capturedAt` has not moved. This is
    the P0-1 regression and it is invisible from the app — check the user document.
17. Open the map on a saved pin, confirm without touching it, save. `location` SHOULD be
    written, as `legacy_string` / `unknown`. (The inverse of 16 — the fix must not have
    swallowed a real answer.)
18. Android only: open the map, press the hardware back button. `flow_abandoned` must fire
    with the correct `lastStep`.
19. With a pin already set, change the city. The location row must reset to "Set location
    on map", and saving without re-pinning must be blocked.
20. Put the device in airplane mode mid-save (or point at an unreachable host): the success
    alert must appear within ~8s, not hang.

### QA for the second round of fixes (`c478320`, `d7932b2`)

21. A user with city/town/sub-area answered but NO pin sees "Set your location to unlock
    deals" — not the generic "Complete your profile" — on both Home and Deals. (P2-14)
22. A user with nothing answered still sees "Complete your profile to unlock deals". (P2-14)
23. A user whose area was retired AND who has no saved coordinate sees the extra sentence
    in the update modal: "You'll also need to pin your exact location on the map." A user
    with a saved coordinate does NOT see it. (P3-5)
24. Deals stay locked for a no-coordinate user, exactly as before — this round must not
    change WHO gets in, only what they are told. (c478320)
25. Force a PATCH failure (unreachable host) and confirm `location_patch_failed` reaches
    PostHog with a reason, while the user still sees the success alert. (P2-7)
26. Expire the token between the two calls if you can arrange it: the user should land on
    the login screen with NO success alert on top of it. (P3-11)
27. **(REWRITTEN — centroids shipped 2026-08-26.)** With GPS denied and no saved pin, the
    map opens on the user's own town if the sweep confirmed it, otherwise on their city,
    otherwise on PAKISTAN_CENTER. Check all three: a covered town (Karachi -> DHA), an
    uncovered one (Karachi -> Bahria Town Karachi, which was rejected and must fall back to
    Karachi), and a free-text town (falls back to the city too). `map_opened` must report
    `area_centroid` / `city_centroid` / `default` to match what is on screen.

### QA for the mandatory house number and town-change pin (`7db6ea7`)

28. Saving without a house number is blocked, and the error names the field the way the
    screen does ("House / flat no. is required").
29. In a residential area the field reads "House / flat no."; in a non-residential one
    (e.g. an industrial area) it reads "Unit / building name". Both with matching examples.
30. Save a house number, leave the screen, come back: it is still there. (It must rehydrate
    from `structuredAddress.houseNo`, not be retyped.)
31. Force the structured PATCH to fail, then re-open the profile: the house number must
    STILL be there — it rides update-profile too, which is the whole point.
32. Existing users are NOT locked out of deals for lacking a house number. Deals must
    behave exactly as before this change for anyone who already qualified.
33. **REVERSED 2026-08-26 — this now asserts the OPPOSITE.** With a pin set, change the town
    — by picker, by "Other", by a "did you mean" suggestion, and by the back-to-list button.
    All four must **KEEP** the pin, and the save must still go through. The old wording
    required the opposite — all four clearing the pin and blocking the save until it was
    re-placed — which under the Province -> City -> Pin ordering made a corrected town
    unsaveable. Also confirm the CITY case still clears it.
34. Changing town and re-opening the map: it opens on the NEW town (or its city — see 27),
    never on the old one and never on the country.
35. **(REVERSED by the P2-15 ruling.)** Change the CITY with a house number set: the house
    number is now CLEARED and the field is empty and required again. Change only the TOWN
    with one set: it SURVIVES. Both halves must hold — the asymmetry is the decision.

### QA for the Karachi prefill widening (`c4805ed`)

Steps 63-72. This pass changed **which areas may be pre-selected at all** and added a
visible "we guessed this" note, so most of what follows is about telling the two apart on
screen. Everything here needs `LOCATIONIQ_API_KEY` **set** on the backend — see 71, which is
the reason none of it is reachable in today's production state.

63. **Prefill now fires outside DHA and Korangi.** Place a pin in Clifton, then Nazimabad,
    then Gulshan-e-Iqbal. Each must fill the Town field. Before this pass only DHA and
    Korangi did — every other Karachi area left the dropdown empty, which is what made the
    modal feel broken everywhere else.
64. **The guess note, and where it must NOT appear.** In Clifton or Nazimabad the Town field
    shows an amber "We guessed this from your pin — please check it's right." In **DHA,
    Korangi, PECHS and Gulistan-e-Jauhar it must NOT appear** — those four carry measured
    precision (n≥20, ≥85%) and are presented as answers. A note on every prefill is a note
    nobody reads; if it shows on DHA, the tier lookup is broken.
65. **The note clears when the user answers.** With the note showing, pick any town by hand.
    The note must disappear immediately — even if the town you picked is itself provisional.
    It tracks *provenance* (did a pin guess this?), not the area.
66. **No note on a rehydrated town.** Open Edit Profile for a user with a saved town and no
    new pin activity. No note: those strings are the user's own answers and were never
    guessed at.
67. **Sub-area recovery for the three fixed shapes.** Place pins so the geocoder returns
    each, and confirm the sub-area fills:
    - Gulistan-e-Jauhar → Block fills (this is the 27-point alias bug; it used to resolve to
      the WRONG town, "Gulshan-e-Iqbal", not to nothing);
    - Nazimabad → Block fills even though the geocoder says "Nazimabad 4";
    - Federal B. Area → Block fills from the bare name "Ancholi".
68. **Town without sub-area is a valid outcome.** In Shah Faisal Colony the Town must fill
    and the sub-area must stay EMPTY. The geocoder says "Block 5"; the registry writes that
    town's sub-areas as "Shah Faisal Colony 1..5". Filling the block there would be an
    invention — an empty dropdown is the correct answer.
69. **Regression — industrial areas still never prefill.** Place a pin on Korangi Industrial
    Area, SITE or West Wharf. The town must NOT be pre-selected, with or without a note. The
    residential veto outranks every tier, and this pass must not have opened it.
70. **Regression — other cities are untouched.** In Lahore, place a pin anywhere. No prefill,
    no note. The widening is Karachi-only; Lahore has a full registry and no sweep behind it.
71. **With the key unset, none of this exists.** With `LOCATIONIQ_API_KEY` unset (today's
    production state), placing a pin must fill nothing and show no note — same as QA 56.
    **This is the default state, so 63-70 are unreachable until the key is set.** Do not read
    a clean run of 71 as evidence that any of the above works.
72. **Second visit to the same spot — the known degradation.** Place a pin, note what fills,
    then have a DIFFERENT user place a pin at the SAME coordinate (or re-place after the
    cache is warm). The second one will fill LESS: measured on the sample, town prefill drops
    62% → 33% and sub-area 36% → 9%. This is not a client bug — the backend returns
    `unmatched: []` on a cache hit, and the client's second pass is what produces ~47% of all
    prefills. Record what you see; the fix is a backend change (see the handoff).
