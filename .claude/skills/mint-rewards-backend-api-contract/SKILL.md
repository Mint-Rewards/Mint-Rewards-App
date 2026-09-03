---
name: mint-rewards-backend-api-contract
description: >
  Catalog of every backend endpoint the Mint Rewards client app consumes:
  method, path, auth header rules (RAW token, no Bearer), exact request bodies,
  response fields the client actually reads, and per-endpoint error-key quirks
  (data.error vs data.message vs data.ErrorMessage). Use when adding/changing
  any fetch call, debugging an API error, wiring a new screen to the backend,
  interpreting a login/signup/redeem/deals response, deciding which
  error key to read, understanding the {Status:"Success"|"Error"} wrapper, or
  coordinating a backend change. Triggers: "endpoint", "API", "fetch", "401",
  "Authorization header", "Bearer", "response shape", "error message key",
  "deals", "redeem", "soldOut", "isAvailed", "auth/google", "auth/apple",
  "/api/logs", "backend contract".
---

# Mint Rewards Backend API Contract (Client-Observed)

> **CAVEAT — this is a CLIENT-OBSERVED contract, not a backend spec.**
> Every shape below is what THIS repo's code sends and reads, derived by reading
> the client source (as of 2026-09-03). The backend is a separate repo and CANNOT
> be changed from here. Fields the backend returns but the client never reads are
> not listed.
>
> **Line-number stamps have been removed on purpose.** The previous version of
> this skill carried `store/store.ts ~L871`-style references; every one of them
> had drifted. Grep for the function name instead.
>
> **The backend is mid Mongo → Postgres migration.** Do not assume ID formats,
> field ordering or nullability are stable during cutover — see
> `Mint-Rewards-Backend/docs/plans/HANDOFF-2026-09-02-postgres-migration.md`.

## Base URL resolution

Two places compute the base URL — keep them in sync when changing env handling:

**There is now exactly one.** `config/env.ts` is the only module allowed to read
`Constants.expoConfig.extra` or `process.env`. It strips the trailing slash once,
validates that the value is an absolute http(s) URL, and throws at import time if
it is missing. `utils/constants.ts` re-exports it; `utils/logger.ts` does
`const API_URL = ENV.apiUrl`.

The old arrangement — a second base-URL definition in `utils/logger.ts` with no
trailing-slash strip, posting to `//api/logs`, plus a silent fallback to a
production URL when the env var was unset — is **fixed**. Do not reintroduce a
second reader.

`EXPO_PUBLIC_API_URL` lives in untracked `.env`; `.env.example` documents it.

## Auth header rule (non-obvious — verify before every change)

**`Authorization: <raw token>` — NO `"Bearer "` prefix.** Adding "Bearer " breaks
every authenticated call. The token comes from `store.token` / `store.user.token`
/ SecureStore key `userToken`.

Two fetch wrappers exist:

| Wrapper | File | Behavior | Used by |
|---|---|---|---|
| `authenticatedFetch` | `utils/api.ts` | Plain fetch, but **on HTTP 401 it calls `signOut()` and `router.replace("/login")` — global sign-out side effect** | my-profile, update-profile, delete-account, referrals, deals GET, deals redeem POST |
| `fetchWithTimeout` | `store/store.ts` | AbortController, **15s timeout — used ONLY by signIn and signUp**. AbortError → "Request timed out..." message | login, signup |

Plain `fetch` (no wrapper, no timeout, no 401 sign-out) is used by: reset-password,
verify-otp, set-password, `/api/auth/google`, `/api/auth/apple`,
`/api/logs`. Note the deal redeem call now goes through authenticatedFetch, so a 401 does
**not** trigger global sign-out — it just alerts "Cannot Download".

## The `{Status: "Success"|"Error"}` wrapper — TWO different things (do not confuse)

1. **Client-internal convention (most endpoints):** store actions in
   `store/store.ts` return `{ Status: "Success", Message?, ...data }` or
   `{ Status: "Error", ErrorMessage }` **to screens**. This wrapper is
   manufactured by the store; it is NOT what the backend sends. The wire format
   for these endpoints is plain JSON (`{ token, user }`, `{ discounts }`, etc.).
2. **Actual wire format (social auth only):** `/api/auth/google` and
   `/api/auth/apple` really DO return `{ Status, data, ErrorMessage }` **on the
   wire** — live-probed: `POST /api/auth/google` with `{}` returned HTTP 400
   `{"Status":"Error","ErrorMessage":"No ID token provided"}` (2026-07-08).
   Compare: `POST /api/users/login` with `{}` returned HTTP 400
   `{"error":"You must enter an email."}` — a different wire shape entirely.

So when a screen checks `result.Status === "Success"`, that is usually the store
wrapper; in `app/login.tsx` / `app/register.tsx` social-auth handlers it is the
raw response body. A model editing these must keep the two straight.

## Endpoint catalog (as of 2026-09-03)

| # | Method | Path | Auth | Caller (file) | Wrapper |
|---|---|---|---|---|---|
| 1 | POST | `/api/users/login` | none | `store/store.ts` signIn | fetchWithTimeout 15s |
| 2 | POST | `/api/users/signup` | none | `store/store.ts` signUp | fetchWithTimeout 15s |
| 3 | GET | `/api/users/my-profile` | raw token | `store/store.ts` getProfile | authenticatedFetch |
| 4 | PUT | `/api/users/update-profile` | raw token | `store/store.ts` updateProfile | authenticatedFetch |
| 5 | DELETE | `/api/users/delete-account` | raw token | `store/store.ts` deleteAccount | authenticatedFetch |
| 6 | POST | `/api/users/reset-password` | none | `store/store.ts` forgotPassword | plain fetch |
| 7 | POST | `/api/users/verify-otp` | none | `store/store.ts` verifyOTP | plain fetch |
| 8 | POST | `/api/users/set-password` | none | `store/store.ts` setPassword | plain fetch |
| 9 | POST | `/api/users/referrals` | raw token | `store/store.ts` sendReferral | authenticatedFetch |
| 10 | GET | `/api/users/deals` | raw token | `store/store.ts` getDeals | authenticatedFetch |
| 11 | POST | `/api/users/deals/:dealId/redeem` | raw token | `store/store.ts` redeemDeal, via `hooks/useCouponDownload.ts` | authenticatedFetch |
| 17 | POST | `/api/auth/google` | none | `app/login.tsx`, `app/register.tsx` | plain fetch |
| 18 | POST | `/api/auth/apple` | none | `app/login.tsx`, `app/register.tsx` | plain fetch |
| 19 | POST | `/api/logs` | none | `utils/logger.ts` sendLog | plain fetch, fire-and-forget |

NO LONGER CONSUMED — these all serve **campaign** documents and the app is
deals-only (see `Mint-Rewards-Backend/docs/VOCABULARY.md`). They remain live on
the backend for un-updated clients; do not wire new code to them.

| ~~GET~~ | `/api/users/active-campaigns` | was getBrands / getCampaigns / getBrandsWithCampaigns |
| ~~GET/PATCH/PUT~~ | `/api/users/my-discounts` | was getDiscounts / availDiscount / markDiscountUsed |
| ~~PATCH~~ | `/api/coupons/:couponId/redeem` | was useCouponDownload. `couponId` is a **campaign** `_id`. |

(unique method+path combos; `app/change-password.tsx`,
`app/collections.tsx`, `app/notifications.tsx` and all `app/(tabs)/*` screens call
only the store actions above — no direct fetches. Verified by
`grep -rn "fetch(" app components hooks utils store`.)

---

### 1. POST /api/users/login — `signIn`

- **Auth:** none. **Timeout:** 15s (`fetchWithTimeout`).
- **Sends:** `{ email: string, password: string }`
- **Reads on success (`response.ok`):** `data.token` (string) and `data.user.*`:
  `_id, email, userName, phone, isAdmin, avatar, address, province, city, town,
  mintId, latitude, longitude, deviceToken, points, totalCollections,
  totalWasteCollected, referrals, firstTimeLogin, emailVerified, pickupHistory`.
- **Error keys:** `data.error || data.message` (both checked, in that order).
  Live-probed: empty body → HTTP 400 `{"error":"You must enter an email."}`.
- **Side effects:** sets store `user`+`token`; writes SecureStore `userToken`,
  `userEmail`, `userName`, `userPoints`; logs LOGIN event. Returns store wrapper
  `{ Status: "Success", ...data }` to the screen.

### 2. POST /api/users/signup — `signUp`

- **Auth:** none. **Timeout:** 15s.
- **Sends:** `{ email, password, confirmPassword (= password), userName, phone,
  address: "", province, city, town }` — note `confirmPassword` duplicate and
  hard-coded empty `address`.
- **Reads on success:** `data.user._id` (for logging only). **No token is
  issued** — `app/register.tsx` immediately calls `signIn` after a successful
  signup to obtain one. `register.tsx` passes `phone/province/city/town = ""`;
  profile-completeness gating depends on those staying empty until the user
  fills them — never fake-populate. (UNVERIFIED whether backend echoes more.)
- **Error keys:** `data.error || data.message`.

### 3. GET /api/users/my-profile — `getProfile`

- **Auth:** raw token required (throws client-side if none). Live-probed no-auth: 401.
- **Sends:** no body.
- **Reads on success:** `data.user` — stored wholesale as store `user`
  (shape = `User` interface in store/store.ts).
- **Error keys:** `data.message` only. On failure sets `user: null`.
- **Side effects:** 401 → global sign-out via authenticatedFetch.

### 4. PUT /api/users/update-profile — `updateProfile`

- **Auth:** raw token (header included only if token truthy).
- **Sends:** `{ ...updates }` — any subset of `UserProfile` keys:
  `userName, phone, province, city, town, address, email, latitude, longitude`.
- **Reads on success:** nothing specific (spreads `data` into the store wrapper);
  then re-fetches via `getProfile()`.
- **Error keys:** `data.message` only.
- **Side effects:** on success triggers `getProfile()`; logs PROFILE_UPDATE.
  This endpoint is what clears profile-completeness gating — treat with care.

### 5. DELETE /api/users/delete-account — `deleteAccount`

- **Auth:** raw token.
- **Sends:** `{ email }` (current user's email) — a DELETE with a JSON body.
- **Reads on success:** nothing; tolerates an empty/204 body
  (`response.json()` wrapped in try/catch).
- **Error keys:** `data?.error || data?.message`, falls back to
  `` `Deletion failed (${response.status})` ``.
- **Side effects:** logs ACCOUNT_DELETED. Caller must still `signOut()`.

### 6. POST /api/users/reset-password — `forgotPassword`

- **Auth:** none. **Sends:** `{ email }`.
- **Reads:** NOTHING — the response is not checked at all (no `.ok`, no body).
  Fire-and-forget: always returns `{ Status: "Success" }` unless the fetch
  throws (network error). A backend 4xx/5xx here is invisible to the user.
- **Error keys:** n/a (wire errors swallowed).

### 7. POST /api/users/verify-otp — `verifyOTP`

- **Auth:** none. **Sends:** `{ email, otp }` (otp as string).
- **Reads on success:** nothing specific (spreads `data`).
- **Error keys:** `data.message` only (`data.error` is NOT read here).

### 8. POST /api/users/set-password — `setPassword`

- **Auth:** none (email-scoped — flagged risk; see
  `mint-rewards-auth-and-identity`). **Sends:** `{ email, password }`.
- **Reads on success:** nothing specific. **Error keys:** `data.message` only.
- Also used by `app/change-password.tsx` for logged-in password change.

### 9. POST /api/users/referrals — `sendReferral`

- **Auth:** raw token. **Sends:** `{ emails: string[] }`.
- **Reads on success:** nothing specific. **Error keys:** `data.error` only
  (`data.message` NOT read). Logs REFERRAL_SENT.

### 10. GET /api/users/deals — `getDeals`

- **Auth:** raw token.
- **Sends:** no body.
- **Reads on success:** `data.deals` → store `deals` (`Deal[]`). Key fields the
  client branches on: `soldOut`, `isAvailed`, `pointsRequired`, and the nested
  `brand` object.
- **Error keys:** `data.error`. Returns the previously-loaded list on failure
  rather than blanking the screen.
- Brand lists on home and `redeem.tsx` are **derived from this payload** via
  `groupDealsByBrand` in `utils/deals.ts` — they are not fetched separately.

### 11. POST /api/users/deals/:dealId/redeem — `redeemDeal`

- **Auth:** raw token, via `authenticatedFetch`.
- **Sends:** no body; `:dealId` is a `Deal._id`.
- **Returns:** `{ code: string }` on success, `{ error: string }` otherwise.
- **Side effects — CRITICAL:** a successful call claims the code
  **irreversibly** on the backend BEFORE the PDF is generated in
  `hooks/useCouponDownload.ts`. If PDF generation then fails, the code is
  already burned — the hook deliberately does not retry the redeem and tells
  the user to screenshot the code. This is the app's hardest reliability
  problem; read the redeem-before-PDF invariant in
  `mint-rewards-architecture-contract` before touching it.

### 12. GET /api/users/brands — `getBrands`

- **Auth:** raw token.
- **Reads on success:** `data.brands` → store `brands` (`Deal["brand"][]`).
- **Error keys:** `data.error`. On failure the previously-loaded list is left in
  place — brands are the shell deals render into, so blanking it on a transient
  failure would empty a screen that still has good deals to show.

### 13. PATCH /api/users/location — `utils/locationApi.ts`

- **Auth:** raw token, via `authenticatedFetch`.
- **Sends:** the location fields collected by `hooks/useLocationForm.ts`
  (province, city, town/area, house number, latitude/longitude).
- Read `utils/locationApi.ts` and `utils/locationSave.ts` for the exact body —
  it changes with `LOCATION_COMPLETION_VERSION`, which **must stay in step with
  the backend's `lib/evaluateLocation.ts`**.

### 14. POST /api/location/reverse-geocode

- **Auth:** raw token.
- **Sends:** `{ latitude, longitude }`.
- Used to prefill the address form from a dropped pin. See
  `utils/locationPrefill.ts`.

### 15. GET /api/app-config — `components/UpdateGate.tsx`, `utils/locationGateConfig.ts`

- **Auth:** NONE. It runs before login, deliberately — `UpdateGate` must stay
  off the store's import graph.
- **Wrapper:** a module-private `fetchWithTimeout` (8 s), not
  `authenticatedFetch`.
- **Reads:** `minSupportedVersion` (semver), `minSupportedBuildNumber.{ios,android}`
  (integers), `iosStoreUrl`, `androidStoreUrl` (https only), `forceOTA` (bool).
- **Parsing is defensive and FAILS OPEN.** `parseAppConfig` in
  `utils/versionGate.ts` returns `null` for an unusable payload, and individual
  bad fields degrade to inert defaults rather than discarding the whole config.
  A false positive here locks users out of the app with no client-side recovery.
- Changing this endpoint's shape can hard-block every user. Coordinate it.

### 16. POST /api/users/verify-email-otp and /api/users/resend-verification-otp

- **Auth:** none. Callers: `verifyEmailOtp` / `resendVerificationOtp` in
  `store/store.ts`, driving `app/verify-email.tsx`.
- **Sends:** `{ email, otp }` and `{ email }` respectively.
- **Returns:** the `{ Status }` wrapper; screens branch on it.

> **REMOVED endpoints — do not wire new code to them.**
> `GET /api/users/active-campaigns`, `GET /api/brands`,
> `GET|PATCH|PUT /api/users/my-discounts`, `PATCH /api/coupons/:id/redeem`.
> All served **campaign** documents dressed as offers. The client no longer
> calls any of them, and `getCampaigns`, `getBrandsWithCampaigns`,
> `getDiscounts`, `availDiscount` and `markDiscountUsed` no longer exist in the
> store. They may still be live on the backend for un-updated clients.

### 17. POST /api/auth/google — `app/login.tsx`, `app/register.tsx`

- **Auth:** none. **Sends:** `{ idToken: string }` — ONLY the idToken (from
  `utils/googleAuth.ts` native sign-in result). No user object is sent.
- **Wire format (real, not store wrapper):** success = HTTP ok with
  `{ Status: "Success", data: {...user fields...} }`; client checks
  `data.Status === 'Success'` then reads `data.data.*` (same field list as
  login, plus `picture` as avatar fallback: `userData.avatar || userData.picture`),
  including `data.data.token`.
- **Error keys:** `data.ErrorMessage`. Live-probed: `{}` body → HTTP 400
  `{"Status":"Error","ErrorMessage":"No ID token provided"}`.
- **Side effects:** sets store user/token, writes the same four SecureStore
  keys as login, routes to `/(tabs)/home`. Google Sign-In setup is a documented
  costly failure — see `mint-rewards-failure-archaeology`.

### 18. POST /api/auth/apple — `app/login.tsx`, `app/register.tsx`

- **Auth:** none. **Sends:** `{ identityToken: string, fullName: object|null }`
  where `fullName` is Apple's `{ givenName, familyName, ... }`. Apple provides
  `fullName` ONLY on first-ever sign-in; the client caches it in SecureStore
  under `appleFullName_<credential.user>` and replays the cached value on
  later sign-ins.
- **Wire format:** same `{ Status, data, ErrorMessage }` wrapper as Google.
  Client reads `data.data.*` (same field list; no `picture` fallback).
- **Error handling quirk:** if `!res.ok` the client throws with `res.text()`
  (raw body in the error message) BEFORE parsing JSON; `data.ErrorMessage` is
  only read when HTTP is ok but `Status !== 'Success'`.
- **Side effects:** identical to Google (store, SecureStore, route to home).

### 19. POST /api/logs — `sendLog`

- **Auth:** none. Fire-and-forget; response never read; failures only
  `console.warn` ("never let logging break the app").
- **Sends — full `LogPayload`:**

```jsonc
{
  "event": "LOGIN|REGISTER|LOGOUT|PASSWORD_RESET|OTP_VERIFY|SCREEN_VIEW|PROFILE_UPDATE|REFERRAL_SENT|DISCOUNT_VIEWED|BRAND_VIEWED|ACCOUNT_DELETED|API_ERROR|APP_ERROR",
  "level": "info|warn|error",          // optional, default "info"
  "userId": "string?", "userEmail": "string?",
  "route": "string?", "previousRoute": "string?",
  "deviceId": "string",                 // Constants.installationId ?? "unknown"
  "deviceModel": "string", "platform": "ios|android",
  "appVersion": "string", "buildNumber": "string",
  "timestamp": "ISO-8601 string",
  "extra": { }                          // optional arbitrary object
}
```

- Uses the DUPLICATE `API_URL` in logger.ts (see Base URL section).

---

## Error-key cheat sheet (the inconsistency is real — copy exactly)

| Endpoint | Error key(s) the client reads |
|---|---|
| login, signup | `data.error \|\| data.message` |
| delete-account | `data?.error \|\| data?.message \|\| "Deletion failed (status)"` |
| my-profile, update-profile, verify-otp, set-password | `data.message` only |
| referrals, deals GET, brands GET, deals redeem | `data.error` only |
| reset-password, /api/logs | none (response body ignored) |
| app-config | none — `parseAppConfig` normalises the body and fails open |
| auth/google, auth/apple | `data.ErrorMessage` (wire wrapper; apple throws raw text on non-ok HTTP) |

When adding a new call, read BOTH `data.error` and `data.message` defensively
unless you have live-probed the endpoint's actual error shape.

## Coordination protocol: when the client needs a backend change

The backend is a separate repo; you cannot change it from here. If the client
needs a new endpoint, field, or behavior:

1. **Document the need** precisely in this skill (or the task/PR description):
   method, path, desired request/response shape, and which client code blocks on it.
2. **Mark the client work "blocked-on-backend"** — leave a `// BLOCKED-ON-BACKEND:` comment at the call site describing the expected contract.
3. **Never fake it client-side** — no hardcoded mock responses, no optimistic
   writes pretending the endpoint exists, no silently swallowing the gap.
4. Route the request through `mint-rewards-change-control`; verify the deployed
   behavior with a probe (below) before removing the blocked marker.

## Quick smoke-check (safe, unauthenticated)

```bash
BASE="$(grep '^EXPO_PUBLIC_API_URL=' .env | cut -d= -f2-)"
# Unauthenticated, safe to read:
curl -s -o /dev/null -w "app-config -> %{http_code}\n" "$BASE/api/app-config"
# Authenticated endpoints should be 401 without a token:
for ep in /api/users/my-profile /api/users/deals /api/users/brands; do
  curl -s -o /dev/null -w "$ep -> %{http_code}\n" "$BASE$ep"; done
```

Expected: app-config 200; the three user endpoints 401. Paths verified
2026-09-03; status codes not re-probed.
Full diagnostic scripts: see `mint-rewards-diagnostics-and-tooling`.
Do NOT probe with real credentials or run write operations from scripts.

## When NOT to use this skill

- Auth flows, token lifecycle, Google/Apple sign-in setup, profile-completeness
  gating rules → `mint-rewards-auth-and-identity`
- Coupon redeem reliability strategy, used-state bug history → `mint-rewards-coupon-reliability-campaign`, `mint-rewards-failure-archaeology`
- Debugging a failing request end-to-end → `mint-rewards-debugging-playbook`
- Env vars, `.env`, build profiles → `mint-rewards-config-and-flags`, `mint-rewards-build-and-env`
- Curl/probe scripts and log inspection tooling → `mint-rewards-diagnostics-and-tooling`
- App architecture, store layout, routing → `mint-rewards-architecture-contract`
- Making any of the changes this catalog describes → `mint-rewards-change-control` first

## Provenance and maintenance

Derived by reading client source on 2026-07-08. Re-verify with:

- All fetch callers: `grep -rn "fetch(" app components hooks utils store` and `grep -rn "/api/" app components hooks utils store`
- Auth header rule + 401 sign-out: `grep -n "Authorization\|status === 401" utils/api.ts store/store.ts hooks/useCouponDownload.ts`
- Base URL + duplicate: `grep -n "EXPO_PUBLIC_API_URL" utils/constants.ts utils/logger.ts`
- 15s timeout scope: `grep -n "fetchWithTimeout" store/store.ts`
- Redeem response keys: `grep -n "couponCode\|referenceCode" hooks/useCouponDownload.ts`
- Avail fallback keys: `grep -n "data.code ?? data.discountCode" store/store.ts`
- Live status probes: run the smoke-check block above.

If any command's output contradicts this file, the code wins — update this file.
