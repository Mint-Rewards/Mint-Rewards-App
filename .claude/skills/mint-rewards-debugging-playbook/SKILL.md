---
name: mint-rewards-debugging-playbook
description: >
  Symptom-to-cause triage for the Mint Rewards Expo/React Native app. Load this
  skill when you see: "Cannot find native module", crash on import, Google
  Sign-In fails / DEVELOPER_ERROR / sign-in cancelled, user unexpectedly bounced
  to the login screen, app stuck on "Loading your experience...", coupon marked
  used but no PDF was generated, "PDF Generation Failed", app hitting the wrong
  backend / stale EXPO_PUBLIC_API_URL, Metro bundler weirdness or stale cache,
  blank Google Map on Android, requests hanging forever, 401 loops, Expo Go vs
  development build confusion, or any "it worked yesterday" debugging session in
  this repo.
---

# Mint Rewards Debugging Playbook

Triage first (tables), stories second, discriminating experiments last. Every
path, line number, endpoint, and commit hash below was verified against this
repo on 2026-07-08. Line numbers drift — re-grep before trusting them.

Definitions used throughout:

- **Expo Go** — Expo's stock sandbox app from the App/Play store. It only
  contains the native modules Expo ships; custom native modules crash or
  no-op in it.
- **Development build (dev build / dev client)** — a custom binary of THIS app
  compiled with all its native modules (`expo-dev-client` is in
  `package.json`). Built via `npx expo run:ios` / `npx expo run:android` or EAS
  `development` profile.
- **Prebuild** — `npx expo prebuild` generates the `android/` and `ios/`
  native projects from `app.json`. Both directories are gitignored (commit
  `fe5294d`), so **native config truth lives in `app.json`**, not in `android/`
  or `ios/`.
- **Raw token auth** — this backend expects `Authorization: <token>` with NO
  `Bearer ` prefix. Every store call passes the token raw (e.g.
  `store/store.ts` `headers: { Authorization: token }`).

---

## 1. Symptom → likely cause → first command

| # | Symptom | Likely cause | First command / first file |
|---|---------|--------------|----------------------------|
| 1 | "Cannot find native module ...", crash at app start or on first Google/PDF action; console warning `[googleAuth] RNGoogleSignin native module not found` | Running in Expo Go (or a stale dev build) without the native module compiled in. `utils/googleAuth.ts` guards the require in a try/catch; `hooks/useCouponDownload.ts` dynamic-imports `expo-print`/`expo-sharing` — so the app *launches*, but the feature fails at use time. | Rebuild the dev client: `npx expo run:ios` or `npx expo run:android` |
| 2 | Google Sign-In button does nothing, alerts an error, or shows `DEVELOPER_ERROR` | Config mismatch (webClientId / SHA-1 / package name — Android package is `com.mintrewards.appp`, three p's) or missing native module. See section 2.2. | `Read utils/googleAuth.ts` and `app/login.tsx` (handleGoogleSignIn, line ~324) |
| 3 | User unexpectedly bounced to `/login` mid-session | `authenticatedFetch` in `utils/api.ts` force-signs-out and `router.replace("/login")` on **any** 401 — a backend hiccup or one stale-token response is enough. | curl the failing endpoint with the same raw token (section 3.1) to see the real status |
| 4 | App stuck on "Loading your experience..." | That text is `app/index.tsx` (a pure loading screen). The `checkAuth` effect in `app/_layout.tsx` never completed — usually `getProfile()` hanging (it has **no timeout**, see row 9) or throwing before `router.replace` runs. | `Read app/_layout.tsx` lines 20–47; check Metro console for `Auth check failed:` |
| 5 | Coupon marked used on backend but no PDF appeared | The burn window in `hooks/useCouponDownload.ts`: redeem `PATCH /api/coupons/:id/redeem` succeeds FIRST, PDF generation happens SECOND; a PDF failure leaves the coupon burned. Breadcrumb: `console.error("[useCouponDownload] PDF generation failed after successful redeem." ...couponId...)`. | Search device/Metro logs for `[useCouponDownload]`; then load **mint-rewards-coupon-reliability-campaign** |
| 6 | App hits wrong backend / env change not taking effect | `EXPO_PUBLIC_*` vars are inlined into the JS bundle **at bundle time**. Default when unset: `https://mint-rewards-backend.vercel.app` (`utils/constants.ts` line 13; a second copy of the same fallback lives in `utils/logger.ts` lines 9–10). Changing `.env` requires a cache-cleared restart; release binaries need a full rebuild. | `npx expo start -c` |
| 7 | Metro/bundler weirdness: phantom modules, "unable to resolve", stale code running | Stale Metro cache or corrupted `node_modules`. | `npx expo start -c`; if that fails: `rm -rf node_modules && npm install` |
| 8 | Google Map blank/grey on Android (`components/ui/MapPicker.tsx`) | Android Maps API key lives at `app.json → android.config.googleMaps.apiKey` (added in commit `3a87f39`; known legacy exception to the no-secrets-in-git rule). Key invalid/restricted, or `android/` was built before the key existed. | `Read app.json` lines 40–44; then `npx expo prebuild --clean && npx expo run:android` |
| 9 | A request hangs forever (spinner never resolves) | `fetchWithTimeout` (15 s, AbortController — `store/store.ts` lines 9–21) is used **only** by `signIn` and `signUp`. Every other call — `getProfile`, `getDiscounts`, the coupon redeem PATCH in `useCouponDownload`, `authenticatedFetch` itself, the logger — uses plain `fetch` with **no timeout**. | `grep -n fetchWithTimeout store/store.ts` to confirm; reproduce with curl + `--max-time 15` |

---

## 2. Traps that cost real time (each with its story)

### 2.1 The Google Sign-In migration (expo-auth-session → native module)

The first Google Sign-In attempt used `expo-auth-session` with the Expo auth
proxy (`https://auth.expo.io/@mint-rewards/mint-rewards`). It was abandoned;
the entire dead implementation is still commented out at the **top of
`utils/googleAuth.ts` (lines 1–41)** — do not resurrect it. The working
approach is the native `@react-native-google-signin/google-signin` module:

- `34786ba` — "added Sign in with Google button" (added the native package,
  `utils/googleAuth.ts`, app.json plugin entry)
- `2a8b134` — "Sign in w Google works"
- `d73ef9e` — "Signup w Google works"

Consequences that still bite today:

- The native module means Google Sign-In **cannot work in Expo Go**. The
  try/catch require guard in `utils/googleAuth.ts` (lines 45–54) prints
  `[googleAuth] RNGoogleSignin native module not found` and every sign-in
  attempt returns `{ success: false, error: 'Google Sign-In is not available on this build.' }`.
- Client IDs are hardcoded in `configureGoogleSignIn()`:
  `iosClientId: 490896222696-4jtrnrbi9uhn98q2ukjb68f2cd45dq2v...`,
  `webClientId: 490896222696-3umgevhg0eqtkg03cfs7saa19i0g8qir...`.
  The iOS URL scheme is configured via the plugin in `app.json`
  (`iosUrlScheme: com.googleusercontent.apps.490896222696-4jtr...`). If you
  change any of these, prebuild + rebuild — JS reload is not enough.
- `signInWithGoogle()` explicitly handles only `statusCodes.SIGN_IN_CANCELLED`
  (returns `error: 'cancelled'`, which `app/login.tsx` silently swallows) and
  `statusCodes.IN_PROGRESS` (`error: 'in_progress'`). Everything else falls
  through to `error.message` — which is where **`DEVELOPER_ERROR`** shows up
  on Android. DEVELOPER_ERROR = configuration mismatch: wrong `webClientId`,
  the signing SHA-1 not registered in the Google Cloud console, or a package
  name mismatch. Remember the Android package is `com.mintrewards.appp`
  (three p's) while iOS is `com.mintrewards.app` — registering the wrong one
  in the console is the classic mistake here.
- After a successful native sign-in, `app/login.tsx` `handleGoogleSignIn`
  POSTs `{ idToken }` to `POST /api/auth/google` (no auth header) and expects
  `data.Status === 'Success'` with the app user in `data.data`. A backend
  failure here looks like "Google worked but login failed" — check the
  `console.log('Response status:', ...)` breadcrumbs it leaves.

Deep-dive on the auth flows lives in **mint-rewards-auth-and-identity**.

### 2.2 Coupon used-state: removed "for now", then rebuilt twice

Chronology (all verified via `git show`):

1. Originally, copying a discount code called `markDiscountUsed` (a `PUT
   /api/users/my-discounts` store action — still present at
   `store/store.ts` line ~915).
2. `a5b7c30` (2026-04-30) — "removed markDiscountUsed for now": the call in
   `app/discounts.tsx` `handleCopy` was simply **commented out**
   (`// if (modal.item) await markDiscountUsed(modal.item._id);`), so for
   weeks coupons were never marked used at all.
3. The download feature (`81f9488` "PDF download successful", `16cd4a5`
   coupon download feature) rebuilt used-state around
   `PATCH /api/coupons/:id/redeem` inside `hooks/useCouponDownload.ts` —
   redeem-then-PDF, creating today's burn window (triage row 5).
4. `bd2178c` (2026-05-18) — "redeem page used-coupon fix": `app/redeem.tsx`
   previously showed used coupons as still available. The fix added
   `isUsedByUser = campaign.users?.includes(user._id)`, disabled/greyed used
   cards, and refreshes `getBrandsWithCampaigns()` after a successful
   download so the card flips to "Used" immediately.

Lesson: used-state has THREE historical mechanisms (`markDiscountUsed` PUT,
`availDiscount` PATCH to `/api/users/my-discounts`, and the coupon redeem
PATCH). Only the redeem PATCH is the live mechanism for coupon downloads. If
used-state looks wrong, first establish *which* mechanism the screen you're
debugging goes through. The reliability campaign for the burn window is
**mint-rewards-coupon-reliability-campaign**.

### 2.3 The .env.local incident (why .env is untracked)

`cee0f19` committed `.env.local` to git, `765bf15` updated it, and `164fdcb`
("remove .env.local") deleted it and fixed `.gitignore`. The hashes remain in
history — treat anything that was in that file as exposed. Rule ever since:
`.env` stays untracked (`.gitignore` line 1). Current `.env` keys:
`EXPO_PUBLIC_API_URL`, `APPLE_BUNDLE_ID` (as of 2026-07-08). The Android Maps
key in `app.json` is the known legacy exception.

### 2.4 Profile-completeness gating is load-bearing

Coupons/discounts are locked until phone + province + city are set:
`app/discounts.tsx` line 30 (`isProfileComplete = !!(user?.phone?.trim() &&
user?.province?.trim() && user?.city?.trim())`) and `app/(tabs)/home.tsx`
line ~121. Introduced in `2297728` ("profile fields now mandatory
post-signup") and `3129340` ("locked coupons/discounts until profile is
complete"). If a debugging change makes coupons reachable with an incomplete
profile, that is a regression, not a fix. Do not "temporarily" bypass it —
route changes through **mint-rewards-change-control**.

---

## 3. Discriminating experiments

### 3.1 Backend vs client (is the API actually failing?)

The header format is **raw token, no `Bearer ` prefix**:

```bash
# Expect 401 (no token):
curl -i https://mint-rewards-backend.vercel.app/api/users/my-profile \
  -H "Content-Type: application/json"

# With the user's token — replace <RAW_TOKEN>, note NO "Bearer ":
curl -i --max-time 15 https://mint-rewards-backend.vercel.app/api/users/my-profile \
  -H "Content-Type: application/json" \
  -H "Authorization: <RAW_TOKEN>"

# The coupon redeem call the app makes (WARNING: a 200 BURNS the coupon —
# only run against a coupon you are willing to consume):
curl -i --max-time 15 -X PATCH \
  https://mint-rewards-backend.vercel.app/api/coupons/<COUPON_ID>/redeem \
  -H "Content-Type: application/json" \
  -H "Authorization: <RAW_TOKEN>"
```

If `.env` overrides `EXPO_PUBLIC_API_URL`, test against that URL instead —
check with `cat .env`. Endpoint semantics beyond status codes:
**mint-rewards-backend-api-contract**.

Interpretation:

| curl result | app behavior | conclusion |
|---|---|---|
| 200 | app bounced user to login | transient backend 401 or the app held a different/stale token — see 3.3 |
| 401 | app bounced user to login | token genuinely invalid; `authenticatedFetch` behaved as designed |
| 5xx / timeout | any | backend problem; stop debugging the client |

### 3.2 Expo Go vs dev build (which native modules need a rebuild?)

Modules in `package.json` that this repo treats as requiring a development
build (each has a runtime guard or an `app.json` config plugin):

| Module | Evidence in repo | Failure mode in wrong environment |
|---|---|---|
| `@react-native-google-signin/google-signin` | try/catch require in `utils/googleAuth.ts`; config plugin in `app.json` | console warn + "not available on this build" alert |
| `expo-print`, `expo-sharing` | dynamic `import()` inside `downloadCoupon` in `hooks/useCouponDownload.ts` | "PDF Generation Failed" alert **after the coupon is already burned** — never demo coupon download in Expo Go. (UNVERIFIED whether Expo Go SDK 54 bundles these two; the code deliberately assumes it may not.) |
| `react-native-maps` | `components/ui/MapPicker.tsx`; API key in `app.json` | blank map / crash (UNVERIFIED in Expo Go SDK 54 — verify on device before relying on this) |
| `expo-apple-authentication` | plugin in `app.json`; used in `app/login.tsx` | Apple button unavailable |

Discriminating experiment: if a "native module" error reproduces in Expo Go
but disappears in a build from `npx expo run:ios` / `npx expo run:android`,
it is an environment problem, not a code bug. If it persists in a fresh dev
build, suspect `app.json` plugin config, then run `npx expo prebuild --clean`
and rebuild.

### 3.3 Token validity (grab the exact token the app is using)

The store **logs the raw token to the console** on every discounts fetch:
`store/store.ts` line ~870 — `console.log("[getDiscounts] token:", token)`.
Open the discounts screen with Metro attached and copy it from the console,
then feed it to the curls in 3.1.

Flag: that log line is a credential leak into device logs — a known-weak
point; cross-ref **mint-rewards-architecture-contract** before "fixing" it
mid-debug (it is also currently the easiest token-extraction tool you have).
Nearby breadcrumbs that show status + full response body:
`[getDiscounts] status:` and `[availDiscount] status:` in the same file.

### 3.4 The "Loading your experience..." trace

Flow (verified in `app/_layout.tsx` lines 20–47): app opens on `app/index.tsx`
(pure spinner, no logic) → `checkAuth` in the root layout runs once:

1. `SecureStore.getItemAsync("userToken")`
   - no token → `router.replace("/login")`
2. token exists → `setUserData({ token })` → `await getProfile()`
   (`GET /api/users/my-profile` via `authenticatedFetch`, raw token header)
   - profile OK → store `user` set → `router.replace("/(tabs)/home")`
   - profile fails (non-200) → `getProfile` sets `user: null` → layout
     deletes `userToken` from SecureStore → `/login`
   - `getProfile` **hangs** (no timeout, triage row 9) → stuck on the
     spinner forever — this is the only branch with no exit
3. any thrown error → `console.error("Auth check failed:", ...)` → token
   deleted → `/login`

Discriminating experiment: stuck spinner + no `Auth check failed:` log +
3.1 curl also slow ⇒ backend/network hang. Curl fast but app stuck ⇒ client
side (Metro cache, row 7). Note a 401 during `getProfile` ALSO triggers
`authenticatedFetch`'s own signOut+redirect — two code paths race to send
you to `/login`; both mean "stale token", not a bug in itself.

### 3.5 Which backend is this bundle actually talking to?

```bash
cat .env                                  # override, if any (untracked file)
grep -n "API_BASE_URL" utils/constants.ts # fallback + trailing-slash strip
grep -rn "EXPO_PUBLIC_API_URL" utils/     # note logger.ts has its own copy
```

Then in the running app, `app/login.tsx` logs `Hitting URL: <...>/api/auth/google`
during Google sign-in — a live readout of the inlined value. Remember: after
editing `.env`, `npx expo start -c`; for preview/production binaries the value
is baked in at EAS build time (profiles: development, simulator, preview,
production in `eas.json`) — see **mint-rewards-build-and-env**.

---

## When NOT to use this skill

- Coupon burn-window remediation work (not just diagnosing it) →
  **mint-rewards-coupon-reliability-campaign**
- Auth/identity design, token lifecycle, Apple/Google flows in depth →
  **mint-rewards-auth-and-identity**
- Measurement scripts, log tooling, profiling → **mint-rewards-diagnostics-and-tooling**
- Build failures, EAS profiles, env-var plumbing, prebuild mechanics →
  **mint-rewards-build-and-env**; day-to-day run commands → **mint-rewards-run-and-operate**
- Endpoint request/response shapes → **mint-rewards-backend-api-contract**
- Historical why-was-this-done archaeology beyond the traps above →
  **mint-rewards-failure-archaeology**
- Making any fix permanent (branching, review, release) →
  **mint-rewards-change-control**; QA passes → **mint-rewards-validation-and-qa**
- Generic Expo/RN API reference → **expo-react-native-reference**

## Provenance and maintenance

All facts verified against this repo on 2026-07-08. One command per
drift-prone fact — re-run before relying on it:

- 401 force-signout: `grep -n "401" utils/api.ts`
- Raw-token header (no Bearer): `grep -n "Authorization: token" store/store.ts`
- Timeout only on signIn/signUp: `grep -n "fetchWithTimeout" store/store.ts`
- Token leak log: `grep -n "getDiscounts\] token" store/store.ts`
- Burn window order (redeem PATCH before PDF): `grep -n "redeem\|printToFileAsync" hooks/useCouponDownload.ts`
- PDF-failure breadcrumb: `grep -n "PDF generation failed" hooks/useCouponDownload.ts`
- Native-module guards: `grep -n "require('@react-native-google-signin" utils/googleAuth.ts && grep -n "import(\"expo-print\")" hooks/useCouponDownload.ts`
- Google client IDs + iosUrlScheme: `grep -n "ClientId\|iosUrlScheme" utils/googleAuth.ts app.json`
- statusCodes handled: `grep -n "SIGN_IN_CANCELLED\|IN_PROGRESS" utils/googleAuth.ts`
- Android package (three p's) vs iOS bundle: `grep -n "com.mintrewards" app.json`
- Maps key location: `grep -n -A2 "googleMaps" app.json`
- API base URL fallback (both copies): `grep -rn "mint-rewards-backend.vercel.app" utils/`
- checkAuth flow: `grep -n "userToken\|getProfile\|router.replace" app/_layout.tsx`
- "Loading your experience" screen: `grep -rn "Loading your experience" app/`
- Profile gating: `grep -n "isProfileComplete" app/discounts.tsx "app/(tabs)/home.tsx"`
- Commit hashes cited: `git show --stat 34786ba 2a8b134 d73ef9e a5b7c30 bd2178c cee0f19 765bf15 164fdcb fe5294d 3a87f39 2297728 3129340 | grep -E "^commit|\|" | head -40`
- Native dirs gitignored / .env untracked: `git check-ignore -v .env android ios`
- eas.json profiles: `grep -n '"development"\|"simulator"\|"preview"\|"production"' eas.json`
