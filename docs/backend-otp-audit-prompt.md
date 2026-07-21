# Backend audit prompt — OTP / email-verification contract

Hand this to an agent (or engineer) working **inside the Mint Rewards backend repo**.
It is written to be self-contained: it assumes no access to the client repo.

Generated 2026-07-22 from a client-side audit of `Mint-Rewards-App` branch `dev`.
Tracking issues: [#18](https://github.com/Mint-Rewards/Mint-Rewards-App/issues/18),
[#19](https://github.com/Mint-Rewards/Mint-Rewards-App/issues/19),
[#21](https://github.com/Mint-Rewards/Mint-Rewards-App/issues/21),
[#24](https://github.com/Mint-Rewards/Mint-Rewards-App/issues/24),
[#26](https://github.com/Mint-Rewards/Mint-Rewards-App/issues/26),
[#31](https://github.com/Mint-Rewards/Mint-Rewards-App/issues/31).

---

## Copy everything below this line into the backend session

You are auditing the Mint Rewards **backend** (Next.js API routes, deployed to
Vercel at `https://mint-rewards-backend.vercel.app`).

The Expo/React Native client has shipped an OTP email-verification flow and a
reworked forgot-password flow. Client-side probing says the backend does not
support parts of it. Your job is to **establish ground truth from the backend
source** and answer six questions. This is an audit — **do not change
application behavior**. Produce a report.

### Rules

- **Read the code. Do not infer from route names or from this prompt.** Every
  claim in your report must cite `file:line`.
- Mark every finding **VERIFIED** (you read the handler) or **UNVERIFIED**
  (you could not determine it). Never guess to fill a gap — an explicit
  "couldn't determine" is a valid and useful answer.
- Check the **deployed** branch, not just `main`, and say which commit/branch
  you inspected. If deployed ≠ `main`, that discrepancy is itself a finding.
- Do not run write operations or send real emails against production. Reading
  code and inspecting schema/migrations is enough.

### Client-side evidence you are checking against

Probed 2026-07-22, `POST` with body `{}`, unauthenticated, against the
production host above:

| Endpoint | Status | Content-Type | Body |
|---|---|---|---|
| `/api/users/resend-verification-otp` | 404 | **text/html** | Next.js 404 page |
| `/api/users/verify-email-otp` | 404 | **text/html** | Next.js 404 page |
| `/api/users/verify-otp` | 404 | application/json | `{"error":"You must enter an email."}` |
| `/api/users/reset-password` | 404 | application/json | `{"error":"You must enter an email."}` |
| `/api/users/set-password` | 400 | application/json | `{"error":"You must enter a new password."}` |
| `/api/users/login` | 400 | application/json | `{"error":"You must enter an email."}` |

Control: `POST /api/users/definitely-not-a-real-endpoint-xyz` → `404 text/html`,
the same signature as the first two rows. The inference being tested is that an
**HTML** 404 means no route exists, while a **JSON** 404 means the handler ran
and rejected input.

---

## Q1 — Do the two email-verification endpoints exist? (blocks #31, #18, #19)

Highest priority. Everything else is secondary.

- Does a handler exist for `POST /api/users/resend-verification-otp`?
- Does a handler exist for `POST /api/users/verify-email-otp`?
- If they exist in the repo but not in production, **why** — unmerged branch,
  failed deploy, route in a directory that isn't routable, middleware
  swallowing it, wrong HTTP method?

The client already calls them with this contract. Report whether the backend
matches, or what it does instead:

```jsonc
// POST /api/users/resend-verification-otp
// request
{ "email": "user@example.com" }
// success: HTTP 200. Client reads data.message (optional).
// throttle: HTTP 429 + Retry-After header.

// POST /api/users/verify-email-otp
// request
{ "email": "user@example.com", "otp": "123456" }
// success: HTTP 200 with:
{ "success": true, "token": "<session token>", "message": "..." }
```

On success the client stores `data.token` as the session token and immediately
calls `GET /api/users/my-profile` with it. A 200 whose body lacks
`success: true` is treated as a failure by the client.

## Q2 — What exact string does the session token come back as? (blocks #19)

For **both** `POST /api/users/login` and `POST /api/users/verify-email-otp`
(if it exists), report the literal value of the `token` field:

- Bare JWT (`eyJhbGci...`), or
- Scheme-prefixed (`Bearer eyJhbGci...`)?

Then, separately: **what does the auth middleware accept** on the
`Authorization` header of an authenticated route such as
`GET /api/users/my-profile`? Does it accept a bare token, a `Bearer `-prefixed
one, or both?

Why this matters: the client sends `Authorization: <raw token>` with **no**
`Bearer ` prefix, and stores whatever `token` value it receives verbatim. If
the two endpoints return different shapes, sessions created by email
verification will send a malformed header while sessions created by login work
fine. Please confirm both endpoints agree.

## Q3 — What happens at login for an unverified account? (blocks #18)

- Does `POST /api/users/login` succeed for a user whose email is unverified?
- If it rejects: what status and what exact error body? The client currently
  shows that message in a generic dialog with no route back to the
  verification screen, so the wording matters.
- Does the login response include `emailVerified` on the user object? Is it
  ever absent rather than `false`?

## Q4 — Legacy accounts and `emailVerified` (blocks #18 — read this carefully)

This is the question most likely to cause a production incident, so please be
precise and cite the schema.

The client wants to gate: bounce users to the verification screen when
`emailVerified` is falsy. But it currently reads the field as
`data.user.emailVerified || false`, so a **missing** field is indistinguishable
from an explicit `false`.

- Does the user schema declare `emailVerified`? What is its default?
- **Do user documents created before the OTP feature have the field at all?**
  Run a count if you can: how many users have `emailVerified` missing, `false`,
  and `true`?
- Was there a backfill migration? If not, is one planned, and would it mark
  legacy accounts verified or unverified?
- If legacy accounts cannot be distinguished from genuinely-unverified new
  ones, propose a discriminator the client can use instead (an explicit flag,
  a creation-date cutoff, something else).

**If a naive gate would bounce every pre-existing user to a verification screen
for an account that was never sent a code, say so loudly at the top of your
report.**

## Q5 — Error taxonomy for OTP failures (blocks #21, #26)

The client must distinguish four conditions but currently cannot. It resorts to
guessing from the presence of a `Retry-After` header on a 429 — treating
"429 with the header" as a temporary rate limit and "429 without it" as a
permanent lockout that wipes the input and forces a new code. Any proxy or edge
limiter emitting a bare 429 therefore locks a user out of a code they could
still validly enter.

For each of `verify-otp`, `verify-email-otp`, `reset-password`,
`resend-verification-otp`, `set-password`, report the actual status code, body
shape, and headers for:

1. **Wrong code** — user mistyped.
2. **Expired code** — correct code, past its TTL.
3. **Rate limited** — too many requests, temporary, recoverable.
4. **Attempts exhausted** — too many wrong guesses, requires a brand-new code.

Then answer: is there a **machine-readable discriminator** in the body (e.g. a
stable `code` field), or is the human-readable `error` string the only signal?
If there isn't one, propose the smallest change that adds one.

Also report the **OTP TTL** in seconds, and whether the response exposes it or
an expiry timestamp. The client wants to show a validity countdown (#26) and
currently shows the same "that code didn't work" message for a wrong code and
an expired one.

Note the existing inconsistency worth flagging: some validation failures return
**404** with a JSON body (`verify-otp`, `reset-password`) while others return
**400** (`login`, `set-password`). Is that deliberate?

## Q6 — Server-side throttling of sends (blocks #24)

The client shows a 60-second resend cooldown, but it is component state only —
remounting the screen resets it, and navigating back and forward triggers
another send with a fresh timer.

- Do `reset-password` and `resend-verification-otp` enforce their own
  server-side throttle? Per email, per IP, both?
- What are the actual limits and windows?
- Is `Retry-After` set on every throttled response? (See Q5 — the client's
  lockout classification depends on it.)

If there is **no** server-side throttle, say so plainly. That is an
email-bombing vector, and it means the client's cooldown is providing false
assurance.

---

## Deliverable

A markdown report with:

1. **Headline** — one paragraph: can the client's email-verification flow work
   against this backend today, yes or no?
2. **Q1–Q6**, each answered with `file:line` citations and a
   VERIFIED / UNVERIFIED marker.
3. **Backend changes required**, ordered by what unblocks the most client work,
   each with a proposed request/response shape.
4. **Contract corrections** — anywhere the client's assumptions (as stated
   above) are wrong. The client will be updated to match; it does not need the
   backend to conform to its guesses.
5. **Open questions** you could not resolve from the source.

Do not open PRs or change behavior as part of this audit.