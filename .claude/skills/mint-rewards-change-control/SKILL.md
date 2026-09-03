---
name: mint-rewards-change-control
description: Load BEFORE making, reviewing, or merging any change to the Mint Rewards app. Defines how changes are classified (docs-only, JS/TS-only, native-affecting, backend-contract-affecting, release-affecting), which gates each class must pass, the project's four non-negotiable rules with the historical incidents behind them, and what needs explicit owner sign-off. Triggers: "can I change/edit/add X", "is this safe to merge", "do I need a rebuild", "should I commit this", "who approves", "bump version", "edit app.config.js", "add a package", "touch the redeem flow", "commit the .env".
---

# Mint Rewards Change Control

How changes are classified, gated, and reviewed in this repo. This is the client-only Expo app for the Mint Rewards waste-collection rewards program; the backend is a **separate repo** (hosted at https://mint-rewards-backend.vercel.app) that this repo cannot change.

**Definitions used throughout** (defined once, used everywhere):

- **Expo Go** — Expo's pre-built sandbox app from the app stores. Runs JS/TS-only changes instantly but contains only a fixed set of native modules. Anything needing custom native code will crash or no-op in it.
- **Prebuild** — `npx expo prebuild`: Expo generates the `android/` and `ios/` native projects from `app.config.js`. In this repo those directories are **gitignored and disposable** (commit `fe5294d`).
- **Dev build (development build)** — a custom-compiled binary of THIS app (via `npx expo run:ios`, `npx expo run:android`, or EAS with `developmentClient: true`) that includes the project's native modules. Required to test native-affecting changes.
- **EAS** — Expo Application Services, the cloud build/submit service configured in `eas.json`.

## Change classification — find your row before doing anything

| Class | Examples | Required steps before merge |
|---|---|---|
| **1. Docs / skills only** | `.claude/skills/**`, README, comments-only edits | Verify claims against the repo (ground truth). No build or typecheck strictly required, but `npx tsc --noEmit` is cheap insurance if any `.ts` file was touched. |
| **2. JS/TS only (no native impact)** | Screens in `app/`, `hooks/`, `store/store.ts`, `utils/`, `components/`, styles | `npx tsc --noEmit` clean + `npx expo lint` at-or-below baseline (see "Review discipline") + manual verification of the touched flow per **mint-rewards-validation-and-qa**. Testable in Expo Go or a dev build via `npx expo start`. |
| **3. Native-affecting** | Any `app.config.js` edit under `plugins`, `ios`, `android` (permissions, keys, URL schemes); adding/upgrading an npm package that ships native code (most `expo-*` and `react-native-*` packages) | Everything in class 2, **plus a rebuild**: `npx expo run:ios` and/or `npx expo run:android` (or an EAS `development` build). **Cannot be tested in Expo Go** — Expo Go's binary is fixed. Never hand-edit `android/` or `ios/` (non-negotiable 3). Cross-ref **expo-react-native-reference** and **mint-rewards-build-and-env**. |
| **4. Backend-contract-affecting** | New/changed API calls, changed request/response shapes, auth header changes, new endpoints the client expects | This repo **cannot** change the backend. Confirm the endpoint exists and behaves as expected against **mint-rewards-backend-api-contract** first; coordinate any server change with the backend repo owner BEFORE writing client code that depends on it. Then class 2 (or 3) steps as applicable. |
| **5. Release-affecting** | `app.config.js` `version` / `ios.buildNumber`, anything in `eas.json`, store submission config | Owner sign-off required. See "Versioning" below and **mint-rewards-release-and-positioning**. |

A change can be in multiple classes at once (e.g. a new coupon endpoint consumed via a new native PDF package = classes 3 + 4). Apply the union of the gates.

## Branch and merge conventions

**Observed reality in history (as of 2026-09-03):**

- `main` is the default branch. `dev` and `test/verify-cicd-pipeline` also exist (local and on origin).
- Feature branches were used and merged via merge commits: `f6908f8` "Merge branch 'feature/location'", `ac8bcba` "Merge branch 'feature/discounts_page'", and one Dependabot PR merge `c66e6f0`.
- **The dominant observed norm is small direct commits straight to `main`** (see `git log --oneline -30`).
- `test/verify-cicd-pipeline` holds an unmerged GitHub Actions pipeline (`.github/workflows/mobile-ci.yml`, `codeql.yml`, Dependabot config) plus `"test": "jest"` and `"typecheck": "tsc --noEmit"` scripts. This is a **candidate, not adopted** — main has no CI and no tests.

**Recommendation (labeled as such, not observed practice):** for class 3, 4, or 5 changes, or anything touching the coupon redeem flow, branch first (`feature/<topic>` matches the existing naming) and merge only after the gates pass. Direct-to-main is tolerable for class 1–2 changes that pass typecheck and lint.

## The non-negotiables

Each rule below is a standing owner decision backed by a real incident. Do not route around them; if a task appears to require breaking one, stop and get explicit owner approval.

### 1. No secrets in git — `.env` stays untracked

**Rule:** never commit `.env`, `.env.local`, or any credential/key/URL-with-token. `.env` is gitignored today — verify with `git check-ignore .env` (must print `.env`, exit 0). Current `.env` holds `APP_VARIANT`, `EXPO_PUBLIC_API_URL`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID`, `ANDROID_GOOGLE_MAPS_API_KEY`, `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST` (as of 2026-09-03); `.env.local` holds `SENTRY_AUTH_TOKEN`. Never echo their values into logs, commits, or skills. `.env.example` documents every key by name.

**Why:** anything committed is in history forever unless history is rewritten; scrubbing costs a multi-commit cleanup and (for real credentials) rotation.

**Incident (2026-04-30):** `.env.local` was actually committed and then scrubbed across five commits — `cee0f19` "env local" (added `.env.local`), `765bf15` "updated .env.local", `164fdcb` "remove .env.local" (+ gitignore fix), `be7ec79` and `e399a96` "updated igitignore" (gitignore churn finishing the cleanup). Mine it yourself: `git log --oneline --all -- .env.local .env`. **Escalation (found 2026-09-03):** `cee0f19` added a `.env.local` containing a real `SENTRY_AUTH_TOKEN`. It is gitignored at HEAD but remains recoverable from history by anyone with repo access. **That token needs rotating in Sentry** — see `docs/HANDOFF.md` §12. This is a live credential exposure, not just a process failure.

**Former legacy exception — now RESOLVED (2026-09-03).** `android.config.googleMaps.apiKey` used to hold a live Google Maps key in a tracked file (added `3a87f39`, 2026-05-08). It now reads `env.androidGoogleMapsApiKey`, sourced from `ANDROID_GOOGLE_MAPS_API_KEY` and documented in `.env.example`. **There is no longer any standing exception to this rule — do not add a key, token, or secret to any tracked file.**

### 2. Profile-completeness gating is a business rule

**Rule:** coupons/discounts stay locked until the user has phone + province + city set. The gate is the expression
`!!(user?.phone?.trim() && user?.province?.trim() && user?.city?.trim())`
now lives as a single shared `isProfileComplete` in `utils/profile.ts`, called from `app/(tabs)/home.tsx` and `app/(tabs)/deals.tsx`. **The old duplication was resolved — keep it that way.** The gate has since widened: it also covers the saved coordinate and house number (street address was dropped by owner ruling). Read `utils/profile.ts` for the current expression rather than trusting any inlined copy. **Any change that weakens, bypasses, or narrows this gate needs explicit owner approval** — it is a business rule, not a UX preference.

**Evidence:** introduced deliberately in `2297728` "profile fields now mandatory post-signup" and `3129340` "locked coupons/discounts until profile is complete" (both 2026-05-09).

### 3. Never hand-edit `android/` or `ios/`

**Rule:** the native directories are gitignored (`git check-ignore android ios` confirms) and regenerated by prebuild; all native configuration flows through `app.config.js` (plugins, permissions, bundle IDs, keys). Any edit made directly inside `android/` or `ios/` is invisible to git and destroyed on the next prebuild.

**Evidence:** `fe5294d` (2026-05-18) "ignore generated native directories and .expo". Immutable identifiers living in `app.config.js`: Android package `com.mintrewards.appp` (triple p — shipped, immutable), iOS bundle `com.mintrewards.app`. See **expo-react-native-reference** for the full prebuild model.

### 4. The coupon redeem flow is the highest-risk area

**Rule:** `hooks/useCouponDownload.ts` and `app/(tabs)/redeem.tsx` get the strictest treatment in the repo. The flow, verified in code (2026-09-03): Step 1 calls `useAppStore.getState().redeemDeal(dealId)` — i.e. `POST /api/users/deals/:dealId/redeem`, which **claims the code on the backend** (the old `PATCH /api/coupons/:id/redeem` is gone) — THEN Step 2 generates the PDF with `expo-print`'s `printToFileAsync`. A PDF failure after a successful redeem **burns the coupon** — the code explicitly says "Coupon is already marked used at this point — do not retry the redeem call" and alerts the user to screenshot the code. This ordering is the project's hardest live reliability problem.

**Requirements for any change here:** follow **mint-rewards-coupon-reliability-campaign** for the design constraints, and validate per **mint-rewards-validation-and-qa** on a real dev build (the hook dynamically imports `expo-print`/`expo-sharing`, which do not exist in Expo Go). Owner sign-off before merge.

**Evidence of past pain:** `a5b7c30` (2026-04-30) "removed markDiscountUsed for now" — the used-state feature was ripped out under pressure and later rebuilt around the redeem endpoint (`bd2178c` "redeem page used-coupon fix", `16cd4a5` coupon download feature).

## Review discipline

There is a real test suite now, but still **no CI** — nothing runs automatically on a PR.
The pre-merge gate is therefore manual and mandatory:

1. **Typecheck:** `npx tsc --noEmit` — must exit 0.
   **Verified baseline (2026-09-03, commit `f8d8551`): typechecks clean — zero errors, exit code 0.** So any tsc error you see was introduced by your change. (Note: `node_modules/` may be absent on a fresh clone; run `npm ci` first, or `npx tsc` resolves to a placeholder package and prints "This is not the tsc command you are looking for".)
2. **Tests:** `npm test`.
   **Verified baseline (2026-09-03, commit `f8d8551`): 44 suites, 728 tests, all passing.** A failing test is a blocker.
3. **Lint:** `npm run lint`.
   **Verified baseline (2026-09-03, commit `f8d8551`): exits 1 with 29 problems — 10 errors and 19 warnings**, concentrated in `components/location/` (`react-hooks/exhaustive-deps`, `react-hooks/immutability`). The honest gate is: **no NEW errors or warnings relative to this baseline**, not "exit 0". Some of these are deliberate; do not mass-fix them as a side quest.
4. **Manual flow verification:** exercise the actual touched flow on a device/simulator per the checklist in **mint-rewards-validation-and-qa**. Typecheck + lint prove almost nothing about runtime behavior in this codebase.
5. For class 3: rebuild and re-verify on the rebuilt binary, both platforms if the change touches platform config for both.

`package.json` now provides `test` (jest) and `lint` (expo lint). There is still no `typecheck` script — use `npx tsc --noEmit`. And there is still no CI: the `test/verify-cicd-pipeline` work was never merged and `.github/` does not exist.

## Versioning — who bumps what

(As of 2026-09-03.) Cross-ref **mint-rewards-release-and-positioning** for the release process itself.

- `app.config.js`: `version: "2.2.1"`. There is **no** `ios.buildNumber` and **no** `android.versionCode` anywhere in the repo — verified by resolving the config, which reports both as `null`.
- `eas.json`: `cli.appVersionSource: "remote"` + `autoIncrement: true` on `preview`, `production` and `testflight-preview`. EAS owns both counters server-side and advances them per build. Read them with `npx eas-cli build:version:get --platform ios|android`.
- **`runtimeVersion` policy is `appVersion`.** This makes the version bump safety-critical, not cosmetic: a native change shipped without bumping `version` can be OTA'd onto an incompatible binary and crash it. See `docs/HANDOFF.md` §7.
- **Who:** `version` bumps and any `eas.json` edit are class 5 — owner decision, owner sign-off. Sessions do not bump versions autonomously. Historical precedent: version bumps are their own commits ("updated version", "dada322 updated app version").

## Owner sign-off vs autonomous

**A session may do autonomously** (still passing the class gates above):
- Class 1 docs/skills work inside `.claude/skills/`.
- Class 2 JS/TS bugfixes and UI changes that do not touch the four non-negotiable areas, verified per the review discipline.
- Read-only investigation of anything (git history, code, `npx tsc --noEmit`, `npx expo lint`).

**Explicit owner sign-off required BEFORE merge:**
- Anything weakening profile-completeness gating (non-negotiable 2).
- Any change to `hooks/useCouponDownload.ts` / `app/redeem.tsx` redeem semantics (non-negotiable 4).
- Class 3 native-affecting changes (new native packages, `app.config.js` plugin/permission/key changes).
- Class 4 anything requiring a backend change (owner coordinates the backend repo).
- Class 5 releases: version bumps, `eas.json`, store submission.
- Adding any tracked-file key/secret (answer is no; see non-negotiable 1).
- Adopting the CI pipeline from `test/verify-cicd-pipeline` (candidate, needs owner decision).

Owner priority ranking when trade-offs arise: **bulletproof reliability > product expansion > engineering excellence** (owner statement, 2026-07-07).

## When NOT to use this skill

- Debugging a live failure or crash → **mint-rewards-debugging-playbook**.
- "Why is the code this way / what broke before" archaeology beyond the incidents above → **mint-rewards-failure-archaeology**.
- What the architecture/contract IS (routing, store slices, layer rules) → **mint-rewards-architecture-contract**.
- API endpoint shapes, auth header format (raw token, no "Bearer " prefix) → **mint-rewards-backend-api-contract** and **mint-rewards-auth-and-identity**.
- How to actually build, run, or configure environments → **mint-rewards-build-and-env**, **mint-rewards-run-and-operate**, **mint-rewards-config-and-flags**.
- The concrete manual test checklist this skill mandates → **mint-rewards-validation-and-qa**.
- Designing the coupon-reliability fix itself → **mint-rewards-coupon-reliability-campaign**.
- Cutting/positioning a release once approved → **mint-rewards-release-and-positioning**.
- General Expo/RN concepts (prebuild mechanics, Expo Go vs dev build) → **expo-react-native-reference**.

## Provenance and maintenance

Every drift-prone fact above, with its re-verification command (all read-only):

| Fact | Re-verify with |
|---|---|
| `.env` is gitignored | `git check-ignore .env` (prints `.env`, exit 0) |
| `.env.local` incident commits | `git log --oneline --all -- .env.local .env` |
| Gitignore covers `android`/`ios` | `git check-ignore android ios` and `git show fe5294d --stat` |
| Maps key now env-sourced (exception closed) | `grep -A3 googleMaps app.config.js` (expect `env.androidGoogleMapsApiKey`, not a literal) |
| Sentry token still in history | `git show cee0f19 -- .env.local` |
| Profile gate expression + call sites | `grep -rn "isProfileComplete" utils/profile.ts app/` |
| Gating incident commits | `git show 2297728 --stat && git show 3129340 --stat` |
| Redeem-before-PDF ordering | `grep -n "redeem\|printToFileAsync\|already marked used" hooks/useCouponDownload.ts` |
| markDiscountUsed fully gone | `grep -rn markDiscountUsed store/ app/ hooks/` (expect no hits) |
| Typecheck baseline (clean, exit 0) | `npm ci && npx tsc --noEmit; echo $?` |
| Test baseline (44 suites / 728 tests) | `npm test` |
| Lint baseline (exit 1; 10 errors, 19 warnings) | `npm run lint; echo $?` |
| Scripts (test + lint exist; no typecheck) | `python3 -c "import json;print(json.load(open('package.json'))['scripts'])"` |
| Still no CI | `ls .github` (expect: no such directory) |
| Branch/merge norms | `git branch -a && git log --oneline --merges --all` |
| version / bundle IDs / no buildNumber | `npx expo config --type public --json` — read `version`, `runtimeVersion`, `ios.bundleIdentifier`, `android.package`; `ios.buildNumber` and `android.versionCode` must be `null` |
| eas.json autoIncrement + remote source | `cat eas.json` |
| 401 force-sign-out behavior | `sed -n '10,20p' utils/api.ts` |
