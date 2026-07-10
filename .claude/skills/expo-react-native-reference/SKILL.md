---
name: expo-react-native-reference
description: >
  Domain-theory knowledge pack for the Mint Rewards App: Expo SDK 54 / React Native 0.81
  platform concepts as they apply to THIS repo. Use when you need to understand or explain
  prebuild / CNG (why android/ and ios/ are gitignored), Expo Go vs development build vs
  release build, EAS build profiles in eas.json, EXPO_PUBLIC_ env vars, expo-router v6
  file-based routing, platform-specific file suffixes (.ios.tsx/.android.tsx/.web.ts),
  New Architecture / React Compiler / React 19 implications, the native modules in
  package.json (google-signin, expo-print, expo-secure-store, react-native-maps, etc.),
  the Zustand store mental model, or version discipline (npx expo install). Trigger words:
  prebuild, CNG, Expo Go, dev client, EAS, eas.json, config plugin, EXPO_PUBLIC, expo-router,
  typed routes, new architecture, react compiler, Metro, bundle, native module, npx expo install.
---

# Expo / React Native Reference — Mint Rewards App

Platform concepts a web developer or an AI model needs before touching this repo. Every
concept below lands on a concrete file or command in this repository. Repo facts verified
against the working tree (as of 2026-07-08). General Expo/RN platform statements come from
model knowledge; anything version-sensitive is labeled "(verify against Expo SDK 54 docs)".

Baseline (as of 2026-07-08): Expo SDK `~54.0.25`, React Native `0.81.5`, React `19.1.0`,
expo-router `~6.0.15`, TypeScript `~5.9.2` — all pinned in `package.json`.

---

## 1. Continuous Native Generation (CNG) / prebuild

**Definition.** In a CNG workflow, the `android/` and `ios/` native projects are *build
artifacts*, not source. `npx expo prebuild` generates them from `app.json` (plus config
plugins). You never hand-edit native files; you edit `app.json` and regenerate.

**Here.** `android/` and `ios/` exist on disk but are gitignored — commit `fe5294d`
("ignore generated native directories and .expo") added `android` and `ios` to `.gitignore`
(lines 9–10). All native configuration lives in `app.json`: bundle IDs
(`ios.bundleIdentifier: com.mintrewards.app`, `android.package: com.mintrewards.appp` —
note the triple-p on Android, it is intentional and must not be "fixed"), Info.plist keys
(`ios.infoPlist`), Android permissions, the Google Maps API key
(`android.config.googleMaps.apiKey`), and the `plugins` array.

**Rules for this repo:**

- NEVER hand-edit files under `android/` or `ios/`. Changes there are silently lost on the
  next prebuild and never reach CI/EAS (which prebuilds from `app.json`).
- Native config change → edit `app.json` (or add a config plugin) → regenerate.

**Proof / commands:**

```bash
git check-ignore -v android ios        # shows .gitignore:9 and :10
git show --stat fe5294d                # the commit that gitignored them
npx expo prebuild --clean              # regenerate native projects from app.json
```

`--clean` deletes and regenerates `android/` + `ios/`; run it after any `app.json` plugin
or native-config change, then rebuild with `npx expo run:ios` / `run:android`.

---

## 2. Expo Go vs development build vs release build

**Definition.** *Expo Go* is Expo's store-installed sandbox app that can only load JS using
the fixed set of native modules baked into it. A *development build* (dev client) is your
own app binary compiled with YOUR native modules plus the `expo-dev-client` dev menu; it
loads JS from the Metro dev server. A *release build* embeds the JS bundle in the binary.

**This app CANNOT run in Expo Go.** Read `package.json` and note the native modules that
are not part of Expo Go's runtime:

| Dependency (`package.json`) | Why it forces a dev build |
| --- | --- |
| `@react-native-google-signin/google-signin` `^16.1.2` | Third-party native module + config plugin; not in Expo Go |
| `react-native-maps` `1.20.1` | Needs the Google Maps API key compiled in via `app.json` `android.config.googleMaps` |
| `expo-dev-client` `~6.0.21` | Its presence in deps declares this a dev-client project |
| `expo-apple-authentication` `~8.0.8` | Requires the Sign in with Apple entitlement in your own binary |

`expo-print` / `expo-sharing` are Expo-SDK modules, but in practice this repo treats them
as build-fragile too — see the lazy-require pattern below.

**The lazy-require defensive pattern (repo idiom).** Because a JS bundle can be newer than
the installed native binary (e.g. Metro reload after adding a dep without rebuilding),
this repo never imports fragile native modules at module top level:

- `utils/googleAuth.ts` lines 43–54: `require('@react-native-google-signin/google-signin')`
  inside `try/catch`; on failure it warns and every exported function no-ops with a
  friendly error instead of crashing the app at startup.
- `hooks/useCouponDownload.ts` (~line 430): `await import("expo-print")` and
  `await import("expo-sharing")` inside `downloadCoupon`, not at file top.

Follow this pattern when adding any new native module used on a non-critical path.

**Commands:**

```bash
npx expo run:ios        # compile + install a dev client on iOS sim/device (npm run ios)
npx expo run:android    # same for Android (npm run android)
npx expo start          # Metro dev server; press s — there is no Expo Go option that works here
```

---

## 3. EAS (Expo Application Services)

**Definition.** EAS Build compiles the app in Expo's cloud (it runs prebuild there, which
is why gitignoring `android/`/`ios/` is safe). Profiles live in `eas.json`.

**This repo's `eas.json`, line by line:**

| Key | Value | Meaning |
| --- | --- | --- |
| `cli.version` | `>= 14.7.1` | Minimum eas-cli version allowed to build this project |
| `cli.appVersionSource` | `remote` | EAS's servers own the build number; `ios.buildNumber` in app.json is NOT the source of truth — EAS increments and stores versions remotely |
| `build.development` | `developmentClient: true`, `distribution: internal` | Dev client for physical devices, ad-hoc/internal install |
| `build.simulator` | `ios.simulator: true`, `developmentClient: true` | Dev client compiled for the iOS Simulator (a device build won't install on a sim) |
| `build.preview` | `distribution: internal` | Release-mode binary (JS embedded) distributed internally, not to stores |
| `build.production` | `autoIncrement: true` | Store build; bumps the remote build number automatically each build |
| `submit.production` | `{}` | Placeholder for `eas submit` store credentials/config |

**Project identity:** `app.json` → `owner: "mint-rewards"`, `slug: "mint-rewards"`,
`extra.eas.projectId: 7a49df03-9e0f-4272-acfc-5bcb7fd8e30a`. These three bind the repo to
the EAS project; do not change them.

```bash
npx eas build --profile development --platform ios     # example invocation
npx eas build:version:get                              # inspect remote version (appVersionSource remote)
```

For which profile to use when, defer to **mint-rewards-build-and-env**.

---

## 4. EXPO_PUBLIC_ environment variables

**Definition.** Any var prefixed `EXPO_PUBLIC_` in `.env` is *inlined as a string literal
into the JS bundle at bundle time* by Metro/babel. Consequences: (a) it is NOT secret —
anyone can extract it from the binary; (b) changing `.env` does nothing to running code
until you restart the bundler with cache cleared (`npx expo start -c`) for dev, and
**rebuild the binary** for preview/production builds (the value is frozen into the
embedded bundle).

**This repo's vars** (`.env` is untracked/gitignored — keys as of 2026-07-08):

| Var | Consumer | Behavior |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `utils/constants.ts:13` (`API_BASE_URL`, trailing slash stripped) and `utils/logger.ts:10` | Falls back to `https://mint-rewards-backend.vercel.app` when unset |
| `APPLE_BUNDLE_ID` | No `process.env` consumer in app code (no `EXPO_PUBLIC_` prefix, so it would not be inlined anyway) — build/tooling side only | — |

Note `utils/constants.ts` and `utils/logger.ts` read the env var *independently*; keep
their fallbacks in sync if you ever change the default backend URL.

**Proof:**

```bash
grep -rn "EXPO_PUBLIC" app components hooks utils store
npx expo start -c        # required after editing .env in development
```

Secrets must never go in `EXPO_PUBLIC_` vars or in git (non-negotiable). Server secrets
belong to the separate backend repo.

---

## 5. expo-router v6 (file-based routing)

**Definition.** expo-router maps the `app/` directory to navigation routes (like Next.js
for native). `package.json` `main` is `"expo-router/entry"` — there is no App.tsx; the
router IS the app entry.

**This repo's route map:**

| File | Route / role |
| --- | --- |
| `app/_layout.tsx` | Root layout: `<Stack initialRouteName="index">` listing every screen; also runs the startup auth check (SecureStore token → `getProfile()` → redirect) and `configureGoogleSignIn()` |
| `app/index.tsx` | `/` — landing/splash decision screen |
| `app/(tabs)/_layout.tsx` | Tab navigator (`<Tabs>`); `(tabs)` is a *group* — parentheses keep it out of the URL, so `app/(tabs)/home.tsx` is route `/home`, addressed in code as `/(tabs)/home` |
| `app/(tabs)/{home,profile,share,store}.tsx` | The four tabs |
| `app/{login,register,forgot-password,otp-screen,change-password,editProfile,discounts,redeem,collections,notifications}.tsx` | Stack screens |
| `app/+not-found.tsx` | Catch-all for unmatched routes |

**Typed routes:** `app.json` `experiments.typedRoutes: true` generates route-string types
into `.expo/types` (referenced via `expo-env.d.ts`), so `router.push("/tpyo")` is a
TypeScript error. Types regenerate when Metro runs.

**replace vs push, as used here.** `router.replace` swaps the current screen (no back
entry) — used for auth transitions so users can't back-swipe into a stale state:
`app/_layout.tsx:30-42` (login vs home redirect), `app/login.tsx:382`,
`app/register.tsx:91`. `router.push` stacks a screen the user should return from:
`app/discounts.tsx:113` (`/editProfile` when profile-gated),
`app/forgot-password.tsx:35` (`/otp-screen?email=...` — query params become
`useLocalSearchParams()` in the target). Preserve this distinction; using `push` for auth
redirects reintroduces back-navigation bugs.

---

## 6. Platform-specific file resolution

**Definition.** Metro resolves `Foo.ios.tsx` / `Foo.android.tsx` / `Foo.web.ts` before
`Foo.tsx` per platform at import time. The import site stays platform-agnostic
(`import X from './Foo'`); the bundler picks the file. Only the extensionless suffix
matters — TypeScript sees them via the shared name.

**This repo's examples (read them as templates):**

| Base import | iOS gets | Android gets | Web gets |
| --- | --- | --- | --- |
| `components/AppleSignInButton` | `.ios.tsx` — real `expo-apple-authentication` button | `.android.tsx` — `return null` (3-line stub; Apple Sign-In is iOS-only) | `.tsx` fallback (type-only imports) |
| `components/ui/TabBarBackground` | `.ios.tsx` — blur effect | `.tsx` fallback | `.tsx` fallback |
| `components/ui/icon-symbol` | `.ios.tsx` — SF Symbols via `expo-symbols` | `.tsx` — Material icons fallback | `.tsx` fallback |
| `hooks/use-color-scheme` | `.ts` | `.ts` | `.web.ts` — SSR-safe hydration variant |

Pattern to copy: the suffix-less file is the cross-platform fallback AND the home of
shared types; platform files override it. `AppleSignInButton.android.tsx` returning `null`
is the canonical "feature doesn't exist on this platform" stub.

---

## 7. New Architecture, React Compiler, React 19

**Definition.** RN's New Architecture replaces the async bridge with JSI-based synchronous
native calls (TurboModules) and the Fabric renderer. The React Compiler auto-memoizes
components at build time (no manual `useMemo`/`useCallback` needed for most cases).

**Here.** `app.json`: `newArchEnabled: true` and `experiments.reactCompiler: true`;
`package.json`: `react: 19.1.0`. On SDK 54 / RN 0.81 the New Architecture is the standard
path (verify against Expo SDK 54 docs for exact default behavior).

**Practical implications for this repo:**

- **Library-compat class of issues:** any newly added third-party native library must
  support Fabric/TurboModules. Old bridge-only libraries fail at build or silently at
  runtime. Check compatibility before adding deps (`npx expo install --check` catches
  version drift but NOT arch compat — check the library's README).
  *Speculation, labeled as such:* `react-native-wallet-cards` `^1.1.0` and
  `react-native-modal` `^14.0.0-rc.1` are small community libs and the most likely
  candidates if a new-arch rendering issue ever appears — unverified, no observed bug.
- **React Compiler is experimental** (`experiments` block): if a component behaves
  differently in release vs. expectations (stale closure symptoms, skipped re-renders),
  a valid diagnostic step is toggling `reactCompiler: false` and rebuilding — but that is
  a config change, so route it through **mint-rewards-change-control**.
- Compiler assumes the Rules of React. Mutating objects held in state or reading refs
  during render can miscompile into stale UI. Zustand selectors (below) are compatible.
- `react-native-reanimated ~4.1.1` + `react-native-worklets 0.5.1` are the new-arch
  compatible pairing on SDK 54 (worklets split out of reanimated) — keep their versions
  moving together (verify against Expo SDK 54 docs).

---

## 8. Key native modules in this repo

One line each + the gotcha that bites (all versions from `package.json`, as of 2026-07-08):

| Module | Role here | Gotcha |
| --- | --- | --- |
| `expo-secure-store` | Auth persistence: `userToken`, `userEmail`, `userName`, `userPoints` in iOS Keychain / Android Keystore (`store/store.ts:330-333`, cleared at `:469-472`; read at app boot in `app/_layout.tsx:23`) | ~2KB value size limit — store tokens/small strings only, never JSON blobs of profile data; values survive app reinstall on iOS (stale-token path handled at `app/_layout.tsx:32-34`) |
| `expo-print` | HTML string → PDF file for coupon downloads (`hooks/useCouponDownload.ts`, `printToFileAsync`) | Loaded via dynamic `import()` inside the hook, not top-level — keep it that way (missing native binary must not crash startup) |
| `expo-sharing` | OS share sheet for the generated coupon PDF (`useCouponDownload.ts`, `shareAsync`) | Same lazy-import rule; no-op on web |
| `expo-location` + `react-native-maps` | Address pinning for waste pickup (`components/ui/LocationPicker.tsx`, `MapPicker.tsx`) | Permission strings live in `app.json` (iOS `infoPlist.NSLocation*`, plugin `locationWhenInUsePermission`, Android `permissions` array); Maps needs the API key in `android.config.googleMaps.apiKey` — all require prebuild + rebuild to take effect |
| `expo-apple-authentication` | Sign in with Apple (`components/AppleSignInButton.ios.tsx`) | iOS-only — Android gets the `return null` stub via file resolution; needs the entitlement, hence no Expo Go |
| `@react-native-google-signin/google-signin` | Google Sign-In (`utils/googleAuth.ts`; configured at boot in `app/_layout.tsx:46`) | Historically the costliest setup failure in this repo. Config plugin in `app.json` carries `iosUrlScheme` (reversed iOS client ID); `configureGoogleSignIn()` hardcodes `iosClientId` + `webClientId` — the `webClientId` is a DIFFERENT OAuth client than the iOS one and must match the backend's verifier. Any change → prebuild + rebuild. Deep-dive: **mint-rewards-auth-and-identity** |
| `react-native-reanimated` / `react-native-worklets` | Animation runtime; `import "react-native-reanimated"` side-effect import at the very top of `app/_layout.tsx:8` | That import must stay first-ish in the root layout; babel/worklets misconfig shows up as "native part of reanimated doesn't seem to be initialized" |
| `zustand` `^5.0.8` | The state library (JS-only, not Expo) | See mental model below |

**Zustand mental model (as used in `store/store.ts`).** One module-level store created
once: `export const useAppStore = create<AppStore>((set, get) => ({ ... }))`
(`store/store.ts:243`). The object literal holds state fields AND async actions side by
side. Actions call `set({ ... })` to merge partial updates (never mutate) and `get()` to
read current state mid-async (e.g. `get().user?.token || await SecureStore.getItemAsync("userToken")`,
`:262`). Components subscribe with `useAppStore((s) => s.field)` selectors; outside React
(and in `app/_layout.tsx:28`) use `useAppStore.getState()`. There is no Provider — the
store is a singleton import, which is why any file can call
`useAppStore.getState().logout()`. All ~937 lines of app state live in this ONE file;
do not create parallel stores.

---

## 9. Version discipline

**Definition.** Each Expo SDK pins a known-good version for every Expo/RN package (that is
what the `~` ranges in `package.json` encode, e.g. `expo: ~54.0.25`,
`expo-router: ~6.0.15`). Installing an arbitrary version with plain `npm install <pkg>`
breaks the matrix and produces native build failures or runtime crashes.

**Rules:**

```bash
npx expo install <pkg>          # ALWAYS use this for Expo-managed / RN deps — resolves the SDK-54-correct version
npx expo install --check        # detect version drift vs SDK 54 expectations (read-only)
npx expo install --fix          # apply the corrections --check found (this changes package.json → change control)
npx expo-doctor                 # broader project health check (verify against Expo SDK 54 docs for flag names)
```

Plain `npm install` is fine only for pure-JS libraries with no Expo pin (e.g. `formik`,
`yup`, `zustand`). React (`19.1.0`) and React Native (`0.81.5`) are exact-pinned — never
bump them independently of an SDK upgrade, and an SDK upgrade is a
**mint-rewards-change-control** event.

---

## 10. Glossary

| Term | Meaning in this repo's context |
| --- | --- |
| **Metro** | The React Native JS bundler/dev server. `npx expo start` runs it; it does the platform-suffix file resolution (§6) and inlines `EXPO_PUBLIC_` vars (§4). `-c` clears its cache. |
| **Bundle** | The single compiled JS file Metro produces. Dev builds fetch it from Metro over the network; preview/production builds embed it in the binary — which is why env/JS changes need a rebuild there. |
| **Config plugin** | A package (or function) that mutates the generated native projects during prebuild. This repo's `app.json` `plugins` array: expo-router, expo-splash-screen, expo-secure-store, expo-location, expo-web-browser, expo-apple-authentication, @react-native-google-signin (with `iosUrlScheme`). The only sanctioned way to change native config. |
| **Dev client** | This app's own binary compiled with `expo-dev-client` (`npx expo run:ios/android` or the EAS `development`/`simulator` profiles). Replaces Expo Go, which cannot run this app (§2). |
| **OTA / EAS Update** | Shipping new JS bundles to installed apps without a store release. **Not configured here** (no `expo-updates` in `package.json`, no `updates`/`runtimeVersion` in `app.json`, as of 2026-07-08) — a candidate improvement, routed through change control; until then every JS fix to production requires a full store build. |
| **Prebuild** | `npx expo prebuild [--clean]`: generates `android/`+`ios/` from `app.json` + plugins. The reason those dirs are gitignored (§1). |
| **Scheme** | The deep-link URL scheme, `mint-rewards` in `app.json` (`mint-rewards://...` opens the app). Distinct from the `iosUrlScheme` inside the google-signin plugin, which is the reversed Google OAuth client ID used only for the sign-in redirect. |

---

## When NOT to use this skill

| You actually need | Go to |
| --- | --- |
| Which EAS profile / env for a given build, credentials, .env workflow | **mint-rewards-build-and-env** |
| Google/Apple sign-in flow logic, token handling, profile-completeness gating | **mint-rewards-auth-and-identity** |
| Backend endpoints, payloads, error shapes | **mint-rewards-backend-api-contract** |
| A live bug to diagnose right now | **mint-rewards-debugging-playbook**, then **mint-rewards-diagnostics-and-tooling** |
| Coupon redeem/used-state reliability work | **mint-rewards-coupon-reliability-campaign** |
| Whether/how a change is allowed at all | **mint-rewards-change-control** |
| Module boundaries and architecture rules of this codebase | **mint-rewards-architecture-contract** |
| Past incidents and why the code looks the way it does | **mint-rewards-failure-archaeology** |
| Running the app day-to-day, store release process | **mint-rewards-run-and-operate**, **mint-rewards-release-and-positioning** |
| Config values and feature flags themselves | **mint-rewards-config-and-flags** |
| Testing/QA procedure | **mint-rewards-validation-and-qa** |

This skill explains the platform; it does not authorize changes. Anything touching
`app.json`, `eas.json`, `package.json` versions, or the plugins array goes through
**mint-rewards-change-control**.

---

## Provenance and maintenance

All repo facts verified against the working tree on 2026-07-08. Re-verify with:

- Dependency/version claims (§2, §8, §9): `cat package.json`
- Native config, plugins, experiments, projectId (§1, §3, §5, §7): `cat app.json`
- EAS profiles (§3): `cat eas.json`
- android/ios gitignored (§1): `git check-ignore -v android ios && git show --stat fe5294d`
- Env var consumers (§4): `grep -rn "EXPO_PUBLIC" app components hooks utils store`
- Route map (§5): `ls app app/\(tabs\)`
- Platform-file examples (§6): `ls components/AppleSignInButton.* components/ui/TabBarBackground.* components/ui/icon-symbol.* hooks/use-color-scheme.*`
- Lazy-require idiom (§2, §8): `grep -n "require('@react-native-google-signin" utils/googleAuth.ts && grep -n 'import("expo-print")' hooks/useCouponDownload.ts`
- Zustand store shape (§8): `grep -n "create<AppStore>" store/store.ts`
- Version drift (§9): `npx expo install --check`
