---
name: mint-rewards-backend-api-contract
description: >
  Catalog of every backend endpoint the Mint Rewards client app consumes:
  method, path, auth header rules (send the stored token verbatim — it already
  contains "Bearer "), exact request bodies,
  response fields the client actually reads, and per-endpoint error-key quirks
  (data.error vs data.message vs data.ErrorMessage). Use when adding/changing
  any fetch call, debugging an API error, wiring a new screen to the backend,
  interpreting a login/signup/redeem/my-discounts response, deciding which
  error key to read, understanding the {Status:"Success"|"Error"} wrapper, or
  coordinating a backend change. Triggers: "endpoint", "API", "fetch", "401",
  "Authorization header", "Bearer", "response shape", "error message key",
  "my-discounts", "redeem", "active-campaigns", "auth/google", "auth/apple",
  "/api/logs", "backend contract".
---

# Mint Rewards Backend API Contract (Client-Observed)

> **CAVEAT — this is a CLIENT-OBSERVED contract, not a backend spec.**
> Every shape below is what THIS repo's code sends and reads, derived by reading
> the client source (as of 2026-07-08). The backend is a separate repo deployed at
> `https://mint-rewards-backend.vercel.app` and CANNOT be changed from here.
> Fields the backend returns but the client never reads are not listed.
> Rows marked **live-probed** had their status codes observed via unauthenticated
> curl on 2026-07-08; everything else is **client-inferred**.

## Base URL resolution

Two places compute the base URL — keep them in sync when changing env handling:

| File | Constant | Behavior |
|---|---|---|
| `utils/constants.ts` | `API_BASE_URL` | `process.env.EXPO_PUBLIC_API_URL ?? "https://mint-rewards-backend.vercel.app"`, **trailing slash stripped** (`.replace(/\/$/, "")`) |
| `utils/logger.ts` | `API_URL` (duplicate!) | Same env var + default, **no trailing-slash strip**. A trailing slash in `.env` produces `//api/logs` only here. |

`store/store.ts` aliases `API_URL = API_BASE_URL` (imports from constants — fine).
`EXPO_PUBLIC_API_URL` lives in untracked `.env` (never commit it — see
`mint-rewards-config-and-flags` / `mint-rewards-build-and-env`).

## Auth header rule (non-obvious — verify before every change)

**Send the stored token verbatim: `Authorization: <stored token>`. Do NOT add a
`"Bearer "` prefix — the stored value already contains one.**

This is the single easiest thing to get wrong in this repo, so read the whole
rule rather than the headline:

- The backend returns its token field **already scheme-prefixed** — literally
  `"Bearer eyJhbGci..."` — from both `POST /api/users/login` and
  `POST /api/users/verify-email-otp` (backend `login/route.ts:108`,
  `verify-email-otp/route.ts:117`; VERIFIED by backend audit 2026-07-22).
- The client stores that string as-is in `store.token` / `store.user.token` /
  SecureStore `userToken`, and sends it unmodified.
- The backend's auth middleware accepts **only** the prefixed form — it splits
  on a space and rejects anything whose first segment isn't exactly `Bearer`
  (backend `lib/auth.ts:29-32`). A bare JWT 401s.

So "no Bearer prefix" describes what *the client code adds* (nothing), not what
goes over the wire (which is `Bearer <jwt>`). Adding `"Bearer "` yourself
produces `Bearer Bearer eyJ...` and 401s every authenticated call.

> An earlier revision of this file stated the rule as "`Authorization: <raw
> token>` — NO Bearer prefix" with no explanation of where the prefix comes
> from. That phrasing led an audit to conclude the app-wide invariant was a
> bare token and to flag correct code in `verifyEmailOtp` as a bug. Keep the
> explanation attached to the rule.

Related: the `resetToken` from `verify-otp` is **not** interchangeable with a
session token — the backend rejects tokens carrying a `purpose` claim for
general auth (backend `lib/auth.ts:67-69`).

Two fetch wrappers exist:

| Wrapper | File | Behavior | Used by |
|---|---|---|---|
| `authenticatedFetch` | `utils/api.ts` | Plain fetch, but **on HTTP 401 it calls `signOut()` and `router.replace("/login")` — global sign-out side effect** | my-profile, update-profile, delete-account, referrals, active-campaigns, /api/brands, my-discounts GET/PATCH/PUT |
| `fetchWithTimeout` | `store/store.ts` | AbortController, **15s timeout — used ONLY by signIn and signUp**. AbortError → "Request timed out..." message | login, signup |

Plain `fetch` (no wrapper, no timeout, no 401 sign-out) is used by: reset-password,
verify-otp, set-password, `/api/auth/google`, `/api/auth/apple`,
`/api/coupons/:id/redeem`, `/api/logs`. Note the redeem call getting a 401 does
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

## Endpoint catalog (18 method+path entries, as of 2026-07-08)

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
| 9 | POST | `/api/users/referrals` | raw token | `store/store.ts` sendRefferal | authenticatedFetch |
| 10 | GET | `/api/users/active-campaigns` | raw token | `store/store.ts` getBrands | authenticatedFetch |
| 11 | GET | `/api/users/active-campaigns` | raw token | `store/store.ts` getCampaigns (same path, different field read) | authenticatedFetch |
| 12 | GET | `/api/brands` | raw token (sent if present) | `store/store.ts` getBrandsWithCampaigns | authenticatedFetch |
| 13 | GET | `/api/users/my-discounts` | raw token | `store/store.ts` getDiscounts | authenticatedFetch |
| 14 | PATCH | `/api/users/my-discounts` | raw token | `store/store.ts` availDiscount | authenticatedFetch |
| 15 | PUT | `/api/users/my-discounts` | raw token | `store/store.ts` markDiscountUsed | authenticatedFetch |
| 16 | PATCH | `/api/coupons/:id/redeem` | raw token | `hooks/useCouponDownload.ts` | plain fetch |
| 17 | POST | `/api/auth/google` | none | `app/login.tsx`, `app/register.tsx` | plain fetch |
| 18 | POST | `/api/auth/apple` | none | `app/login.tsx`, `app/register.tsx` | plain fetch |
| 19 | POST | `/api/logs` | none | `utils/logger.ts` sendLog | plain fetch, fire-and-forget |

(18 unique method+path combos; #10/#11 share one. `app/change-password.tsx`,
`app/collections.tsx`, `app/notifications.tsx` and all `app/(tabs)/*` screens call
only the store actions above — no direct fetches. Verified by
`grep -rn "fetch(" app components hooks utils store`.)

---

### 1. POST /api/users/login — `signIn` (store/store.ts ~L295)

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

### 2. POST /api/users/signup — `signUp` (store/store.ts ~L369)

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

### 3. GET /api/users/my-profile — `getProfile` (store/store.ts ~L266)

- **Auth:** raw token required (throws client-side if none). Live-probed no-auth: 401.
- **Sends:** no body.
- **Reads on success:** `data.user` — stored wholesale as store `user`
  (shape = `User` interface in store/store.ts).
- **Error keys:** `data.message` only. On failure sets `user: null`.
- **Side effects:** 401 → global sign-out via authenticatedFetch.

### 4. PUT /api/users/update-profile — `updateProfile` (store/store.ts ~L604)

- **Auth:** raw token (header included only if token truthy).
- **Sends:** `{ ...updates }` — any subset of `UserProfile` keys:
  `userName, phone, province, city, town, address, email, latitude, longitude`.
- **Reads on success:** nothing specific (spreads `data` into the store wrapper);
  then re-fetches via `getProfile()`.
- **Error keys:** `data.message` only.
- **Side effects:** on success triggers `getProfile()`; logs PROFILE_UPDATE.
  This endpoint is what clears profile-completeness gating — treat with care.

### 5. DELETE /api/users/delete-account — `deleteAccount` (store/store.ts ~L427)

- **Auth:** raw token.
- **Sends:** `{ email }` (current user's email) — a DELETE with a JSON body.
- **Reads on success:** nothing; tolerates an empty/204 body
  (`response.json()` wrapped in try/catch).
- **Error keys:** `data?.error || data?.message`, falls back to
  `` `Deletion failed (${response.status})` ``.
- **Side effects:** logs ACCOUNT_DELETED. Caller must still `signOut()`.

### 6. POST /api/users/reset-password — `forgotPassword` (store/store.ts ~L483)

- **Auth:** none. **Sends:** `{ email }`.
- **Reads:** NOTHING — the response is not checked at all (no `.ok`, no body).
  Fire-and-forget: always returns `{ Status: "Success" }` unless the fetch
  throws (network error). A backend 4xx/5xx here is invisible to the user.
- **Error keys:** n/a (wire errors swallowed).

### 7. POST /api/users/verify-otp — `verifyOTP` (store/store.ts ~L510)

- **Auth:** none. **Sends:** `{ email, otp }` (otp as string).
- **Reads on success:** nothing specific (spreads `data`).
- **Error keys:** `data.message` only (`data.error` is NOT read here).

### 8. POST /api/users/set-password — `setPassword` (store/store.ts ~L552)

- **Auth:** none (email-scoped — flagged risk; see
  `mint-rewards-auth-and-identity`). **Sends:** `{ email, password }`.
- **Reads on success:** nothing specific. **Error keys:** `data.message` only.
- Also used by `app/change-password.tsx` for logged-in password change.

### 9. POST /api/users/referrals — `sendRefferal` (store/store.ts ~L656)

- **Auth:** raw token. **Sends:** `{ emails: string[] }`.
- **Reads on success:** nothing specific. **Error keys:** `data.error` only
  (`data.message` NOT read). Logs REFERRAL_SENT.

### 10/11. GET /api/users/active-campaigns — `getBrands` AND `getCampaigns`

- **Auth:** raw token (sent if present). Live-probed no-auth: 401.
- **Sends:** no body. One endpoint, two callers reading DIFFERENT fields:
  - `getBrands` (store/store.ts ~L722) reads `data.activeBrands` →
    store `brands` (`BrandTheme[]`).
  - `getCampaigns` (store/store.ts ~L823) reads `data.activeCampaigns` →
    store `campaigns` (`Campaign[]`).
- **Error keys:** `data.message`. Beware: the two callers' error branches set
  each other's state slices (`getBrands` failure sets `campaignError`;
  `getCampaigns` failure sets `brandError`) — existing quirk, do not "fix"
  without change control.

### 12. GET /api/brands — `getBrandsWithCampaigns` (store/store.ts ~L770)

- **Auth:** raw token if present. Live-probed no-auth: **200** — this endpoint
  is publicly readable (2026-07-08).
- **Reads on success:** `data.brands` → store `brandsWithCampaigns`
  (`(BrandTheme & { campaigns: Campaign[] })[]`).
- **Error keys:** `data.message`.

### 13. GET /api/users/my-discounts — `getDiscounts` (store/store.ts ~L871)

- **Auth:** raw token. Live-probed no-auth: 401.
- **Reads on success:** `data.discounts` (`DiscountItem[]`; key field
  `isAvailed: boolean` drives used-coupon UI).
- **Error keys:** `data.error` only. Returns `[]` on any failure.

### 14. PATCH /api/users/my-discounts — `availDiscount` (store/store.ts ~L895)

- **Auth:** raw token. Live-probed no-auth: 401.
- **Sends:** `{ discountId: string }`.
- **Reads on success:** `data.code ?? data.discountCode ?? null` — dual-key
  fallback; the returned string is the discount code shown/used by the UI.
- **Error handling:** returns `null` on non-ok or exception; NO error key is
  read and no message surfaces. Caller must handle `null`.

### 15. PUT /api/users/my-discounts — `markDiscountUsed` (store/store.ts ~L918)

- **Auth:** raw token. **Sends:** `{ discountId: string }`.
- **Reads:** only `response.ok`; body ignored (UNVERIFIED shape).
- **Side effects:** on ok, locally flips that discount's `isAvailed: true` in
  the store. Best-effort: exceptions swallowed, state fixed on next refresh.

### 16. PATCH /api/coupons/:id/redeem — `useCouponDownload` (hooks/useCouponDownload.ts ~L391)

- **Auth:** raw token (header only if token truthy). Plain fetch — a 401 here
  does NOT global-sign-out. Live-probed no-auth: 401.
- **Sends:** no body; `:id` is `DiscountItem._id`.
- **Reads on success:** `data.couponCode ?? ""` and `data.referenceCode ?? ""`
  (type `RedeemResponse` at top of the hook). NOTE: the `code ?? discountCode`
  fallback belongs to endpoint #14, NOT this one — do not conflate.
- **Error keys:** `data.error` only.
- **Side effects — CRITICAL:** a successful PATCH marks the coupon used
  **irreversibly** on the backend BEFORE the PDF is generated. If PDF
  generation then fails, the code is already burned — the hook deliberately
  does not retry the redeem. This is the app's hardest reliability problem;
  see `mint-rewards-coupon-reliability-campaign` before touching.

### 17. POST /api/auth/google — app/login.tsx ~L336, app/register.tsx ~L50

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

### 18. POST /api/auth/apple — app/login.tsx ~L411, app/register.tsx ~L119

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

### 19. POST /api/logs — `sendLog` (utils/logger.ts ~L97)

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
| my-profile, update-profile, verify-otp, set-password, active-campaigns, /api/brands | `data.message` only |
| referrals, my-discounts GET, coupons redeem | `data.error` only |
| my-discounts PATCH | none (returns null silently) |
| my-discounts PUT, reset-password, /api/logs | none (response body ignored) |
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
# Public endpoint should be 200:
curl -s -o /dev/null -w "%{http_code}\n" https://mint-rewards-backend.vercel.app/api/brands
# Authenticated endpoints should be 401 without a token:
for ep in /api/users/my-profile /api/users/my-discounts /api/users/active-campaigns; do
  curl -s -o /dev/null -w "$ep -> %{http_code}\n" "https://mint-rewards-backend.vercel.app$ep"; done
```

Expected (observed 2026-07-08): brands 200; the three user endpoints 401.
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
