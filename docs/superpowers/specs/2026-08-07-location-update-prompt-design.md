# Location Update Prompt for Existing Users — Design

Date: 2026-08-07

## Context

The `fix/update_locations` branch replaces the old `utils/pakistanLocations.tsx` town list
with a canonical dataset in `utils/pakistan_areas.ts`, and adds a third location level:
`subArea` (block / sector / phase), plus free-text escape hatches `townOther` and
`subAreaOther`.

Two things about that change break existing users:

1. **Towns were renamed.** `"F-6"` became `"Sector F-6"`, and similar renames landed
   across Islamabad, Lahore, Karachi, Rawalpindi, and Peshawar. A saved town from an
   older build may no longer match any entry in the canonical list, so it cannot be
   represented in the picker at all.
2. **`subArea` is brand new.** No existing user has one, and 150 of the 196 canonical
   towns carry sub-area data. `isProfileComplete` (new in the same branch) requires a
   sub-area wherever `requiresSubArea` is true, so every user in one of those 150 towns
   silently flips to incomplete on first launch of this build: brand cards lock and taps
   bounce to `editProfile`, with no explanation of what changed.

The branch's answer to (1) is `scripts/migrate-town-names.js`, a one-shot Mongo script
that rewrites old town names to canonical ones. It cannot run as written — `mongodb` is
not a dependency of this repo — and when the connection string has no path segment it
silently targets the `test` database and reports `Updated 0 user document(s)`, which is
indistinguishable from "nothing to migrate". It also does nothing about (2).

This design replaces the migration entirely with a client-side prompt.

## Goals

- Tell affected users, at login, that their location needs updating, instead of letting
  them discover it as an unexplained lockout.
- Collect the missing `subArea` in the same interaction that fixes the renamed town.
- Require no migration, no backend change, and no new dependency.

## Non-goals

- No push notifications. `expo-notifications` is not a dependency, and adding it is a
  native-affecting change requiring a rebuild. The prompt is in-app.
- No backend `maxlength` / trim validation on `townOther` and `subAreaOther`. Real gap,
  tracked separately.
- No wiring up of `emailServices/profileNotComplete.ts`, which currently has no callers.
- No change to how new users fill in their location for the first time.

## Design

### 1. Trigger condition — `utils/profile.ts`

A new helper alongside `isProfileComplete`:

```ts
export function needsLocationUpdate(user: User | null | undefined): boolean
```

Returns true when either:

- `isLegacyTownValue(city, town)` — the saved town is non-empty and not canonical for its
  city, or
- `requiresSubArea(city, town)` and neither `subArea` nor `subAreaOther` is set.

Returns false in three cases that would otherwise generate a pointless or duplicated
prompt:

- **Free-text town users** (`townOther` set, `town` empty). They have answered the town
  question as completely as the data allows; `requiresSubArea` is already false for them.
- **Users with no town at all.** These are plain-incomplete profiles, already covered by
  the existing generic banner. Prompting them here would stack two messages.
- **Cities with no town list.** `cityHasTowns` is false, so there is nothing to judge the
  saved value against.

The condition is derived from the user document on every evaluation. There is no stored
flag, so there is no way for it to drift out of sync with the data, and it self-heals: a
user who half-completes the flow is simply prompted again.

### 2. Prompt hierarchy — `app/(tabs)/home.tsx`

The branch currently gates its location banner on `profileComplete`, which suppresses it
for exactly the users who need it — a missing `subArea` makes them incomplete. The
precedence inverts:

| Condition | Shown |
|---|---|
| `needsLocationUpdate(user)` | Location modal (once per session) + location banner |
| `!isProfileComplete(user) && !needsLocationUpdate(user)` | Existing generic "complete your profile" banner |
| `!isProfileComplete(user)` | Brand cards `locked`, taps route to `editProfile` (unchanged) |

At most one banner shows at a time, and affected users get the specific message rather
than the generic one. The lock itself is unchanged — this design explains an existing
restriction, it does not add one.

### 3. The modal — `components/LocationUpdateModal.tsx`

A new component structured like the existing `components/ConfirmationModal.tsx`
(transparent `Modal`, `animationType="fade"`, centered card, icon circle) but with a
location icon and its own copy:

> **Update your location**
> We've updated our area list to be more accurate. Please re-select your town and area.
> `[ Later ]` `[ Update now ]`

*Update now* → `router.push("/editProfile")`. *Later* → dismiss; the banner and the lock
remain.

Mounted on the home screen. All four authentication paths — login, register, Google,
Apple — converge there, so this is one mount point rather than four.

### 4. Once-per-session suppression — `store/store.ts`

A non-persisted `locationPromptShown: boolean` in the Zustand store, set to true when the
modal is dismissed or acted on, and reset to false on login and on logout.

Non-persisted is deliberate: the flag lives for the app process only, so the modal
reappears on a cold start. The user has not done the thing yet, and a persisted dismissal
would leave them locked out of brand cards with no visible explanation.

### 5. Clearing the town — `app/editProfile.tsx`

When the screen mounts and `needsLocationUpdate(user)` is true, the form initializes
`town`, `townOther`, `subArea`, and `subAreaOther` to `""`.

This applies to both affected groups — including users whose canonical town is still
valid and are only missing a sub-area. Uniform clearing was chosen over preserving the
valid town: one code path, one rule to reason about.

This is **form state only**. The Zustand store and the Mongo document keep their existing
values until the user saves. A user who opens the screen and backs out loses nothing.

No new validation is needed. `validateForm` already requires a town
(`app/editProfile.tsx:254`, satisfied by either `town` or `townOther`) and a sub-area
where `requiresSubArea` demands one (`app/editProfile.tsx:265`), so a cleared form cannot
be saved blank.

### 6. Consistent gating — `app/discounts.tsx`

Replace the inline `phone && province && city` check at `app/discounts.tsx:30` with
`isProfileComplete(user)`.

This is required, not incidental. The screen currently carries a copy of the pre-branch
completeness rule, so a user who is locked out on home can reach the discounts screen and
avail normally. Building a prompt around a gate that a second screen ignores would tell
users they are blocked while quietly letting them through.

### 7. Deletion — `scripts/migrate-town-names.js`

Delete the script. This flow supersedes it: renamed towns are re-picked by the user
rather than rewritten in the database, and the script's failure modes (missing `mongodb`
dependency, silent no-op against the `test` database) disappear with it.

## Data flow

```
login / register / Google / Apple
  → user document (already includes town, townOther, subArea, subAreaOther)
  → store.user
  → home mounts
      → needsLocationUpdate(user) && !locationPromptShown
          → LocationUpdateModal
              → "Update now" → editProfile (town/subArea fields blank)
                  → validateForm blocks save until re-picked
                      → updateProfile → store.user refreshed
                          → needsLocationUpdate now false → no prompt
              → "Later" → locationPromptShown = true; banner + lock remain
```

## Error handling

There is no network call in this flow, so there is no failure path of its own. The
condition is computed from data already in memory.

The one degenerate input is a city missing from `PAKISTAN_LOCATIONS`. `cityHasTowns`
returns false, `isLegacyTownValue` returns false, and `requiresSubArea` returns false, so
the user is not prompted. Failing closed is correct here: with no canonical list to
compare against, the app cannot tell whether the saved town is stale.

Profile save errors are unchanged and already handled by `handleSave`.

## Testing

Unit tests for `needsLocationUpdate`, one case per branch:

| Input | Expected |
|---|---|
| Legacy town (`city: "Islamabad"`, `town: "F-6"`) | `true` |
| Canonical town with sub-area data, no `subArea` | `true` |
| Canonical town with sub-area data, `subArea` set | `false` |
| Canonical town with sub-area data, `subAreaOther` set | `false` |
| Canonical town with no sub-area data | `false` |
| `townOther` set, `town` empty | `false` |
| `town` empty, `townOther` empty | `false` |
| City absent from `PAKISTAN_LOCATIONS` | `false` |

Manual verification on the real path, since the value of this change is entirely in what
an existing user sees:

1. Seed a user with a legacy town and no `subArea`; log in; confirm the modal appears.
2. Tap *Later*; confirm the banner persists, brand cards stay locked, and the modal does
   not reappear until the app is cold-started.
3. Tap *Update now*; confirm town and sub-area are blank and save is rejected while blank.
4. Save a valid town and sub-area; confirm the prompt and the lock are both gone, and stay
   gone on the next launch.
5. Repeat (1) and (4) for a user whose town is canonical but whose `subArea` is missing.
6. Confirm a fully complete user sees no modal at all.

## Change classification

JS/TS-only. No native modules, no `app.json` changes, no backend contract change — the
new fields already reach the client on every auth route. No rebuild required; ships over
the existing update channel.
