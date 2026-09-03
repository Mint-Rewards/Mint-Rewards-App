# Mint Rewards App — Owner's Handoff

**Written 2026-09-03, against commit `f8d8551` on branch `docs/handoff`.**
**App version `2.2.1` · Expo SDK 56 · React Native 0.85.3.**

This is the document to read first if you are taking over this repo. It assumes
you know React Native but nothing about this project. Every command, path and
version below was verified against the working tree on the date above.

If something here disagrees with the code, the code is right and this document
has rotted — please fix it in the same PR.

---

## 1. What this is

Mint Rewards is a consumer recycling-rewards app for Pakistan. Users register,
give their home location, have waste collected, earn points, and redeem those
points for deals from partner brands. Redeeming produces a coupon code and a
downloadable PDF voucher.

- **This repo:** `github.com/Mint-Rewards/Mint-Rewards-App` — the Expo client.
  Default branch `main`.
- **Backend:** `github.com/Mint-Rewards/Mint-Rewards-Backend` — Next.js on
  Vercel. You need this checked out beside this repo; several things here are
  only meaningful next to it.
- **No CI exists.** There is no `.github/` directory. Every build, every
  submission and every OTA publish is a manual command you run from your laptop.
  This is the single biggest thing to know about operating this project.

### Vocabulary — get this right, it is load-bearing

The canonical definitions live in `Mint-Rewards-Backend/docs/VOCABULARY.md`.
Short version:

| Term | Means |
|---|---|
| **Campaign** | A recycling *programme*. "What programme is this." |
| **Deal** | The consumer *incentive*. "What do I get." |
| **Discount** | One *type* of Deal — a price reduction. |
| **Coupon / promo code** | Only the redemption *mechanism*: the code and the PDF. |

**This app is deals-only.** Its entire incentive surface is two endpoints:

```
GET  /api/users/deals
POST /api/users/deals/:dealId/redeem
```

The old campaign-backed endpoints (`my-discounts`, `active-campaigns`,
`/api/coupons/:id/redeem`) are gone from the client. If you find them in an
older document, that document predates the change. "Coupon" is still correct in
`hooks/useCouponDownload.ts` and the ticket modal — there it names the code and
the voucher, which is what a coupon actually is.

---

## 2. Access you need before you can do the job

Nothing in this list is in the repo. Ask the outgoing owner to transfer or grant
each one, and confirm you can actually log in before they leave.

| Service | What you need | Identifier |
|---|---|---|
| **Expo / EAS** | Member of the org, with build + submit + update rights | org `mint-rewards`, project `7a49df03-9e0f-4272-acfc-5bcb7fd8e30a` |
| **App Store Connect** | App Manager or Admin | bundle `com.mintrewards.app` |
| **Google Play Console** | Release Manager | package `com.mintrewards.appp` (yes, three `p`s — a historical typo that is now permanent) |
| **Firebase** | Project access, for Google Sign-In SHA-1s and Analytics | project `mint-rewards-eb254` |
| **PostHog** | Project access | project `532279`, US cloud |
| **Sentry** | Project access + the ability to rotate the auth token (see §12) | — |
| **GitHub** | Write on the `Mint-Rewards` org | — |
| **Google Cloud** | The Maps SDK key and the OAuth client IDs | — |

**Signing credentials.** iOS certificates and provisioning profiles, the Android
upload keystore, the App Store Connect API key and the Play service account are
all stored in **EAS-managed credentials**, not in this repo. Both `submit`
profiles in `eas.json` are empty objects, which means submission reads those
stored credentials or prompts you interactively. Verify with:

```bash
npx eas-cli credentials
```

Do this on day one. If the EAS-stored Android keystore is ever lost, you cannot
publish an update to the existing Play listing — that keystore is irreplaceable.

---

## 3. Local setup

```bash
git clone git@github.com:Mint-Rewards/Mint-Rewards-App.git
cd Mint-Rewards-App
npm install          # runs `postinstall: patch-package` — see below
cp .env.example .env # then fill in real values
```

`npm install` runs `patch-package`, which applies
`patches/@react-native+gradle-plugin+0.85.3.patch`. That patch bumps the Gradle
`foojay-resolver-convention` plugin from 0.5.0 to 1.0.0. **Android builds fail
without it.** If you ever see a Gradle toolchain resolution error, check that
the patch applied.

### Environment variables

`.env` is gitignored; `.env.example` is committed and documents every key.

Required — the app will not start without these:

| Var | Notes |
|---|---|
| `APP_VARIANT` | `development` selects the dev bundle ID, package, scheme, name and icon. Anything else means production. |
| `EXPO_PUBLIC_API_URL` | Backend base URL, no trailing slash (one is stripped anyway). |
| `GOOGLE_IOS_CLIENT_ID` | Must match the bundle ID of the variant you build. `app.config.js` derives the native callback URL scheme from it. |
| `GOOGLE_WEB_CLIENT_ID` | Passed to `GoogleSignin.configure()`; the backend verifies ID tokens against it. |
| `ANDROID_GOOGLE_MAPS_API_KEY` | Injected into `android.config.googleMaps`. Restrict by package name + SHA-1 in Google Cloud. |

Optional:

| Var | Notes |
|---|---|
| `GOOGLE_ANDROID_CLIENT_ID` | The app never reads it. Android Google Sign-In resolves through `google-services.json` + the Firebase SHA-1. |
| `POSTHOG_PROJECT_TOKEN` | Analytics. Absent means analytics silently no-op. |
| `POSTHOG_HOST` | Defaults to `https://us.i.posthog.com`. |

Separately, `.env.local` holds `SENTRY_AUTH_TOKEN` — **read §12 before you
create one.**

`config/env.ts` is the only module in the app allowed to read
`Constants.expoConfig.extra` or `process.env`. It validates at import time and
throws with *every* missing key listed at once. That error message is the
intended first-run experience — if you see it, it is telling you exactly what to
put in `.env`.

### Two layers of env validation

This trips people up, so: `app.config.js` validates at **config-resolution**
time (when Expo builds the config object) and `config/env.ts` validates at
**app-startup** time. `app.config.js` deliberately relaxes its check for
metadata-only reads (`EXPO_NO_DOTENV=1` and `EAS_BUILD !== "true"`, e.g.
`eas env:list`) and substitutes obvious placeholders, because throwing there
would break commands that build nothing. `config/env.ts` never relaxes, so a
bundle can never boot with a placeholder API URL.

`app.config.js` also manually re-enables `@expo/env`'s dotenv loading, bypassing
`EXPO_NO_DOTENV`. The long comment at the top of that file explains why; the
short version is that eas-cli precomputes a fingerprint before every build with
dotenv disabled, and if this file resolved differently under that flag, every
build would get a mismatched runtime version. Do not remove that block.

---

## 4. Running the app — why Expo Go will not work

**Expo Go cannot run this app.** It has native modules Expo Go does not bundle:
Google Sign-In, Firebase, `react-native-maps`, `expo-print`, `expo-secure-store`,
Apple Authentication, Sentry. In Expo Go you will get "Cannot find native
module" crashes, a blank map, and a broken coupon download.

You need a **development build**. Build one once, then reuse it:

```bash
# Physical device (iOS or Android)
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile development --platform android

# iOS simulator
npx eas-cli build --profile simulator --platform ios
```

Install the resulting artifact, then run Metro against it:

```bash
npx expo start           # add --clear after changing .env or app.config.js
```

`android/` and `ios/` are gitignored. They are **prebuild output** — generated
by `npx expo prebuild` from `app.config.js`. Never hand-edit them; your edits
are wiped on the next prebuild and are not in the repo. Native configuration
goes in `app.config.js`, through config plugins.

You can build locally instead with `npm run ios` / `npm run android`
(`expo run:ios` / `expo run:android`), which prebuilds and compiles on your
machine. Useful for debugging native issues; slower than EAS for everything else.

---

## 5. Build and submit runbook

### The five EAS profiles

Verbatim from `eas.json`:

| Profile | Dev client | Distribution | Channel | `APP_VARIANT` | autoIncrement |
|---|---|---|---|---|---|
| `development` | yes | internal | `development` | `development` | no |
| `simulator` | yes | — (iOS sim) | `development` | `development` | no |
| `preview` | no | internal (Android APK) | `preview` | `preview` → **resolves to production** | yes |
| `production` | no | store | `production` | `production` | yes |
| `testflight-preview` | no (extends `production`) | store | `testflight-preview` | `production`, **API pinned to dev backend** | yes |

Three of these have sharp edges worth knowing before you use them:

- **`preview` is a production-variant binary.** `app.config.js` computes
  `isDev = process.env.APP_VARIANT === "development"`, and everything else falls
  to the production branch. So `APP_VARIANT=preview` gives you the *production*
  bundle ID, package name, app name, icon and Firebase files. It is not a crash —
  `extra.appVariant` is normalised to `"production"` before `config/env.ts` sees
  it — but a `preview` build will install *over* a user's production app, and it
  reports to production Firebase. Use `development` if you want side-by-side.
- **`testflight-preview` ships a production binary pointed at the dev backend**
  (`EXPO_PUBLIC_API_URL=https://mint-rewards-backend-dev.vercel.app`, hardcoded
  in `eas.json`). It exists so testers can exercise a real store build against
  dev data. Never promote one of these to the App Store.
- **`development` and `simulator` have no `autoIncrement`**, so their build
  numbers do not advance. That is fine; they never reach a store.

Channels confirmed to exist on EAS: `development`, `preview`, `production`,
`testflight-preview` — matching `eas.json` exactly (`eas channel:list`).

### Building for release

```bash
npx eas-cli build --profile production --platform ios
npx eas-cli build --profile production --platform android
# or both at once:
npx eas-cli build --profile production --platform all
```

EAS runs `expo prebuild` on its side, so `android/`/`ios/` on your machine are
irrelevant to a cloud build. `.easignore` (not `.gitignore`) controls what gets
uploaded: it excludes `android`, `ios`, `node_modules`, tests, and docs, but it
**does not exclude `.env`, `firebase/` or `patches/`** — the latter two must
upload, and `.env` uploading is worth being aware of.

### Submitting

```bash
npx eas-cli submit --profile production --platform ios
npx eas-cli submit --profile production --platform android
```

Both submit profiles are empty, so credentials come from EAS storage or an
interactive prompt.

**iOS, after submit:** the build appears in App Store Connect → TestFlight
within ~10–30 minutes (Apple's processing). To ship to the store you still have
to, by hand in ASC: attach the build to a version, fill in "What's New",
confirm the privacy/encryption answers, and submit for review.
`ITSAppUsesNonExemptEncryption: false` is already declared in `app.config.js`,
so you should not be asked the export-compliance question.

**Android, after submit:** the artifact lands in the Play Console track you
chose. You still have to promote it through internal → closed → production and
set the rollout percentage by hand.

**Neither store step can be done by OTA.** Store listing text, screenshots and
privacy labels are store-side metadata.

### TestFlight-only build

```bash
npx eas-cli build   --profile testflight-preview --platform ios
npx eas-cli submit  --profile testflight-preview --platform ios
```

---

## 6. Versioning

Read this section before you touch a version number.

- **Marketing version** — `version: "2.2.1"` in `app.config.js`. This is the
  only place it is edited, and it is the version users see. Editing it is an
  owner-level decision (see `.claude/skills/mint-rewards-change-control/`).
- **Build number / version code** — **not in this repo at all.** There is no
  `ios.buildNumber` and no `android.versionCode` anywhere. `eas.json` sets
  `cli.appVersionSource: "remote"`, so EAS keeps the counter server-side and
  `autoIncrement: true` advances it on `preview`, `production` and
  `testflight-preview`. Verified: a resolved config reports both as `null`.
- `config/env.ts` reads them back off `Constants.expoConfig` at runtime and
  falls back to the string `"unknown"` locally — so `ENV.buildNumber` is
  `"unknown"` when you run from Metro. That is expected, not a bug.
- `package.json`'s `"version": "1.0.0"` is meaningless. Ignore it.

To see the current remote counters:

```bash
npx eas-cli build:version:get --platform ios
npx eas-cli build:version:get --platform android
```

---

## 7. OTA updates (EAS Update)

`expo-updates ~56.0.25` is installed and the `updates` block in
`app.config.js` is live:

```
url:                  https://u.expo.dev/7a49df03-9e0f-4272-acfc-5bcb7fd8e30a
enabled:              true
checkAutomatically:   ON_LOAD
fallbackToCacheTimeout: 0
runtimeVersion:       { policy: "appVersion" }
```

`fallbackToCacheTimeout: 0` means the app never blocks on the update check at
launch; a new bundle is downloaded in the background and applies on the *next*
cold start. The one exception is the forced-OTA path in §8, which applies
immediately.

### The runtime version rule — the sharpest edge in this repo

`runtimeVersion` is **`{ policy: "appVersion" }`**. A `fingerprint` policy is
written out in `app.config.js` but is **commented out and not in effect**.

That means the OTA compatibility key is literally the `version` string. Right
now, `2.2.1`.

Three consequences, in order of how much they will hurt you:

1. **A native change shipped without bumping `version` can be OTA'd onto an
   incompatible binary and crash it.** With `appVersion`, Expo has no idea your
   native layer changed — it only compares `2.2.1` to `2.2.1` and says "compatible".
   If you add a native module, change a permission, or alter a config plugin,
   **you must bump `version` and ship a new binary.** Nothing in the tooling
   will stop you from doing the wrong thing here.
2. **Bumping `version` cuts a new OTA branch.** Installs still on the old
   version stop receiving updates you publish afterwards. If you need to patch
   users on an old version, you must publish against that runtime version too.
3. This is exactly why the `fingerprint` policy is sitting there commented out.
   It would compute the runtime version from the actual native fingerprint and
   make this class of mistake impossible. It was not enabled because the
   fingerprint has to resolve identically in eas-cli's precompute and in the
   real build — the `@expo/env` block at the top of `app.config.js` exists to
   make that true. Switching to `fingerprint` is a reasonable future improvement;
   do it deliberately, not casually.

### What can and cannot ship by OTA

| Can | Cannot |
|---|---|
| JS/TS changes | New or removed native modules |
| Images and other bundled assets | Permission changes (`infoPlist`, Android `permissions`) |
| Copy, styling, layout | Anything in `app.config.js` that affects the native project |
| Business logic, API call changes | App icon, splash screen, bundle ID |
| Feature flags in JS | Store listing text, screenshots, privacy labels |

### Publishing

```bash
npx eas-cli update --channel production --message "Fix redeem button spacing"
npx eas-cli update --channel preview    --message "..."
```

Check what is live and roll back:

```bash
npx eas-cli channel:view production      # what branch/update the channel points at
npx eas-cli update:list --branch production
npx eas-cli update:republish --group <group-id>   # re-publish a known-good update
```

`update:republish` is the rollback. There is no "delete the bad update" — you
republish the previous good one on top.

### Before you publish an OTA

1. Confirm the change is JS-only against the table above.
2. Confirm `version` in `app.config.js` matches the binary you are targeting.
   Publishing under `2.2.1` reaches only `2.2.1` installs.
3. Test on a real build of that same version, not just Metro.
4. Publish to `preview` first if it is at all risky.

`docs/RELEASE-2.1.10-submission.md` is a worked example of splitting a release
into "ships in the binary" and "waits for OTA". It records one still-open item:
the pin requirement was deliberately removed from `validateForm` for the 2.1.10
binary, intended to be re-enabled by OTA. **Confirm whether that was ever done.**

---

## 8. The force-update gate (separate from OTA)

Undocumented anywhere before now. This is the system that can hard-block a user
on an outdated app.

**Files:**

- `utils/versionGate.ts` — pure decision logic. No React, no fetch, no native
  modules, so the rules that lock people out are testable in a table.
  `parseAppConfig`, `isStoreUpdateRequired`, `storeUrlFor`.
- `components/UpdateGate.tsx` — the I/O. Lazy-`require`s `expo-updates` and
  `expo-application` inside `try/catch`, because a device may run a binary built
  before those modules were linked and a top-level import would crash at module
  evaluation — before any fail-open handling could run.
- `components/ForceUpdateScreen.tsx` — the blocking UI.

**Backend contract** — `GET /api/app-config`, fetched with an 8-second timeout:

```json
{
  "minSupportedVersion": "2.1.0",
  "minSupportedBuildNumber": { "ios": 25, "android": 25 },
  "iosStoreUrl": "https://...",
  "androidStoreUrl": "https://...",
  "forceOTA": false
}
```

**Everything fails open.** Anything unparseable, absent or nonsensical resolves
to "do not block". This is deliberate: a false positive locks a user out with no
client-side recovery, because the blocked app is the very thing that would have
to fetch the correction. Individual bad *fields* degrade to inert defaults
rather than discarding the whole config.

**Flow:** the gate is skipped entirely in `__DEV__` (except under Jest). It
fetches the config, then does the **store check first** — if the binary is below
the floor, it shows `ForceUpdateScreen` and returns. It deliberately does *not*
fall through to the OTA check there, because with `appVersion` runtime versions
an OTA can only reach binaries on the same app version and can never fix a
too-old binary. Only if the store check passes and `forceOTA` is true does it
`checkForUpdateAsync` → `fetchUpdateAsync` → `reloadAsync`, showing an
"applying" overlay. Failures at every step emit a PostHog `update_gate_failed`
event, because a silently broken fail-open gate is indistinguishable from a gate
that correctly decided not to block.

**Caveat carried over from the 2.1.10 release:** once an OTA lands on a device,
the build number no longer identifies which features that device has. Gate on
`minSupportedVersion` for native capability, not on build number, unless you
know what you are doing.

---

## 9. Architecture orientation

Deeper treatment lives in `.claude/skills/mint-rewards-architecture-contract/SKILL.md`
(kept current). This is the map.

### Routes — expo-router v6, typed routes on

```
app/_layout.tsx          root stack; Sentry.init(); UpdateGate; startup gating
app/index.tsx            entry / redirect
app/login.tsx            app/register.tsx        app/forgot-password.tsx
app/change-password.tsx  app/verify-email.tsx    app/otp-screen.tsx
app/editProfile.tsx      app/+not-found.tsx

app/(tabs)/_layout.tsx   tab bar
app/(tabs)/home.tsx      collections.tsx  deals.tsx     redeem.tsx
           store.tsx     share.tsx        notifications.tsx  profile.tsx
```

### State — one Zustand store

`store/store.ts` (~1,300 lines) is the whole store, in four slices:

| Slice | Line ~ | Holds |
|---|---|---|
| USER | 485 | auth, token, profile, sign-in/up/out, OTP, password reset, delete account |
| PROFILE | 992 | `updateProfile`, `sendReferral` |
| DEAL | 1131 | `getDeals`, `getBrands`, `redeemDeal` — the only incentive surface |
| DEMO COLLECTIONS | 1261 | `scheduleCollection`, `loadScheduledCollection` — mock data |

### Invariants you must not break

- **`authenticatedFetch` in `utils/api.ts` is the only way to call the backend.**
  It attaches Sentry breadcrumbs, and on any `401` it calls `handleUnauthorized()`
  and `router.replace("/login")` — a single global sign-out path. Bypassing it
  means a 401 leaves the user in a broken half-authenticated state.
- **The `Authorization` header carries the raw token, with no `Bearer ` prefix.**
  The backend reads it as-is. Adding `Bearer ` breaks every authenticated call.
- **`config/env.ts` is the only reader of `extra` / `process.env`.** Everything
  else imports `ENV` / `API_BASE_URL` from it.
- **Native modules are lazily `require`d inside `try/catch`** (`utils/googleAuth.ts`,
  `hooks/useCouponDownload.ts`, `components/UpdateGate.tsx`) so a missing native
  binary degrades one feature instead of crashing the app at module evaluation.
- **Redeem before PDF.** The coupon must be redeemed server-side before the PDF
  is generated. Reversing the order can hand out a voucher for a redemption that
  never happened.
- **`UpdateGate` must stay off the store's import graph.** It runs before auth;
  pulling in the store would transitively pull `utils/api.ts`'s
  `401 → router.replace("/login")` into a pre-login render. That is why it
  duplicates `fetchWithTimeout` instead of importing it.

### Live backend endpoints

Full contract in `.claude/skills/mint-rewards-backend-api-contract/SKILL.md`.
The client currently calls:

```
POST  /api/users/signup            POST  /api/users/login
POST  /api/auth/google             POST  /api/auth/apple
GET   /api/users/my-profile        POST  /api/users/update-profile
POST  /api/users/verify-email-otp  POST  /api/users/resend-verification-otp
POST  /api/users/verify-otp        POST  /api/users/reset-password
POST  /api/users/set-password      POST  /api/users/delete-account
POST  /api/users/referrals
GET   /api/users/deals             POST  /api/users/deals/:dealId/redeem
GET   /api/users/brands
PATCH /api/users/location          POST  /api/location/reverse-geocode
GET   /api/app-config              POST  /api/logs
```

Responses are wrapped as `{ Status: "Success" | "Error", ... }`. Error messages
arrive under inconsistent keys (`data.error`, `data.message`,
`data.ErrorMessage`) depending on the endpoint — the API-contract skill lists
which is which. Do not assume.

---

## 10. Subsystems with no other documentation

### Location

The largest undocumented area. A user's home location gates most of the app.

- `utils/locationGate.ts` — **pure** decision function: which modal, if any,
  meets a user on Home. It exports `LOCATION_COMPLETION_VERSION` (currently `1`),
  which **must stay in step with `LOCATION_COMPLETION_VERSION` in the backend's
  `lib/evaluateLocation.ts`**. The client deliberately holds its own copy: the
  server bumps this when it starts demanding a new field, and a client that has
  not shipped an input for that field would otherwise block the user behind a
  modal it cannot satisfy.
- `utils/locationGateConfig.ts`, `locationEvaluation.ts`, `locationPrefill.ts`,
  `locationSave.ts`, `locationApi.ts`, `locationForm.ts`, `locationAnalytics.ts`
- `utils/pakistan_areas.ts` (`getCoverageTier`, `requiresSubArea`),
  `utils/pakistan_locations.ts` — the area registry.
- `components/LocationGate.tsx` and `components/location/` —
  `ConfirmAddressModal`, `FinishProfileModal`, `LocationFields`, `TownChangeModal`.
- `hooks/useLocationForm.ts`.

Design history: `docs/superpowers/specs/2026-08-07-location-update-prompt-design.md`,
`2026-08-25-location-gate-design.md`, `2026-08-24-osm-coverage-precheck.md`.
`scripts/geocode-spike/` is a self-contained throwaway harness that measured
geocoder coverage; its README explains itself.

### Profile bonus

`utils/profileBonus.ts` + `utils/profileBonusConfig.ts`. Pure, like the location
gate. Decides whether to show a profile-completion bonus badge and until when.

**It decides copy only — it cannot pay anyone.** Being wrong permissively means
showing a badge for a bonus the server declines to pay, so every uncertain input
resolves to `null`. The deadline derives from a **server-stamped**
`profileBonusWindowStartedAt` (set on first app open by `GET /api/users/my-profile`),
never from anything the client records — a locally-stored deadline would reset on
reinstall, drift with the device clock, and disagree with the only clock that
decides the payout.

### Email verification / OTP

`app/verify-email.tsx`, `app/otp-screen.tsx`, `components/OtpInput.tsx`,
`components/OtpStatusBanner.tsx`, store actions `verifyEmailOtp` /
`resendVerificationOtp` / `verifyOTP`, hooks `useCountdown` / `useDeadline`.
Backed by `/api/users/verify-email-otp` and `/api/users/resend-verification-otp`.

### Sentry

- `@sentry/react-native ~7.11.0`. `Sentry.init()` is in `app/_layout.tsx`.
- `utils/sentry.ts` wraps the SDK in **non-throwing** helpers. Telemetry sits
  inside catch blocks all over this app; a throwing reporter would replace the
  original error with its own. It also **scrubs** keys matching
  `/token|password|secret|authorization|otp|latitude|longitude/i` — location is
  included on purpose, because a crash report is not a good reason to copy
  someone's home address into a third-party service.
- `metro.config.js` uses `getSentryExpoConfig`.
- **There is no Sentry config plugin in `app.config.js`'s `plugins` array.**
  Source-map and dSYM upload is therefore **not automated**. Stack traces from
  release builds will be minified/unsymbolicated unless you upload artifacts by
  hand. Adding `@sentry/react-native/expo` to `plugins` would fix this — it is a
  native-affecting change, so it needs a version bump and a new binary.

### Analytics (PostHog)

`utils/posthog.ts`, token from `POSTHOG_PROJECT_TOKEN`. The events actually in
the code today:

```
user_signed_up          user_signed_up_google    user_signed_up_apple
user_logged_in          user_logged_in_google    user_logged_in_apple
location_saved          location_patch_failed    town_change_resolved
area_overridden         map_opened               pin_interacted
flow_abandoned          profile_bonus_shown      profile_bonus_earned
update_gate_blocked     update_gate_failed
```

`docs/archive/posthog-setup-report.md` lists a different, largely obsolete set —
nine of the events it claims no longer exist. Trust the grep, not the report.

### Patches

`patches/@react-native+gradle-plugin+0.85.3.patch`, applied by `postinstall`.
Bumps `foojay-resolver-convention` 0.5.0 → 1.0.0. **Re-check this after every
React Native upgrade** — the filename is version-pinned, so bumping RN silently
stops applying it and Android builds start failing on toolchain resolution.

---

## 11. Testing and quality gates

```bash
npm test        # jest + jest-expo
npm run lint    # expo lint (eslint 9)
```

**Baseline as of 2026-09-03, commit `f8d8551`:**

- Tests: **44 suites, 728 tests, all passing.**
- Lint: **29 problems (10 errors, 19 warnings)** — this is the accepted
  baseline, not a clean state. Most are `react-hooks/exhaustive-deps` and
  `react-hooks/immutability` in `components/location/`. Do not "fix" them
  casually; some are deliberate. Judge a change by whether it moves the number,
  not by whether the number is zero.

Tests live in `__tests__/` and are excluded from the EAS upload by `.easignore`.
The pure modules (`versionGate`, `locationGate`, `profileBonus`, `deals`) are
pure specifically so they can be tested as tables — follow that pattern when you
add policy logic.

---

## 12. Known issues and open risks

### Sentry auth token in git history — action required

`.env.local`, containing a real `SENTRY_AUTH_TOKEN`, was committed on
**2026-04-30 in commit `cee0f19` ("env local")**. It is gitignored at HEAD, but
the value remains recoverable from history by anyone with repo access.

**Rotate that token in Sentry.** Whether to also rewrite git history is a
separate decision with its own cost (it invalidates every existing clone and
open PR) — rotation is the part that must happen regardless.

### Hardcoded Google client IDs bypass `config/env.ts`

`utils/googleAuth.ts` lines 19–22: the `ENV.googleIosClientId` and
`ENV.googleWebClientId` lines are **commented out**, with hardcoded IDs live
beneath them:

```js
// iosClientId: ENV.googleIosClientId,
// webClientId: ENV.googleWebClientId,
iosClientId: "78392867949-...apps.googleusercontent.com",
webClientId: "78392867949-...apps.googleusercontent.com",
```

These are public client IDs, so this is not a secret leak. But it defeats the
variant separation: a dev build authenticates against the production OAuth
client regardless of `.env`. Whoever commented these out presumably had a reason
that is not recorded — find out before uncommenting.

### `runtimeVersion: appVersion`

See §7. Native change without a `version` bump = OTA onto an incompatible
binary. There is no guard rail.

### No CI

Every build, submit and update is a manual local command. There is no automated
test run on PRs, no automated lint, no automated release. A stalled CI branch
exists in the project's history; it was never finished.

### `.easignore` does not exclude `.env`

`firebase/` and `patches/` must upload — that is correct. `.env` also uploads.
Not a live incident, but worth knowing when you think about what reaches EAS.

### Backend is mid Mongo → Postgres migration

See `Mint-Rewards-Backend/docs/plans/HANDOFF-2026-09-02-postgres-migration.md`.
The ETL works and a cutover strategy is chosen; production shape is roughly
7,200 users and one active deal.

**What the client must not assume during cutover:** that ID formats stay Mongo
ObjectId-shaped, that field ordering or nullability is stable, or that a field
absent in one response will stay absent. The client already treats error keys
defensively; extend the same caution to IDs and optional fields. Coordinate any
response-shape change with the backend owner rather than adapting to whatever
you observe.

### Firebase config files are committed

`firebase/google-services.json`, `google-services.dev.json`,
`GoogleService-Info.plist`, `GoogleService-Info.dev.plist` are all in the repo.
This is normal practice — they contain no secrets — but note that
`app.config.js`'s `firebaseConfigFile()` helper falls back to the **production**
file with a warning if a `.dev.*` file is missing.

---

## 13. Which existing docs to trust

| Document | Status |
|---|---|
| `docs/HANDOFF.md` (this) | **Current** — 2026-09-03 |
| `.claude/skills/mint-rewards-*/SKILL.md` (4) | **Current** — corrected 2026-09-03 |
| `.claude/skills/expo-react-native-reference/SKILL.md` | **Current** — corrected 2026-09-03 |
| `.claude/CLAUDE.md` | **Current** — vocabulary is accurate |
| `.env.example` | **Current** |
| `Mint-Rewards-Backend/docs/VOCABULARY.md` | **Current** — canonical for all repos |
| `docs/RELEASE-2.1.10-submission.md` | **Historical, still useful** — worked binary-vs-OTA split; one open item |
| `docs/superpowers/specs/` (location, forgot-password, OSM) | **Historical, still useful** — design rationale |
| `PRODUCT.md` | **Current** — brand and design brief |
| `docs/archive/**` | **Superseded.** Point-in-time records, kept for history. Each has a banner. |
| `graphify-out/GRAPH_REPORT.md` | **Stale** — built from commit `3641e3f7`; local-only |

Note that `.claude/` is gitignored, but the six `SKILL.md` files and `CLAUDE.md`
were committed before that rule and remain tracked. They survive a fresh clone.

---

## 14. Cookbook

**Ship a JS-only fix**
1. Confirm it is JS-only (§7 table). 2. Merge to `main`.
3. `npx eas-cli update --channel preview --message "..."`, verify on a preview build.
4. `npx eas-cli update --channel production --message "..."`.
5. Confirm with `npx eas-cli channel:view production`.

**Ship a native change**
1. Make the change in `app.config.js` / `package.json`. Never in `android/` or `ios/`.
2. **Bump `version` in `app.config.js`** — non-negotiable, see §7.
3. `npx eas-cli build --profile production --platform all`.
4. `npx eas-cli submit --profile production --platform ios` (and `android`).
5. Finish the store steps by hand.

**Add a native dependency**
1. `npx expo install <pkg>` — never plain `npm install` for Expo-managed packages;
   it picks the version matching the SDK.
2. Add a config plugin entry to `app.config.js` if the package needs one.
3. This is a native change — follow the recipe above, version bump included.
4. Rebuild your development build too, or you will get "Cannot find native module".

**Point the app at a different backend**
Edit `EXPO_PUBLIC_API_URL` in `.env`, then `npx expo start --clear`. The
`--clear` matters; Metro caches the resolved config. For a build, set it on the
EAS profile's `env` block (this is what `testflight-preview` does).

**A build failed**
1. Read the EAS build log — link is in the CLI output, or `npx eas-cli build:list`.
2. Gradle toolchain error → the patch did not apply. `rm -rf node_modules && npm install`.
3. Config resolution error → run `npx expo config --type public` locally; it
   reproduces `app.config.js` failures without a 20-minute build.
4. Missing env var → `npx eas-cli env:list` and compare against `.env.example`.
5. iOS pod errors → `app.config.js` sets `useFrameworks: "static"` with
   `modular_headers` on GoogleUtilities and RecaptchaInterop. Firebase +
   Google Sign-In require this; do not remove it.

**Debug at runtime**
Start with `.claude/skills/mint-rewards-debugging-playbook/SKILL.md` — it is a
symptom-to-cause table covering the failures this app actually has: native
module missing, Google `DEVELOPER_ERROR`, unexpected bounce to login, stuck on
"Loading your experience...", coupon marked used with no PDF, wrong backend,
blank Android map, 401 loops.

---

## 15. First week checklist

- [ ] Confirm access to every service in §2, by logging in yourself.
- [ ] `npx eas-cli credentials` — confirm the Android keystore and iOS certs are present.
- [ ] Clone, `npm install`, fill `.env`, build a `development` profile build, run it on a device.
- [ ] `npm test` and `npm run lint` — confirm you reproduce 728 passing / 29 lint problems.
- [ ] **Rotate the Sentry auth token** (§12).
- [ ] Read `.claude/skills/mint-rewards-change-control/SKILL.md` before your first merge.
- [ ] Do one `eas update --channel preview` end to end, so the OTA path is not new to you during an incident.
- [ ] Ask the outgoing owner: was the `validateForm` pin requirement (§7) ever re-enabled by OTA?
- [ ] Ask the outgoing owner: why are the Google client IDs in `utils/googleAuth.ts` hardcoded?
- [ ] Sync with the backend owner on the Postgres cutover timeline (§12).
