---
name: mint-rewards-failure-archaeology
description: >
  Chronicle of every significant investigation, dead end, rejected approach, and
  near-revert in the Mint Rewards client repo. Consult BEFORE re-attempting any
  previously-tried approach: Google Sign-In via expo-auth-session (abandoned),
  markDiscountUsed (orphaned), .env.local secret leak (scrubbed but recoverable),
  editing android/ or ios/ directories (void — prebuild-generated), the
  MaintenanceBanner (dormant), the stalled CI/CD branch, the unmerged dependabot
  Expo bump on dev, and the Apple fullName caching trap. Triggers: "why is this
  commented out", "did we already try", "restore/resurrect/revive", "revert",
  "old approach", "dead code", "history of", "who calls markDiscountUsed",
  "expo-auth-session", "auth.expo.io", ".env.local", "maintenance banner",
  "CI pipeline", "dependabot", "app-v3", "fullName is null".
---

# Mint Rewards — Failure Archaeology

Every entry below is a settled (or explicitly open) battle from this repo's git
history. Each was verified by reading the actual commit diffs on 2026-07-08.
**Do not re-fight a settled battle.** If you are about to try something, search
this file first; if your idea appears under a "Rule" as forbidden, stop and
consult `mint-rewards-change-control` before proceeding.

Jargon used once, defined once:

- **CNG / prebuild**: Expo's Continuous Native Generation — `android/` and
  `ios/` are generated from `app.json` by `npx expo prebuild` and are NOT
  source of truth.
- **RAW token**: this app sends `Authorization: <token>` with no `Bearer `
  prefix (see `mint-rewards-backend-api-contract`).

Entries are ordered by importance to the owner's stated priorities: coupon
reliability first, Google Sign-In second, then everything else.

---

## 1. Coupon used-state saga: markDiscountUsed removed "for now", feature rebuilt around PATCH redeem

**Symptom/Trigger.** Copying a discount code marked the coupon used
client-side via `markDiscountUsed`; behavior was pulled, then the whole
"use a coupon" concept was rebuilt three weeks later as a PDF download flow.
Coupons are single-use: any bug here burns a user's coupon permanently. The
owner names this the hardest live problem in the app.

**Timeline (all diffs read).**

| Commit | Date | What actually changed |
|---|---|---|
| `a5b7c30` "removed markDiscountUsed for now" | 2026-04-30 | In `app/discounts.tsx` `handleCopy`, the line `if (modal.item) await markDiscountUsed(modal.item._id);` was commented out. The store function itself was NOT removed. |
| `81f9488` "PDF download successful" | 2026-05-18 | New `hooks/useCouponDownload.ts` (472 lines) + `components/ConfirmationModal.tsx`; `app/discounts.tsx` rewritten around download. |
| `131edbb` "updated coupon cards to use same logic as discunts page" | 2026-05-18 | `app/redeem.tsx` rewritten to share the discounts-page logic. |
| `ba4983a` "updated downloading message" | 2026-05-18 | Copy tweaks in both screens. |
| `bd2178c` "redeem page used-coupon fix" | 2026-05-18 | `app/redeem.tsx`: added `isUsedByUser` (checks `campaign.users?.includes(user._id)`), disabled used cards, "Used" badge, "already downloaded" box replacing the Download button, and `await getBrandsWithCampaigns()` refresh after a successful download. Also fixed a `useEffect` that ran with an empty deps array before `brandsWithCampaigns` had loaded (false "Invalid brand" alert). |
| `16cd4a5` (long descriptive message) | 2026-05-18 | Milestone marker only — the diff touches ONLY `.expo/devices.json`. The message describes the feature; the code landed in the commits above. |

**Root cause of the ordering hazard (current code, as of 2026-07-08).**
`hooks/useCouponDownload.ts` `downloadCoupon()` does, in order:
Step 1 — `PATCH ${API_BASE_URL}/api/coupons/${couponId}/redeem` (RAW token),
which marks the coupon used on the backend and returns `couponCode` +
`referenceCode`. Step 2 — `Print.printToFileAsync` + `Sharing.shareAsync`.
If Step 2 throws, the code deliberately does NOT retry the redeem (comment at
~line 455: "Coupon is already marked used at this point — do not retry the
redeem call") and shows the user "Your coupon was marked as used but the PDF
could not be created. Screenshot your code as a backup." A PDF failure after a
successful redeem burns the coupon. This is the live reliability frontier —
see `mint-rewards-coupon-reliability-campaign`.

**Orphan alert.** `markDiscountUsed` still EXISTS in `store/store.ts`
(interface ~line 205, implementation ~line 915; `PUT /api/users/my-discounts`
with `{ discountId }`, sets `isAvailed: true` locally). Grep on 2026-07-08
finds ZERO callers anywhere in `app/`, `components/`, or `hooks/`. It is dead
code from the pre-download era, superseded by the PATCH
`/api/coupons/:id/redeem` flow.

**Status.** Settled architecture (PATCH redeem + `campaign.users` membership
is the used-state source of truth); OPEN reliability problem (redeem-before-PDF
ordering). `markDiscountUsed`: orphaned, uncalled.

**Rule for future sessions.**
- Do NOT wire `markDiscountUsed` back into any screen. If used-state logic
  changes, change it in `useCouponDownload.ts` / the PATCH redeem flow, via
  `mint-rewards-change-control`.
- Never reorder the flow to "generate PDF first, then redeem" or add redeem
  retries without backend coordination — the redeem endpoint is not known to
  be idempotent (backend is a separate repo; see
  `mint-rewards-backend-api-contract`).
- `campaign.users` array membership = "used by this user". Do not invent a
  parallel client-side used flag.

---

## 2. Google OAuth via expo-auth-session — ABANDONED (do not resurrect)

**Symptom/Trigger.** The top ~40 lines of `utils/googleAuth.ts` are a
commented-out fossil: an `expo-auth-session` `useAuthRequest` hook against
Google's OAuth endpoints. The owner names Google Sign-In setup one of the two
costliest failures in the project.

**Timeline (all diffs read; all on 2026-05-09, a single day).**

| Commit | Time | What actually changed |
|---|---|---|
| `34786ba` "added Sign in with Google button" | 13:08 | Created `utils/googleAuth.ts` using `expo-auth-session`: `makeRedirectUri({ scheme: 'mint-rewards', path: 'auth' })`, `usePKCE: true`, response type Code. |
| `3e166a2` "fixed Google logo styling" | 13:55 | Login UI only. |
| `2a8b134` "Sign in w Google works" | 18:48 | The pivot. The entire expo-auth-session implementation commented out — the fossil preserves TWO failed redirect strategies stacked in comments: first the custom-scheme `makeRedirectUri` (doubly commented), then a hardcoded `https://auth.expo.io/@mint-rewards/mint-rewards` proxy URI with `usePKCE: false` and a different client ID. Replaced wholesale with `@react-native-google-signin/google-signin` (`GoogleSignin.configure` with `iosClientId` + `webClientId`, `signInWithGoogle`, `signOutGoogle`). Also touched `eas.json` and `app.json` — native sign-in requires a development build, not Expo Go. |
| `d73ef9e` "Signup w Google works" | 20:50 | `app/register.tsx` rewritten (627 lines changed) to use the same native flow; `store/store.ts` adjusted. |

**Root cause of abandonment — INFERENCE, labeled as such.** The fossil shows
an escalating fight with redirect URIs: custom scheme with PKCE → auth.expo.io
proxy with PKCE disabled → give up. This is the classic expo-auth-session
failure mode of that era (Google rejecting the redirect URI / the deprecated
auth.expo.io proxy path). No commit message or comment states the exact error,
so the precise failure is UNVERIFIED; what IS verified is that both
expo-auth-session variants were tried and both were abandoned within ~6 hours
for the native module, which then shipped.

**Later hardening (verified).** `81f9488` wrapped the
`@react-native-google-signin` require in a try/catch loaded lazily, so a
missing native binary warns ("rebuild the app with `cd ios && pod install &&
cd .. && npx expo run:ios`") instead of crashing the whole app at module
evaluation. `45013c5` (2026-06-09) fixed Google/Apple button visibility on
smaller screens in `app/login.tsx`.

**Status.** Settled. Native `@react-native-google-signin/google-signin` is the
adopted path (dev-build only). The fossil is kept deliberately as a warning.

**Rule for future sessions.** Do NOT resurrect expo-auth-session for Google
sign-in, do not delete the fossil comment block without owner sign-off, and do
not "clean up" the lazy require guard — it is load-bearing for Expo Go /
missing-native-module survival. Client IDs live in code (`utils/googleAuth.ts`)
— changing them is a change-control matter (see
`mint-rewards-auth-and-identity`).

---

## 3. Apple fullName loss — cached in SecureStore (a2bedd0)

**Symptom/Trigger.** Users signing in with Apple after their first-ever
sign-in arrived with no name: Apple sends `fullName` ONLY on the very first
authorization for an Apple ID + app pair. Every later `credential.fullName`
has null `givenName`/`familyName`, and the backend was being sent nulls.

**Root cause.** Apple platform behavior, not a bug in this repo. The client
must capture the name the one time it is offered.

**Evidence.** `a2bedd0` "fullName is cached" (2026-06-09, diff read):
identical logic added to `handleAppleSignIn` in `app/login.tsx` and
`handleAppleSignUp` in `app/register.tsx` — if `credential.fullName` has a
given or family name, `SecureStore.setItemAsync('appleFullName_' +
credential.user, JSON.stringify(credential.fullName))`; if it is empty, read
the cache and send the cached value to `POST /api/auth/apple`.

**Known traps (label honestly).**
- The same caching block is duplicated in two files; fix bugs in BOTH.
- If the app is uninstalled, whether the SecureStore/keychain entry survives
  reinstall is platform-dependent — UNVERIFIED here. Worst case: user
  uninstalls, reinstalls, signs in with Apple → no fullName from Apple, no
  cache → backend receives null name. Recovery requires the user to revoke the
  app in Apple ID settings (Settings → Apple ID → Sign-In & Security → Sign in
  with Apple) to force a "first" sign-in again — UNVERIFIED end-to-end, it is
  the standard Apple remediation.
- Nothing client-side can regenerate a lost name; treat the backend's stored
  name as the durable copy.

**Status.** Settled (workaround shipped); uninstall edge case open/unverified.

**Rule for future sessions.** Never remove the caching block "because
credential.fullName exists in the type". Any refactor of Apple auth must keep
cache-write-then-fallback-read semantics and the `appleFullName_<user>` key
format (existing users' caches depend on it).

---

## 4. The .env.local leak and scrub — value still recoverable from history

**Symptom/Trigger.** A real incident the owner names as the origin of the
"no secrets in git" non-negotiable: `.env.local` was committed, edited across
several commits, then deleted — but git history preserves everything.

**Timeline (all diffs read; values redacted here deliberately).**

| Commit | What actually changed |
|---|---|
| `7da7742` "env local" (2026-04-29, feature/discounts_page branch) | Added `.env.local` to `.gitignore` — the right move, but on a side branch. |
| `cee0f19` "env local" (2026-04-30, other lineage) | Committed the `.env.local` FILE itself: one line, a commented-out `# EXPO_PUBLIC_API_URL=<value>`. |
| `154a29f` "added campaignDetails to discounts page" | Un-commented it: live `EXPO_PUBLIC_API_URL=<value>` in git. |
| `765bf15` "updated .env.local" | Re-commented the line (value still present in the blob). |
| `164fdcb` "remove .env.local" | Deleted the file; also fixed a mangled `.gitignore` line (`.env.local.env.local` → `.env.local`). |
| `be7ec79` / `e399a96` "updated igitignore" | Branch-merge cleanup of the `.gitignore` entries. |

**What leaked.** Exactly one key: `EXPO_PUBLIC_API_URL` — a backend API base
URL (an endpoint, not a credential). No API keys, tokens, or passwords appear
in any `.env.local` blob in history (verified by reading every diff that
touched the file).

**The residue — state plainly.** Deleting a file does not scrub it. As of
2026-07-08 the value is one command away for anyone with repo access:
`git show 154a29f:.env.local`. The exposure is permanent in this history
unless history is rewritten; for a URL the practical fix is rotation/migration
of the endpoint if it was ever meant to be private. Rotation status: UNKNOWN.

**Related standing exposure (discovered in sweep).** `3a87f39` "Maps Platform
API Key (Android)" (2026-05-08) committed a Google Maps Android API key into
`app.json` under `android.config.googleMaps.apiKey`, and that key is STILL in
`app.json` on main (as of 2026-07-08). Maps Android keys ship inside the APK
regardless, so committing one is common practice — but it must be
application-restricted (package `com.mintrewards.appp` + signing SHA-1) in the
Google Cloud console. Restriction status: UNVERIFIED (console-side, outside
this repo).

**Status.** Scrub: done. Historical recoverability: open, known exposure.
Maps key restriction: unverified.

**Rule for future sessions.** `.env` / `.env.local` are gitignored and must
stay untracked — never `git add -f` them, never paste their contents into
committed files, commit messages, or skills. If a genuinely secret value ever
lands in a commit (even one you immediately amend away locally is fine, but
anything PUSHED), the fix is rotation, not deletion. When citing this
incident, describe keys, never values.

---

## 5. android/ and ios/ went from committed to gitignored — CNG adoption (fe5294d)

**Symptom/Trigger.** Older commits contain `android/` and `ios/` trees; the
working tree may still have them locally, but git does not track them.

**Root cause.** Deliberate adoption of Expo prebuild/CNG: native projects are
generated artifacts, not source.

**Evidence.** `fe5294d` "ignore generated native directories and .expo"
(2026-05-18, diff read): appended `.expo`, `android`, `ios` to `.gitignore`.

**Status.** Settled.

**Rule for future sessions.** Any advice (from old commits, old docs, or
model priors) to hand-edit `android/app/src/main/AndroidManifest.xml`,
`ios/**/Info.plist`, Gradle files, or the Podfile is VOID — edits there are
lost on the next `npx expo prebuild --clean`. Native configuration goes in
`app.json` (plugins, `android.config`, `ios` keys) — see
`mint-rewards-build-and-env`. The one nuance: locally-present `android/`/`ios/`
dirs are stale caches; regenerate rather than trust them.

---

## 6. MaintenanceBanner — dormant, kept for reuse (3f9680c)

**Symptom/Trigger.** `components/ui/MaintenanceBanner.tsx` exists but nothing
renders it; `app/(tabs)/_layout.tsx` still imports it and contains
`{/* <MaintenanceBanner /> */}` (line ~14, as of 2026-07-08).

**Root cause.** The app initially shipped pointing at no live backend and
showed a maintenance banner; `3f9680c` "removed maintainence banner and
connected backend" (2026-04-16, diff read — a one-line change commenting out
the JSX) disabled it when the backend went live. Component and import were
intentionally left in place.

**Status.** Dormant feature, kept for reuse.

**Rule for future sessions.** Do not delete the component or the import as
"dead code" cleanup. To take the app into maintenance mode, un-comment the
one line in `app/(tabs)/_layout.tsx`. A remotely-controlled flag would be
better; that is `mint-rewards-config-and-flags` territory.

---

## 7. Stalled CI/CD branch — test/verify-cicd-pipeline, never merged

**Symptom/Trigger.** Main has zero tests and zero CI (as of 2026-07-08).
A complete pipeline exists on the unmerged branch `test/verify-cicd-pipeline`.

**Evidence (branch inspected with `git show test/verify-cicd-pipeline:<path>`
and `git diff main...test/verify-cicd-pipeline --stat`).**
- `86832d6` "test: verify full CI/CD pipeline" (2026-06-14): adds
  `.github/workflows/mobile-ci.yml` (npm ci → `npm audit --audit-level=high` →
  `npm run typecheck` → `npm test`; plus a `build-internal` job on dev pushes
  running `eas build --profile internal --platform all` with
  `secrets.EXPO_TOKEN`), `.github/workflows/codeql.yml`,
  `.github/dependabot.yml`, an issue template, `__tests__/LoginScreen.test.tsx`
  (2 render tests: Login button, Google button), jest + typecheck script in
  `package.json`, and — notably — deletes a 281-line commented-out dead legacy
  login block from the top of `app/login.tsx`.
- `f575df6` "npm test now passes (2/2), and npm run typecheck is clean".
- `d93eea2` (remote branch tip) merges dev into the branch — so origin's copy
  also carries the dependabot Expo bump (entry 8). The LOCAL
  `test/verify-cicd-pipeline` is 3 commits behind origin.

**Landmines if merged as-is.**
1. The branch ADDS an `internal` profile to `eas.json`; main's `eas.json` has
   only `development`, `simulator`, `preview`, `production`. Cherry-picking the
   workflow without the eas.json change makes `build-internal` fail.
2. Requires an `EXPO_TOKEN` repo secret (existence UNVERIFIED — GitHub-side).
3. Merging the REMOTE branch tip also pulls in the Expo 56 bump (entry 8) —
   a major SDK upgrade smuggled in with "add CI". Merge the local tip
   (`f575df6`) or rebase to avoid that coupling.

**Status.** Open candidate; owner-priority cross-reference:
`mint-rewards-frontier-and-method` (reliability > expansion > engineering
excellence — CI serves reliability).

**Rule for future sessions.** Do not re-author CI from scratch; the work
exists. Do not merge `origin/test/verify-cicd-pipeline` blindly (it drags the
SDK bump). Any merge goes through `mint-rewards-change-control`.

---

## 8. Unmerged dependabot bump on dev — Expo 54 → 56 (MAJOR), not on main

**Symptom/Trigger.** `origin/dev` is ahead of main by exactly two commits;
main and local `dev` both sit at `45013c5`.

**Evidence (diffs read).** `8b25b66` "Bump postcss and expo" (dependabot,
2026-06-13): postcss 8.4.49 → 8.5.15 (indirect) AND **expo 54.0.35 → 56.0.11**
(direct) — updated together because postcss is an ancestor dependency.
`c66e6f0` is the PR #4 merge of that bump into dev. Only `package.json` +
`package-lock.json` change; no code was migrated for SDK 56.

**Root cause of the stall — INFERENCE.** An Expo SDK major bump is not a
dependency patch: it typically requires React Native / config / prebuild
migration and full device retesting, which never happened. No commit states
this; UNVERIFIED as to intent.

**Status.** Open. Main remains on Expo SDK 54 / RN 0.81.5 (as of 2026-07-08).

**Rule for future sessions.** Treat `origin/dev` as CONTAMINATED with an
unvetted major SDK bump: do not fast-forward main from dev, and do not branch
feature work off `origin/dev` expecting main parity. An SDK 56 migration is a
deliberate project (see `expo-react-native-reference` and
`mint-rewards-change-control`), not a dependabot merge.

---

## 9. Profile-completeness gating — the second non-negotiable (2297728, 3129340)

**Symptom/Trigger.** Coupons/discounts are locked until the user has completed
their profile (phone + province + city). The owner declares breaking this
gating a non-negotiable.

**Evidence (diffs read).** Same evening, 2026-05-09, right after Google
sign-up shipped (social sign-ups create accounts with sparse profiles — that
is the causal link): `2297728` "profile fields now mandatory post-signup"
(`app/(tabs)/home.tsx` +72 lines, `app/editProfile.tsx` validation) and
`3129340` "locked coupons/discounts until profile is complete"
(`app/discounts.tsx` +63/-15). Earlier related lesson: `fbf8b1f` "require
typed out address" (2026-04-27) — a map pin alone was insufficient; a typed
street address became mandatory in `app/editProfile.tsx` (`hasLocation &&
hasAddress` gate in home).

**Status.** Settled, protected.

**Rule for future sessions.** Never remove or weaken the completeness checks
in `app/(tabs)/home.tsx`, `app/discounts.tsx`, or `app/editProfile.tsx` — not
even "temporarily for testing" in a commit. Full contract in
`mint-rewards-architecture-contract`.

---

## 10. "transfer" root commit and the "app-v3" name — prehistory outside this repo

**Symptom/Trigger.** `package.json` `"name"` is `"app-v3"`; the repo's first
commit is `143a307` "transfer" (2026-04-15), which lands a COMPLETE, working
app (whole `app/` tree, store, screens) in one commit.

**Root cause.** This repo is the third incarnation of the codebase; versions
1 and 2 lived elsewhere and their history (including why decisions were made
before 2026-04-15) is not recoverable from this repo. Predecessor locations
and content: UNKNOWN, outside repo.

**Status.** Unknown / outside repo.

**Rule for future sessions.** Do not rename the package to "clean it up" —
tooling and EAS config may key off it. Never claim historical knowledge about
code that predates `143a307`; anything already present in that commit has no
archaeological record here.

---

## 11. Small verified lessons from the sweep (kept; trivia skipped)

- **`1109924` "fixed discounts" (2026-04-29, diff read).** One-line crash fix:
  `item.brand.companyName.charAt(0)` → `item.brand.companyName?.charAt(0)
  ?? "?"`. Lesson: backend objects arrive with missing fields; ALWAYS
  optional-chain backend data in render paths. This class of bug (unguarded
  backend field access) has already shipped once.
- **`bd2178c` useEffect lesson (see entry 1).** The redeem screen originally
  resolved the brand in a `useEffect` with `[]` deps, racing the store load
  and alerting "Invalid brand". Lesson: effects that read async store slices
  must depend on them and early-return while empty.
- **Milestone-only commits exist.** `16cd4a5` has a paragraph-length message
  and a 1-line `.expo/devices.json` diff. Lesson: never trust a commit MESSAGE
  as evidence of where code landed — read the diff.
- **`.expo/devices.json` churn.** Pre-`fe5294d` commits are polluted with
  `.expo` noise; ignore it when reading diffs from that era.

---

## When NOT to use this skill

- Making a change today (process, approvals, branch rules) →
  `mint-rewards-change-control`.
- Actively debugging a live symptom → `mint-rewards-debugging-playbook`
  (this skill tells you what was already tried; that one tells you how to
  investigate now).
- Current architecture / invariants as they stand →
  `mint-rewards-architecture-contract`.
- The coupon reliability fix effort going forward →
  `mint-rewards-coupon-reliability-campaign`.
- Endpoint shapes, auth headers, 401 behavior →
  `mint-rewards-backend-api-contract`; sign-in flows as currently built →
  `mint-rewards-auth-and-identity`.
- Building, env vars, EAS profiles → `mint-rewards-build-and-env`; running the
  app → `mint-rewards-run-and-operate`.
- Deciding what to work on next → `mint-rewards-frontier-and-method`.

## Provenance and maintenance

All claims verified against git history and the working tree on 2026-07-08.
Re-verify with (all read-only):

- Full history sweep: `git log --oneline --graph --all`
- Any cited commit's real change: `git show <hash> --stat` then `git show <hash>`
- Google pivot fossil: `sed -n '1,45p' utils/googleAuth.ts` and `git show 2a8b134 -- utils/googleAuth.ts`
- markDiscountUsed orphan check: `grep -rn "markDiscountUsed" app components hooks store`
- Redeem-before-PDF ordering: `grep -n "redeem\|printToFileAsync\|already marked used" hooks/useCouponDownload.ts`
- Leak residue exists: `git log --all --oneline -- .env.local` (do not print blob contents into any committed file)
- Maps key still in app.json: `grep -n "googleMaps" -A2 app.json`
- Native dirs ignored: `git show fe5294d` and `git check-ignore -v android ios .expo`
- Banner dormant: `grep -n "MaintenanceBanner" app/(tabs)/_layout.tsx`
- CI branch delta: `git diff main...test/verify-cicd-pipeline --stat` and `git show test/verify-cicd-pipeline:.github/workflows/mobile-ci.yml`
- Dev contamination: `git log main..origin/dev --oneline` and `git show 8b25b66 --stat`
- Apple fullName cache: `git show a2bedd0`

If any command's output contradicts this file, the repo wins — update the
entry and re-date it.
