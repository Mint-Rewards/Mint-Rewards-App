# Location Gate — design (2026-08-25)

Repo: `Mint-Rewards-App`, branch `feature/updated_location`, base `7db6ea7`.
Backend counterpart already deployed on `feature/location-capture-p0`.

The deferred P1.3-client / P2.6a work: the two modals that meet a user on Home and
either finish their profile or confirm the address derived from their pin.

## Journeys this serves

**New user:** open → sign up → verify email → log in → Home → blocked by "Finish your
profile" → completes → saved.

**Existing user:** open → log in → Home → *has a pin* → "Just your house no." confirming a
reverse-geocoded address, every field editable → confirms → saved. *No pin* → "Finish your
profile".

**The pin is the discriminator, not overall completeness.** Someone with a pin but no house
number goes to the confirm modal and fills it inline rather than being sent round the form.

## Owner decisions (settled during brainstorming)

| Decision | Ruling |
|---|---|
| What counts as incomplete | Everything, house number included. ~100% of existing users meet a modal once. |
| Kill switch | Client honours `locationGate.mode` + `maxDismissals` from `/api/app-config`. |
| Re-ask cadence | Never, until the server bumps `LOCATION_COMPLETION_VERSION`. |
| Points | **Not shipped.** Mockups promise +100/+50; nothing awards them. Copy is "Continue" / "Save". |
| Locked rows / FROM PIN chip | **Rejected** — mockup conflicts with the locked constraint and with the owner's own "all fields editable". Everything is editable. |
| Province | **Derived** from city, never shown, never editable. Preserves `502b162`. |
| Street address | Optional. Derived from the geocoder where possible. |

## Resolution order

Pure module `utils/locationGate.ts`:

```ts
resolveLocationGate({ user, config, dismissals, build }): GateDecision
```

1. `config.mode === "off"` → `none` (server kill switch)
2. `user.locationVersion >= LOCATION_COMPLETION_VERSION` → `none` (already confirmed)
3. has parseable coordinates → `confirm`
4. otherwise → `finish`, carrying the missing-field list

`soft` permits up to `maxDismissals` skips before blocking; `hard` never offers skip;
`minClientBuild[platform]` escalates an outdated build to at least soft. Fails OPEN: an
unreachable config, a malformed body, or an absent `locationGate` all resolve to `none`,
because a broken gate must never be able to lock the whole userbase out of the app.

## Components

- `components/LocationGate.tsx` — sibling to `<UpdateGate />` in `app/_layout.tsx`.
  Renders null unless it decides to show. Owns dismissal counting.
- `components/location/FinishProfileModal.tsx` — progress bar, checklist rows (✓ or
  chevron), each routing to the field it names. CTA "Continue".
- `components/location/ConfirmAddressModal.tsx` — map strip + "Adjust pin" (existing
  MapPicker), `LocationFields`, house number marked REQUIRED. CTA "Save".
- `components/location/LocationFields.tsx` + `hooks/useLocationForm.ts` — the cascade, the
  "Other" escapes, pin-clearing on a place change, and validation. **Extracted from
  `app/editProfile.tsx`, which then consumes it.** One copy of the rules; this codebase has
  been bitten three times by the same concept implemented twice.

## Data flow — confirm modal

1. Open → `POST /api/location/reverse-geocode` with the saved coordinates.
2. `resolved: true` → prefill City / Town / Sub-Area / Street, each passed through
   `shouldPrefillArea(city, town)` so a consumer is never pre-selected into a port,
   campus or industrial estate.
3. `resolved: false` → prefill from the user's OWN saved fields. This is the common path
   when `LOCATIONIQ_API_KEY` is unset, where every call returns false. The modal is an
   address confirmation; the geocoder is an enhancement, not a precondition.
4. Editing a prefilled area emits `area_overridden { geocodedAreaName, selectedAreaName }`
   — the first call site for an event that has shipped inert since `b05efa2`.
5. Save → `update-profile` then `PATCH /api/users/location` → `evaluation.complete` →
   server stamps `locationVersion` → stored → the gate goes quiet permanently.

## Completeness rule change

Protected business rule; changed with explicit owner approval.

```
isDeliveryPointSet:  lat && lng && address   →   lat && lng
isProfileComplete:   + houseNo
```

Net: a house number replaces a free-text street. Tighter, not looser — a house number
routes; "12 Main Street, Suburb" does not.

## Testing

- `resolveLocationGate` — table-driven across mode × version × pin × dismissals × build,
  including every fail-open path.
- Prefill mapper — geocode result → field values, the `shouldPrefillArea` suppression, and
  the unresolved fallback.
- Cascade tests move with `LocationFields`.
- Modals: `tsc` + manual QA, per this repo's convention.
- Gates: `tsc --noEmit` clean, full Jest suite green, `expo lint` no new findings over the
  30-problem baseline.

## Risks

- **Ship day touches every user.** The kill switch is the mitigation and must be verified
  working before release.
- **`LOCATIONIQ_API_KEY` may be unset in production**, making every confirm modal fall back
  to saved values. Confirm before shipping; the flow works either way.
- **`editProfile.tsx` churns heavily.** It has been rewritten repeatedly this session; the
  extraction is the right move but is the riskiest step here.
- **P2-15 gets sharper.** A house number surviving a town change matters more now that it
  is central and mandatory.

---

## Implementation notes (2026-08-26, during build)

Contract corrections discovered by reading the backend rather than trusting the spec:

- Reverse-geocode takes `{ lat, lng }`, not `{ latitude, longitude }` — anything else 400s.
- The geocoder returns NO street and NO sub-area; `blockHint` is the only street-ish value
  and must never land in a canonical field (the route's own comment). Street prefill comes
  from `blockHint` or the user's saved address; sub-area only ever survives from the saved
  value, and drops when the geocoder moves the town.
- `/api/app-config` nests the gate under `body.locationGate`; the top level is the version
  gate. The endpoint is rate-limited at 20 reverse-geocodes/hour/user, so out-of-range
  coordinates short-circuit client-side.

Design deltas from the build:

- `activatedCitiesOnly` gates (not suppresses) a user with NO city: suppressing them would
  mean never asking the one question that determines scope.
- `locationVersion` is now declared on the store's `User` type.
- Dismissals are session-scoped, re-armed per Home visit, and bounded by `maxDismissals`;
  the durable never-ask signal is the server-stamped `locationVersion` only.
- The confirm modal's save is HOSTED by LocationGate and mirrors editProfile's sequence
  (update-profile → structured PATCH, failure never breaks the save) so there is no third
  save path.
- `area_overridden` fires only when a geocoded suggestion existed and the user picked a
  different area — its first live call site.
- Known behaviour shift accepted: `isDeliveryPointSet` no longer requires `address`, so
  home's Upcoming Collections card now shows for a pin-without-street user. Consistent with
  street becoming optional.
