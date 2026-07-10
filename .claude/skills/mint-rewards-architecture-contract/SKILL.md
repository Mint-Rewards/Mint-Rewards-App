---
name: mint-rewards-architecture-contract
description: >
  The architecture contract for the Mint Rewards client app: the system map
  (expo-router routes, single Zustand store with four slices, utils layer,
  platform-specific components), the load-bearing invariants every change must
  preserve (authenticatedFetch + global 401 sign-out, raw-token Authorization
  header, single API_BASE_URL, SecureStore key lifecycle, profile-completeness
  gating, native-module lazy loading, coupon redeem-before-PDF ordering), the
  known-weak points stated plainly, and the WHY behind key design decisions.
  Use when: adding a screen/route/endpoint, touching store/store.ts or
  utils/api.ts, adding a native dependency, changing auth/token handling,
  reviewing a diff for invariant violations, or asking "why is it built this
  way" / "what must not break".
---

# Mint Rewards Architecture Contract

This is the contract for the Mint Rewards client repo (Expo SDK 54 / React
Native 0.81.5 / React 19.1, expo-router v6, single Zustand store, TypeScript).
The backend is a SEPARATE repo served at `https://mint-rewards-backend.vercel.app`
(client override: `EXPO_PUBLIC_API_URL` in the untracked `.env`). Everything
below is verified against the code as of 2026-07-08; line numbers are stamped
the same and may drift — re-verify with the commands in "Provenance and
maintenance" before relying on an exact line.

**Rules of engagement**: any change that touches an invariant in this file goes
through `mint-rewards-change-control`. The known-weak points are OPEN and
documented deliberately — do not "fix" one silently as a drive-by; each fix is
its own change.

---

## 1. System map

### 1.1 Route table (expo-router v6, file-based)

Every route is a file in `app/`. The root Stack in `app/_layout.tsx` explicitly
registers every screen (all `headerShown: false` except `+not-found`), with
`initialRouteName="index"`:

| Route | File | Purpose |
|---|---|---|
| `/` (index) | `app/index.tsx` | Splash/loading screen shown while `checkAuth` in `app/_layout.tsx` decides where to route (pure UI, no logic) |
| `/(tabs)` | `app/(tabs)/_layout.tsx` | Tab group (see below) |
| `/login` | `app/login.tsx` | Email/password + Google + Apple sign-in |
| `/register` | `app/register.tsx` | Sign-up (also Google/Apple paths) |
| `/forgot-password` | `app/forgot-password.tsx` | Password reset request |
| `/otp-screen` | `app/otp-screen.tsx` | OTP verification |
| `/change-password` | `app/change-password.tsx` | Set new password |
| `/redeem` | `app/redeem.tsx` | Brand campaign detail + coupon download (takes `brandId` search param) |
| `/discounts` | `app/discounts.tsx` | User's coupon list ("My Discounts") + download |
| `/editProfile` | `app/editProfile.tsx` | Profile editing (this is where users complete phone/province/city) |
| `/collections` | `app/collections.tsx` | Waste pickup history |
| `/notifications` | `app/notifications.tsx` | Notifications |
| `+not-found` | `app/+not-found.tsx` | Fallback |

Tab group `app/(tabs)/` (bottom tabs, `Ionicons`, `HapticTab` buttons,
`TabBarBackground` background):

| Tab | File | Title |
|---|---|---|
| `home` | `app/(tabs)/home.tsx` | "Home" — points, brand coupon stack, profile-completeness gate |
| `share` | `app/(tabs)/share.tsx` | "Refer" |
| `store` | `app/(tabs)/store.tsx` | "Store" (a screen — NOT the Zustand store) |
| `profile` | `app/(tabs)/profile.tsx` | "Profile" |

**Adding a screen**: create the file under `app/`, AND register a
`<Stack.Screen name="...">` in `app/_layout.tsx` (the codebase convention is
explicit registration with `headerShown: false`).

Startup flow (`app/_layout.tsx` `useEffect` → `checkAuth`): read
`userToken` from SecureStore → if present, `setUserData({ token })` then
`getProfile()` → profile OK → `router.replace("/(tabs)/home")`; profile fetch
fails (stale token) → delete `userToken`, `router.replace("/login")`; no token
→ `/login`. `configureGoogleSignIn()` is also called here once.

### 1.2 State: one Zustand store, four slices

`store/store.ts` is the ONLY store: `create<AppStore>()` where
`AppStore = UserSlice & ProfileSlice & CampaignSlice & DiscountSlice` (the
slices are TypeScript interfaces composed into one flat object — there is no
zustand middleware, no persistence layer; persistence is manual via
SecureStore).

| Slice | State | Actions |
|---|---|---|
| `UserSlice` | `user`, `token`, `isLoading`, `error` | `setUserData`, `getProfile`, `signIn`, `signUp`, `signOut`, `forgotPassword`, `verifyOTP`, `setPassword`, `deleteAccount`, `wasteToCo2`, loading/error setters |
| `ProfileSlice` | `profile`, `isProfileLoading`, `profileError` | `updateProfile`, `sendRefferal` (sic — misspelled in code), setters |
| `CampaignSlice` | `campaigns`/`brands`/`brandsWithCampaigns` + per-collection loading/error triples | `getCampaigns`, `getBrands`, `getBrandsWithCampaigns` |
| `DiscountSlice` | `discounts`, `isDiscountsLoading`, `discountsError` | `getDiscounts`, `availDiscount`, `markDiscountUsed` |

All store actions return `{ Status: "Success" | "Error", Message?, ErrorMessage? }`
shaped results (screens branch on `Status`), except the discount getters which
return arrays/nulls.

### 1.3 Utils layer

| File | Exports | Role |
|---|---|---|
| `utils/constants.ts` | `API_BASE_URL`, `SizeConfig`, `Constants` (theme color `#449EB2`, `showDialog`), `Utils` (email/password validators) | THE single source of the backend URL: `(process.env.EXPO_PUBLIC_API_URL ?? "https://mint-rewards-backend.vercel.app").replace(/\/$/, "")` — trailing slash stripped |
| `utils/api.ts` | `authenticatedFetch(url, options)`, `apiUrl(path)` | The auth boundary: wraps `fetch`; on HTTP 401 it calls `useAppStore.getState().signOut()` then `router.replace("/login")`, then returns the response |
| `utils/logger.ts` | `logAuthEvent`, `logScreenView`, `logEvent`, `logError` | Fire-and-forget remote logging to `POST /api/logs` on the app's own backend; never throws (catch → `console.warn`) |
| `utils/googleAuth.ts` | `configureGoogleSignIn`, `signInWithGoogle`, `signOutGoogle` | Native Google Sign-In, lazily `require`d (see invariant 6). Contains the dead commented-out expo-auth-session OAuth-proxy attempt — see `mint-rewards-failure-archaeology` |

`hooks/useCouponDownload.ts` is the coupon redeem + PDF pipeline (see
invariant 7 and `mint-rewards-coupon-reliability-campaign`).

### 1.4 Platform-specific components (Metro platform extensions)

Metro (React Native's bundler) resolves `import X from "./Foo"` by trying
platform-suffixed filenames first: on iOS it picks `Foo.ios.tsx` if present, on
Android `Foo.android.tsx`, and falls back to `Foo.tsx` when no platform file
exists. The import site never mentions the platform — the same import line
compiles to different implementations per platform, and the suffix-less file
doubles as the cross-platform fallback (and the source of shared TypeScript
types). If you add behavior to one platform variant, check whether the fallback
needs the same change.

Three components use this in this repo:

| Component | `.ios.tsx` | `.android.tsx` | `.tsx` fallback |
|---|---|---|---|
| `components/AppleSignInButton` | Real `expo-apple-authentication` button | `return null` | `return null` (stub, holds the shared `Props` type) |
| `components/ui/TabBarBackground` | `BlurView` (`systemChromeMaterial`) + `useBottomTabOverflow()` = tab bar height | — | `export default undefined` shim; overflow `0` (opaque tab bar on Android/web) |
| `components/ui/icon-symbol` | SF Symbols via `expo-symbols` | — | `MaterialIcons` with an explicit name-mapping table |

---

## 2. Invariants — must hold in ANY change

### INV-1: All authenticated calls go through `authenticatedFetch`

- **Statement**: every request that sends the user's token uses
  `authenticatedFetch` from `utils/api.ts`, so a 401 ANYWHERE triggers global
  sign-out (SecureStore wipe + store reset) and `router.replace("/login")`.
- **Why**: the backend invalidates tokens; without a single 401 chokepoint the
  app limps along with a dead token, every screen fails differently, and the
  user is stuck. One wrapper = one recovery behavior.
- **Where enforced**: `utils/api.ts` lines 9–21. Callers: every authed action
  in `store/store.ts` (`getProfile`, `deleteAccount`, `updateProfile`,
  `sendRefferal`, `getBrands`, `getBrandsWithCampaigns`, `getCampaigns`,
  `getDiscounts`, `availDiscount`, `markDiscountUsed`).
- **Current raw-`fetch(` exceptions** (verified by grep, as of 2026-07-08) and
  whether they are deliberate:
  - `store/store.ts` `signIn`/`signUp` → `fetchWithTimeout` (15 s AbortController
    wrapper, store lines 9–21). **Deliberate**: pre-auth, and a 401 during login
    must show an error, not trigger sign-out redirect.
  - `store/store.ts` `forgotPassword` (~line 483), `verifyOTP` (~510),
    `setPassword` (~552) → raw `fetch`. Pre-auth, acceptable — but note they
    have NO timeout (weak point WP-10).
  - `app/login.tsx` (~336, ~411) and `app/register.tsx` (~50, ~119) →
    raw `fetch` to `/api/auth/google` and `/api/auth/apple`. **Deliberate**:
    pre-auth social sign-in.
  - `utils/logger.ts` `sendLog` (~line 97). **Deliberate**: unauthenticated
    fire-and-forget; logging must never trigger navigation.
  - `hooks/useCouponDownload.ts` (~line 391) → raw `fetch` to
    `PATCH /api/coupons/{id}/redeem` **with the Authorization header**. This is
    the ONE authenticated call that bypasses the wrapper. Nothing in the code
    marks it intentional — a 401 here shows a "Cannot Download" alert instead
    of signing out. **Treat as a bug (WP-7); route the fix through
    `mint-rewards-coupon-reliability-campaign` + change control.**
- **How a change silently breaks it**: adding a new endpoint with plain
  `fetch` compiles and works in the happy path; the regression only appears
  when a token expires in the field. Review rule: any new `fetch(` that sends
  `Authorization` and is not one of the exceptions above is a defect.

### INV-2: Authorization header = RAW token, no "Bearer " prefix

- **Statement**: the backend expects `Authorization: <token>`, NOT
  `Authorization: Bearer <token>`.
- **Why**: backend contract (see `mint-rewards-backend-api-contract`). Adding
  "Bearer " out of muscle memory makes every authed call 401 — which, via
  INV-1, signs the user out on the spot.
- **Where enforced**: convention only — there is no helper that builds the
  header. Verified by grep: all 10 live `Authorization` assignments
  (`store/store.ts` ×9, `hooks/useCouponDownload.ts` ×1) pass the raw token.
  The only "Bearer" in the repo is inside the commented-out dead code in
  `utils/googleAuth.ts` (~line 38), which called Google's own API, not ours.
- **How a change silently breaks it**: TypeScript can't catch it; the string
  compiles. Grep any auth-touching diff for `Bearer`.

### INV-3: `API_BASE_URL` has exactly one live definition

- **Statement**: the backend base URL is defined once in `utils/constants.ts`
  (env override, trailing slash stripped) and imported everywhere.
- **Why**: dev/preview/prod point at different backends via
  `EXPO_PUBLIC_API_URL`; two definitions can silently diverge (one env-driven,
  one stale hardcode) and produce "works on my machine" builds.
- **Where enforced**: `utils/constants.ts` line 13. `store/store.ts` aliases
  it (`const API_URL = API_BASE_URL`), `utils/api.ts` and
  `hooks/useCouponDownload.ts` import it directly.
- **Already violated once**: `utils/logger.ts` lines 9–10 defines its OWN
  `API_URL` copy — same env var and default, but WITHOUT the trailing-slash
  strip, plus a commented-out LAN-IP line that invites divergence during local
  debugging (WP-6).
- **How a change silently breaks it**: copy-pasting the constant into a new
  file (exactly what logger.ts did). Review rule: new files import
  `API_BASE_URL` from `utils/constants.ts`, never redefine it.

### INV-4: SecureStore key lifecycle — every persisted key dies in `signOut`

- **Statement**: the persisted auth keys are `userToken`, `userEmail`,
  `userName`, `userPoints`. They are written on every successful sign-in path
  and ALL of them are deleted in `signOut` (`store/store.ts` lines 469–472).
  Any NEW persisted key MUST be added to the `signOut` cleanup.
- **Why**: leftover keys leak the previous user's data into the next session
  on a shared device, and a leftover `userToken` resurrects a dead session via
  startup `checkAuth`.
- **Where enforced** (write sites, verified): `store.signIn` (~330–336);
  Google/Apple flows in `app/login.tsx` (~377–380, ~457–460) and
  `app/register.tsx` (~86–89, ~165–168). Delete site: `store.signOut` only.
  Startup consumer: `checkAuth` in `app/_layout.tsx` (reads `userToken`;
  on stale token deletes ONLY `userToken`, not the other three — minor known
  gap, cosmetic since the token is the gate).
- **Extra key to know about**: `appleFullName_<appleUserId>` (Apple only sends
  fullName on first authorization; cached in `app/login.tsx` ~401 /
  `app/register.tsx` ~109). It is intentionally NOT deleted on signOut (it
  must survive re-login), but it means "signOut deletes everything" is not
  literally true — evaluate any new key explicitly against this invariant.
- **How a change silently breaks it**: adding `SecureStore.setItemAsync("newKey", …)`
  in a feature without touching `signOut`. Review rule: grep the diff for
  `setItemAsync` and check `signOut` in the same PR.

### INV-5: Profile-completeness gating (business rule — NEVER break)

- **Statement**: coupons are locked until the user has non-empty **phone,
  province, and city**. This is an owner-declared non-negotiable (commits
  2297728, 3129340 per project owner, 2026-07-07).
- **Why**: pickups are dispatched geographically; a redeeming user without
  contact + location data breaks the operational loop with brands.
- **Where enforced — TWO independent copies, currently identical field sets**
  (verified 2026-07-08):
  - `app/(tabs)/home.tsx` lines 121–124:
    `!!(user?.phone?.trim() && user?.province?.trim() && user?.city?.trim())`
    — gates the coupon stack and shows the "complete your profile" banner.
  - `app/discounts.tsx` line 30: the same expression on one line — gates
    download buttons on the discounts screen.
- **Known-weak point (WP-8)**: the fields do NOT currently diverge, but the
  logic is duplicated with no shared helper, so nothing stops them diverging.
  If you must change the field set, change BOTH, or (through change control)
  extract one helper and use it in both places. `app/redeem.tsx` does NOT
  re-check completeness itself (users reach it from the gated home stack) —
  do not add a third copy; consolidate instead.
- **How a change silently breaks it**: editing one copy ("also require town")
  and not the other → home locks coupons that discounts happily downloads, or
  vice versa.

### INV-6: Native modules load lazily — never at module scope

- **Statement**: any dependency with a native binary is loaded inside a
  guarded `try { require(...) }` or a dynamic `import()` at call time, never a
  top-level `import`.
- **Why**: Expo Go and stale dev builds don't contain custom native binaries.
  A top-level import of a missing native module crashes the ENTIRE app at
  bundle-evaluation time (before any screen renders). Lazy loading degrades
  the single feature instead.
- **Where enforced — the two reference implementations**:
  - `utils/googleAuth.ts` lines 45–54: `try { require('@react-native-google-signin/google-signin') } catch { console.warn(...) }`;
    every exported function null-checks `GoogleSignin` and returns a friendly
    failure.
  - `hooks/useCouponDownload.ts` (~lines 429–432): `await Promise.all([import("expo-print"), import("expo-sharing")])`
    inside `downloadCoupon`, after the redeem call.
- **How a change silently breaks it**: `import * as Print from "expo-print"`
  at the top of a new file works fine in a dev build and crashes Expo Go and
  any not-yet-rebuilt binary at startup. Review rule: new native deps follow
  one of the two patterns above.

### INV-7: Coupon redeem ordering — backend marks used BEFORE PDF exists

- **Statement**: in `hooks/useCouponDownload.ts` `downloadCoupon`, Step 1 is
  `PATCH /api/coupons/{couponId}/redeem` (backend marks the single-use coupon
  used and returns `couponCode` + `referenceCode`); Step 2 generates the PDF
  (`expo-print` `printToFileAsync`) and shares it (`expo-sharing`). If Step 2
  throws, the coupon is ALREADY burned — the catch block explicitly refuses to
  retry the redeem and tells the user to screenshot the code
  (~lines 454–468).
- **Why it is this way**: the code must come from the backend (it is the
  redeem response), so some server call must precede PDF generation; the
  current backend couples "give me the code" with "mark it used" in one PATCH.
  This is the project's acknowledged hardest live problem (owner, 2026-07-07).
- **Where enforced**: the sequential structure of `downloadCoupon`
  (`hooks/useCouponDownload.ts` ~377–469). Callers: `app/discounts.tsx` (~68)
  and `app/redeem.tsx` (~97), both of which refresh state only on success.
- **Do not touch casually**: any reordering, retry logic, code-caching, or
  backend contract change here goes through
  `mint-rewards-coupon-reliability-campaign` AND `mint-rewards-change-control`.
  In particular, do NOT "fix" it by generating the PDF first with a locally
  known code — the code does not exist client-side before the redeem call.

---

## 3. Known-weak points (all OPEN as of 2026-07-08 — do not fix silently)

| # | Weakness | Evidence | Impact | Status |
|---|---|---|---|---|
| WP-1 | Auth token printed to console | `store/store.ts` line 870: `console.log("[getDiscounts] token:", token);` (response bodies also logged at ~879 and in `availDiscount` ~904) | Token appears in device logs / `adb logcat` / crash tooling; anyone with log access can impersonate the user until token expiry | Open |
| WP-2 | Google Maps API key committed | `app.json` lines 41–42: `"googleMaps": { "apiKey": "AIzaSy..." }` | Billable key in a public-ish repo; violates the owner's "no secrets in git" non-negotiable. (The Google OAuth client IDs hardcoded in `utils/googleAuth.ts` ~59–60 are NOT secret-class — client IDs are public by design) | Open — rotating/restricting the key is a change-control item |
| WP-3 | Inconsistent backend error keys | `signIn` reads `data.error \|\| data.message` (store ~344); `verifyOTP`/`updateProfile` read only `data.message` (~531, ~632); `sendRefferal`/`getDiscounts` read only `data.error` (~682, ~884); `useCouponDownload` reads `data.error` (~404) | When the backend uses the other key, users see the generic fallback instead of the real reason; debugging support tickets is slower | Open — real fix is a shared response-parsing helper (see `mint-rewards-backend-api-contract`) |
| WP-4 | Copy-paste bug: campaign/brand error states crossed | `getCampaigns` error branches set `brandError` + `isBrandLoading` (store ~838, ~848); mirror bug in `getBrands`, whose error branches set `campaignError` + `isCampaignLoading` (~737, ~747) | A failed campaigns fetch leaves `isCampaignLoading: true` forever (spinner never stops) and puts the message on the wrong error field; ditto reversed for brands | Open |
| WP-5 | `any` types on user arrays | `store/store.ts` lines 45, 48: `referrals?: any[]`, `pickupHistory?: any[]` | Zero type safety on referral and pickup rendering; backend shape changes surface as runtime crashes, not compile errors | Open |
| WP-6 | logger.ts duplicates API_URL | `utils/logger.ts` lines 9–10 redefine the base URL (no trailing-slash strip; commented-out LAN IP nearby) | Violates INV-3; logs can silently go to a different backend than the app during env changes | Open |
| WP-7 | useCouponDownload bypasses authenticatedFetch | `hooks/useCouponDownload.ts` ~391 raw `fetch` with Authorization header | 401 on redeem shows "Cannot Download" instead of the global sign-out; user retries forever with a dead token. Appears unintentional (no comment claims otherwise) | Open — fix belongs to `mint-rewards-coupon-reliability-campaign` |
| WP-8 | Duplicated isProfileComplete | `app/(tabs)/home.tsx` 121–124 and `app/discounts.tsx` 30 (identical today: phone/province/city) | Divergence risk on the owner's #2 non-negotiable; one-sided edits split the gate | Open |
| WP-9 | Always-true conditional in coupon HTML | `hooks/useCouponDownload.ts` line 341: `${expiryFormatted \|\| true ? \`...\` : ""}` — the meta row ALWAYS renders (inner ternary handles the empty-expiry case anyway) | Harmless today (dead branch), but it reads as intent to hide the row and will confuse the next editor; the "SINGLE USE" chip always shows regardless | Open |
| WP-10 | No request timeout outside signIn/signUp | `fetchWithTimeout` (15 s) is used ONLY at store ~295 and ~369; `authenticatedFetch`, `forgotPassword`, `verifyOTP`, `setPassword`, logger, and the coupon redeem all use bare `fetch` | On Pakistani mobile networks a hung request = spinner forever (and in the redeem path, ambiguity about whether the coupon burned) | Open |
| WP-11 | Redeem burns coupon before PDF | See INV-7 | PDF/share failure after a successful redeem = user paid points, has no coupon artifact except an alert telling them to screenshot | Open — THE active reliability campaign |

Rule: each WP fix is its own reviewed change via `mint-rewards-change-control`;
never bundle a WP fix into an unrelated diff.

---

## 4. Design decisions and WHY

**Single Zustand store, four slices in one file** — not per-feature stores.
The slices genuinely share state: campaign/discount/profile actions all read
`get().token || get().user?.token`, `updateProfile` chains into
`getProfile()`, and `authenticatedFetch` needs ONE `useAppStore.getState().signOut()`
to reset everything atomically on 401. Splitting stores would turn sign-out
into a multi-store choreography — the exact class of bug the single store
prevents. Cost: `store/store.ts` is ~940 lines; accepted.

**SecureStore over AsyncStorage for the token** — `expo-secure-store` is
Keychain (iOS) / Keystore-backed (Android): encrypted at rest, excluded from
device backups by default. AsyncStorage is a plaintext file readable on rooted
devices and included in backups. For a bearer token that IS the session (no
refresh-token dance — see INV-2), plaintext storage is unacceptable. Note the
irony tracked as WP-1: the securely stored token is currently printed to the
console.

**Remote logging to our own backend (`POST /api/logs`) over Sentry/third-party** —
`utils/logger.ts` sends structured events (auth, screen views, errors, device
context) to the same backend that already exists, giving field visibility with
zero extra SDK (native SDKs would also fight the Expo Go constraint, INV-6),
zero vendor cost, and log storage next to the user data it references. Trade-off
accepted: no crash symbolication, no alerting — logs are pull-only. The
`sendLog` catch-and-warn guarantees logging can never break the app (and it is
deliberately outside `authenticatedFetch`, so a 401 on logs can't sign anyone
out).

**Native Google Sign-In (`@react-native-google-signin/google-signin`) over the
expo-auth-session OAuth proxy** — the corpse of the first attempt is preserved,
commented out, at the top of `utils/googleAuth.ts` (AuthSession +
`https://auth.expo.io/@mint-rewards/mint-rewards` redirect). The proxy flow was
a costly failure (owner, 2026-07-07: Google Sign-In setup was one of the two
costliest failures — full story in `mint-rewards-failure-archaeology`). The
native module gives the platform-blessed account picker and returns an ID token
the backend can verify directly at `/api/auth/google`; the price is a custom
dev build (no Expo Go), which is why it is loaded via the INV-6 try/require
pattern with a rebuild hint in the warning.

**Explicit Stack.Screen registration despite file-based routing** — every
screen is listed in `app/_layout.tsx` even though expo-router would
auto-register them. This gives one place to see the whole navigation surface
and set per-screen options; keep the convention (add new screens there).

---

## 5. When NOT to use this skill

| You actually want | Go to |
|---|---|
| To make/approve a change, PR discipline | `mint-rewards-change-control` |
| Reproduce/diagnose a live bug step-by-step | `mint-rewards-debugging-playbook` |
| History of past failures (Google Sign-In saga, coupon used-state bugs) | `mint-rewards-failure-archaeology` |
| Endpoint shapes, request/response bodies, error keys | `mint-rewards-backend-api-contract` |
| Auth flows in depth (Google/Apple/OTP/token lifecycle) | `mint-rewards-auth-and-identity` |
| Env vars, .env, app.json config, feature flags | `mint-rewards-config-and-flags` |
| EAS builds, prebuild, signing, profiles | `mint-rewards-build-and-env` |
| Running the app, day-to-day operation | `mint-rewards-run-and-operate` |
| Logs, tooling, inspecting state | `mint-rewards-diagnostics-and-tooling` |
| Test/QA procedure before release | `mint-rewards-validation-and-qa` |
| Fixing the redeem-before-PDF weakness (WP-7/WP-11) | `mint-rewards-coupon-reliability-campaign` |
| Store release, versioning, positioning | `mint-rewards-release-and-positioning` |
| Roadmap/priorities/method | `mint-rewards-frontier-and-method` |
| Generic Expo/RN API reference | `expo-react-native-reference` |

---

## 6. Provenance and maintenance

All claims verified against the working tree on 2026-07-08 (branch `main`,
HEAD 45013c5). Re-verify before trusting line numbers:

- Route table: `ls app app/\(tabs\)` and `grep -n "Stack.Screen" app/_layout.tsx`
- Store slices: `grep -n "Slice\b\|^type AppStore" store/store.ts`
- INV-1 exceptions: `grep -rn "fetch(" --include="*.ts*" app hooks utils store | grep -v authenticatedFetch`
- INV-2 raw token: `grep -rn "Bearer\|Authorization" --include="*.ts*" app hooks utils store`
- INV-3/WP-6 URL definitions: `grep -rn "EXPO_PUBLIC_API_URL" utils/`
- INV-4 keys: `grep -rn "ItemAsync(" --include="*.ts*" app store utils`
- INV-5/WP-8 gating: `grep -n "isProfileComplete" app/\(tabs\)/home.tsx app/discounts.tsx`
- INV-6 lazy loading: `grep -n "require('@react-native-google-signin\|import(\"expo-print\"" utils/googleAuth.ts hooks/useCouponDownload.ts`
- INV-7/WP-11 ordering: `grep -n "redeem\`\|printToFileAsync\|marked used" hooks/useCouponDownload.ts`
- WP-1 token log: `grep -n "getDiscounts] token" store/store.ts`
- WP-2 Maps key: `grep -n "apiKey" app.json`
- WP-4 crossed errors: `grep -n "brandError\|campaignError" store/store.ts`
- WP-9 always-true: `grep -n "expiryFormatted || true" hooks/useCouponDownload.ts`
- WP-10 timeouts: `grep -n "fetchWithTimeout(" store/store.ts`

If any command's output contradicts this file, THE CODE WINS — update this
skill via `mint-rewards-change-control`.
