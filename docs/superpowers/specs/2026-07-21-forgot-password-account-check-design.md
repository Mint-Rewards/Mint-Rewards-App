# Forgot-password: check the email is linked to an account

**Date:** 2026-07-21
**Status:** App changes (3, 4) implemented 2026-07-22 on `dev`, unverified —
the `ACCOUNT_NOT_FOUND` path stays dormant until the backend ships. Backend
changes (1, 2) not started.
**Repos:** `Mint-Rewards-App`, `Mint-Rewards-Backend`

## Goal

When someone submits an email on the forgot-password screen that has no account,
tell them so and keep them on the screen, instead of sending them to the OTP
screen to wait for a code that will never arrive.

## Background: why this is a policy change, not a bug fix

`app/api/users/reset-password/route.ts` deliberately hides whether an account
exists. It returns an identical `GENERIC_RESPONSE` on both paths and defers the
email send into `after()` so response timing cannot leak existence either. That
was added in Mint-Rewards-Backend commit `5b6b1df`.

This change reverses that decision for this endpoint. It was made knowingly,
for the following reason.

`app/api/users/signup/route.ts` already discloses account existence: it returns
`409 "This email is already in use."` versus a success, and it has **no rate
limiting at all** — no `checkRateLimit` import, no call. Anyone can enumerate
accounts through signup, unthrottled, faster than through the rate-limited
reset endpoint.

So the marginal security cost of disclosing here is approximately zero: the
information is already free, in bulk, through a less protected endpoint. The
status quo is the worst of both worlds — it pays a UX cost for protection it
does not actually deliver.

The decision is therefore: **treat account existence as non-secret, and make
that policy consistent**, while closing the genuinely unprotected endpoint.

The rejected alternative was preserving anti-enumeration properly: keep reset
generic *and* change signup to stop returning `409`, emailing the existing owner
instead. That is more secure but degrades signup for every honest user, to
protect information of modest value that login also confirms implicitly. It is
only coherent if committed to across every endpoint.

## Backend changes

### 1. `app/api/users/reset-password/route.ts`

Replace the `if (!user)` branch's `GENERIC_RESPONSE` with an explicit failure:

```ts
return Response.json(
  { error: "No account found for that email.", code: "ACCOUNT_NOT_FOUND" },
  { status: 404 },
);
```

Constraints:

- **Rate-limit checks must stay ahead of the existence check.** They already
  are (the IP and per-email checks precede `findOne`). This ordering is now
  load-bearing — it is the only thing throttling the disclosure — so it gets a
  comment saying so explicitly.
- **The `code` field is required, not decorative.** A bare `404` is
  indistinguishable from a missing or misdeployed route. The client keys off
  `code === "ACCOUNT_NOT_FOUND"`.
- **Keep `after()` for the email send.** Its timing-equalization purpose is now
  moot, but it still returns the response without waiting on the mail provider.
  Rewrite the comment above it accordingly — a comment claiming to prevent
  enumeration would be actively misleading.
- `GENERIC_RESPONSE` keeps its role for the resend-throttle branch (the account
  exists and a code was sent within the last minute, so success is truthful),
  but its message becomes `"A reset code has been sent."` and its comment is
  updated. The "if an account exists" hedge is no longer accurate.

### 2. `app/api/users/signup/route.ts`

Add the missing rate limiting, mirroring the pattern already used in
`reset-password` (`checkRateLimit`, `clientIp`, `hashKey`, `rateLimitResponse`),
placed after email-format validation and **before** the `findOne` that produces
the `409`:

- IP: **20 per hour** — generous for shared NAT, offices, and campus networks;
  useless for bulk enumeration.
- Per email (hashed via `hashKey`): **10 per hour** — blocks hammering one known
  address.

Numbers set by the owner on 2026-07-22. The per-IP figure is deliberately on
the generous side: Pakistani mobile carriers run heavy CGNAT, and a campus or
office signup drive is a real acquisition motion for this app, so a
false-positive block costs more than the enumeration it would prevent. Note the
per-IP limit *cannot* distinguish an enumerator from a campus — there is no
signal at the IP layer that does — so this is a choice about which error to
prefer, not a solved problem.

Be honest about what each limit buys. The **per-email limit does nothing against
enumeration** (an enumerator queries each address once); it bounds mailbombing
of one targeted address, at 10/hour. The per-IP limit is the only enumeration
control, and it is weak against anyone renting residential proxies. Price both
as casual-abuse and mail-cost controls, not as a security boundary.

**Signup now sends mail.** Since the OTP work landed, a successful signup
triggers a verification email (`app/register.tsx` routes to `/verify-email`), so
every unthrottled POST is a free outbound send. Protecting the email provider's
cost and sender reputation is a stronger justification for these limits than
enumeration is.

Return `Retry-After` on the 429, as `reset-password` already does — the client
reads it (see change 5).

`checkRateLimit` fails *open* if Mongo is unavailable, by design. That is
acceptable here: signup's hard floor remains the unique-email constraint. Do not
set these numbers as if they were a hard guarantee.

This is worth doing on its own merits, independent of this feature — an
unthrottled account-creation endpoint invites spam accounts, mass mail through
the email provider, and unbounded collection growth.

## App changes

### 3. `store/store.ts` — `forgotPassword`

Handle the 404 **in `forgotPassword` itself, not in the shared
`classifyErrorResponse`.** That helper serves five call sites; teaching it to
read every 404 as "no account" would make a missing or misdeployed route render
as "No account found for that email" — a confidently wrong message, and exactly
the trap that misdirected the earlier OTP investigation.

Before delegating to the helper:

```ts
if (response.status === 404 && data?.code === "ACCOUNT_NOT_FOUND") {
  return {
    Status: "Error",
    ErrorMessage: data.error || "No account found for that email.",
    code: "ACCOUNT_NOT_FOUND",
  };
}
```

A route-missing 404 carries no `code`, so it falls through to the generic path
and surfaces as a plain failure — accurate, and not a lie about the account.

Add `"ACCOUNT_NOT_FOUND"` to the `code` union on `OtpResult`.

### 4. `app/forgot-password.tsx`

Add a branch to `resetPasswordPressed` ahead of the generic `else`. It must
**not** navigate to `/otp-screen`:

```ts
} else if (result.code === "ACCOUNT_NOT_FOUND") {
  Alert.alert("No account found", `We couldn't find an account for ${trimmedEmail}.`, [
    { text: "Try again", style: "cancel" },
    { text: "Create account", onPress: () => router.replace("/register") },
  ]);
}
```

Requires importing `Alert` from `react-native`; the screen currently uses only
the single-button `Constants.showDialog`, which cannot offer the register path.

Update the header copy. It currently describes the anti-enumeration behaviour
being removed, and would contradict the new error:

> Enter your email address and we'll send you a code to reset your password.

Note: as of writing, `app/forgot-password.tsx` on `dev` has an uncommitted edit
setting this line to the "If the email exists in the database" wording. This
change replaces that line either way.

### 5. `store/store.ts` `signUp` + `app/register.tsx` — surface the 429

Signup's rate limiting is new, so the client had no 429 path: `signUp` collapsed
every failure to `data.error || data.message` and the register screen showed it
raw, with no wait time.

`signUp` now handles 429 explicitly and returns `code: "RATE_LIMITED"` plus
`retryAfterSeconds` (defaulting to 3600 when the header is absent, matching the
hourly window). Its declared return type gains `code` and `retryAfterSeconds`.

Handled **explicitly rather than by delegating to `classifyErrorResponse`** —
the same reasoning as change 3. That helper maps 401 to "invalid or expired
reset session", which is meaningless on signup, and its 409 path would be a
coincidence rather than a decision.

`app/register.tsx` renders the wait **in minutes**, not via `formatCountdown`:
that helper emits `m:ss`, so an hour-scale wait renders as "60:00", which reads
as malformed. The OTP screens keep using it — their waits are ~60s.

## Verification

Neither repo has a test framework, so verification is manual.

Backend, against the dev preview deployment after pushing:

- Unknown email → `404`, body contains `code: "ACCOUNT_NOT_FOUND"`.
- Known email → `200`, code arrives.
- 11th signup attempt for one email within an hour → `429` with `Retry-After`.
- 21st signup from one IP within an hour → `429` with `Retry-After`.

App, on the simulator:

- Typo'd email → stays on the forgot-password screen, offers registration.
- Real account → reaches the OTP screen and the code arrives.
- Signup past the per-email limit → dialog states the wait in minutes, and the
  screen does not advance to `/verify-email`.

## Out of scope

- `redeem.tsx` still calls the admin-gated `/api/brands` and will 401 →
  sign-out on tap. Unrelated pre-existing bug; will look like a regression
  during QA of this work.
- The client-side brand→campaign join in `getBrandsWithCampaigns`, agreed
  separately and still pending.
