# Location Update Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify existing users at login that their location is out of date, clear their saved town, and require them to re-pick town and sub-area.

**Architecture:** A pure predicate `needsLocationUpdate(user)` derived from the user document drives everything — an in-app modal on the home screen, a home banner, and blank location fields in `editProfile`. No stored flag, no migration, no backend change. The one-shot Mongo migration script this replaces gets deleted.

**Tech Stack:** Expo SDK 56, React Native 0.85.3, React 19.2.3, TypeScript 6.0.3, Zustand, expo-router. Tests via `jest-expo` (added in Task 1 — this repo currently has none).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-location-update-prompt-design.md`. Read it before Task 1.
- Branch: `feat/location-update-prompt` (already checked out, based on `fix/update_locations`).
- JS/TS-only change. Do **not** add native modules, edit `app.json`/`app.config.js`, or bump the version. No rebuild is required and none should become required.
- No backend changes. `townOther`, `subArea`, and `subAreaOther` already reach the client on every auth route.
- Use `npx expo install` (not `npm install`) for any dependency, per this repo's version discipline.
- Path alias `@/*` maps to the repo root (`tsconfig.json`).
- Never write a non-canonical value into `town`, or a free-text value into `subArea`. Free text belongs in `townOther` / `subAreaOther`. `town`/`townOther` and `subArea`/`subAreaOther` are mutually exclusive — exactly one of each pair may be non-empty.
- Modal copy, verbatim: title `Update your location`, body `We've updated our area list to be more accurate. Please re-select your town and area.`, buttons `Later` and `Update now`.
- Banner copy, verbatim: `We've updated our area list — please re-select your town`.
- Run `npx tsc --noEmit` before every commit. It is currently clean; keep it clean.

### Canonical test fixtures (verified against `utils/pakistan_areas.ts`)

Use these exact values in tests — they are real entries in the dataset:

| Fixture | Value |
|---|---|
| City with a town list | `"Islamabad"` (59 towns) |
| Canonical town **with** sub-areas | `"Sector E-7"` → `["E-7/1", "E-7/2", "E-7/3", ...]` |
| Canonical town **without** sub-areas | `"Bani Gala"` |
| Legacy (non-canonical) town | `"F-6"` — renamed to `"Sector E-7"`-style sectors, no longer in the list |
| City with **no** town list | `"Sialkot"` |

---

### Task 1: Test infrastructure

This repo has no test runner, no test script, and no test files. The spec requires unit tests, so this task adds the minimum needed and proves it works against existing code — no new product code yet.

**Files:**
- Modify: `package.json` (devDependencies + `test` script)
- Create: `jest.config.js`
- Create: `babel.config.js`
- Create: `__tests__/pakistan_areas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` command. Every later task depends on it.

- [ ] **Step 1: Install the test runner**

```bash
npx expo install --dev jest-expo jest @types/jest
```

Expect `jest-expo@~56.x` to match Expo SDK 56. Do not hand-pick versions.

- [ ] **Step 2: Create `babel.config.js`**

`jest-expo` transforms test files with `babel-preset-expo`, which needs a Babel config file. This repo has none because Metro applies `babel-preset-expo` by default — so this file states Metro's existing default explicitly and changes nothing about bundling.

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
```

- [ ] **Step 3: Create `jest.config.js`**

`moduleNameMapper` mirrors the `@/*` path alias from `tsconfig.json`; without it every `@/utils/...` import fails to resolve under Jest.

```js
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
};
```

- [ ] **Step 4: Add the `test` script to `package.json`**

In the existing `"scripts"` block, after `"lint": "expo lint",` add:

```json
    "test": "jest",
```

- [ ] **Step 5: Write a test against existing code**

This proves the harness resolves the `@/` alias and can import the dataset. It tests `isCanonicalTown`, which already exists — no product code is being added here.

Create `__tests__/pakistan_areas.test.ts`:

```ts
import { isCanonicalTown, requiresSubArea } from "@/utils/pakistan_areas";

describe("pakistan_areas fixtures", () => {
  it("recognises a canonical town", () => {
    expect(isCanonicalTown("Islamabad", "Sector E-7")).toBe(true);
  });

  it("rejects a town renamed out of the list", () => {
    expect(isCanonicalTown("Islamabad", "F-6")).toBe(false);
  });

  it("requires a sub-area only where data exists", () => {
    expect(requiresSubArea("Islamabad", "Sector E-7")).toBe(true);
    expect(requiresSubArea("Islamabad", "Bani Gala")).toBe(false);
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, 3 tests. If module resolution fails on `@/`, the `moduleNameMapper` in Step 3 is wrong — fix it before continuing.

- [ ] **Step 7: Verify types still compile**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json jest.config.js babel.config.js __tests__/pakistan_areas.test.ts
git commit -m "test: add jest-expo test infrastructure"
```

---

### Task 2: The `needsLocationUpdate` predicate

**Files:**
- Modify: `utils/profile.ts` (append; leave `isProfileComplete` untouched)
- Create: `__tests__/profile.test.ts`

**Interfaces:**
- Consumes: `isLegacyTownValue(city, town)` and `requiresSubArea(city, town)` from `@/utils/pakistan_areas`; the `User` type from `@/store/store`.
- Produces: `needsLocationUpdate(user: User | null | undefined): boolean` — consumed by Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/profile.test.ts`. One case per branch of the predicate — these are the eight rows from the spec's testing table.

```ts
import { needsLocationUpdate } from "@/utils/profile";
import type { User } from "@/store/store";

const base = (over: Partial<User>): User =>
  ({ city: "Islamabad", ...over }) as User;

describe("needsLocationUpdate", () => {
  it("is true for a town renamed out of the canonical list", () => {
    expect(needsLocationUpdate(base({ town: "F-6" }))).toBe(true);
  });

  it("is true for a canonical town with sub-area data and no sub-area", () => {
    expect(needsLocationUpdate(base({ town: "Sector E-7" }))).toBe(true);
  });

  it("is false once a canonical sub-area is set", () => {
    expect(
      needsLocationUpdate(base({ town: "Sector E-7", subArea: "E-7/1" })),
    ).toBe(false);
  });

  it("is false once a free-text sub-area is set", () => {
    expect(
      needsLocationUpdate(base({ town: "Sector E-7", subAreaOther: "Street 12" })),
    ).toBe(false);
  });

  it("is false for a canonical town with no sub-area data", () => {
    expect(needsLocationUpdate(base({ town: "Bani Gala" }))).toBe(false);
  });

  it("is false for a free-text town user", () => {
    expect(
      needsLocationUpdate(base({ town: "", townOther: "Some Village" })),
    ).toBe(false);
  });

  it("is false when no town has been entered at all", () => {
    expect(needsLocationUpdate(base({ town: "", townOther: "" }))).toBe(false);
  });

  it("is false for a city with no canonical town list", () => {
    expect(needsLocationUpdate(base({ city: "Sialkot", town: "Cantt" }))).toBe(
      false,
    );
  });

  it("is false for a null user", () => {
    expect(needsLocationUpdate(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- __tests__/profile.test.ts`
Expected: FAIL — `needsLocationUpdate is not a function` / import error.

- [ ] **Step 3: Implement the predicate**

Append to `utils/profile.ts`. Also add `isLegacyTownValue` to the existing import from `@/utils/pakistan_areas` (it currently imports only `requiresSubArea`):

```ts
/**
 * True when a saved location predates the canonical dataset and the user must
 * re-pick it.
 *
 * Two populations qualify: a town renamed out of the list (which the picker
 * cannot represent at all), and a canonical town whose sub-area was never
 * collected because the field did not exist when the profile was created.
 *
 * Derived from the user document on every call — there is no stored flag to
 * drift out of sync, so a half-finished update simply prompts again.
 *
 * Returns false for free-text-town users (`town` empty, value in `townOther`),
 * for profiles with no town at all (already covered by the generic
 * incomplete-profile prompt), and for cities with no canonical town list —
 * none of them has an answerable question here.
 */
export function needsLocationUpdate(user: User | null | undefined): boolean {
  if (!user) return false;

  const city = user.city?.trim() || "";
  const town = user.town?.trim() || "";

  if (isLegacyTownValue(city, town)) return true;

  if (requiresSubArea(city, town)) {
    return !user.subArea?.trim() && !user.subAreaOther?.trim();
  }

  return false;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- __tests__/profile.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add utils/profile.ts __tests__/profile.test.ts
git commit -m "feat: add needsLocationUpdate predicate"
```

---

### Task 3: Session-scoped prompt suppression in the store

**Files:**
- Modify: `store/store.ts` — `UserSlice` interface (~line 210), initial state (~line 387), `signOut` (~line 637)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `locationPromptShown: boolean` and `dismissLocationPrompt: () => void` on the store — consumed by Task 5.

**Note on reset points.** The spec says reset "on login and on logout". Because this flag is in-memory and never persisted, it is already `false` on every cold start — and every login is preceded by either a cold start or a `signOut`. Resetting inside `signOut` alone is therefore complete, and avoids touching all four auth paths (login, register, Google, Apple).

- [ ] **Step 1: Add the fields to the `UserSlice` interface**

In `store/store.ts`, inside `interface UserSlice`, after `error: string | null;`:

```ts
  /**
   * True once the location-update modal has been shown and dismissed this
   * session. Deliberately not persisted: a cold start should prompt again,
   * because the user has not re-picked their town yet and would otherwise sit
   * behind a locked brand list with no explanation.
   */
  locationPromptShown: boolean;
  dismissLocationPrompt: () => void;
```

- [ ] **Step 2: Add the initial state and the action**

In the store body, after `error: null,` in the user slice:

```ts
  locationPromptShown: false,

  dismissLocationPrompt: () => set({ locationPromptShown: true }),
```

- [ ] **Step 3: Reset the flag on sign-out**

In `signOut`, extend the final `set(...)` call to include the flag:

```ts
    set({
      user: null,
      token: null,
      error: null,
      scheduledCollection: null,
      locationPromptShown: false,
    });
```

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: clean. A missing-property error on the store object means Step 2 was skipped.

- [ ] **Step 5: Run the existing tests**

Run: `npm test`
Expected: PASS (12 tests). Nothing here should affect them; this confirms no import cycle was introduced.

- [ ] **Step 6: Commit**

```bash
git add store/store.ts
git commit -m "feat: add session-scoped locationPromptShown flag"
```

---

### Task 4: The `LocationUpdateModal` component

**Files:**
- Create: `components/LocationUpdateModal.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: default export `LocationUpdateModal` with props `{ visible: boolean; onLater: () => void; onUpdate: () => void }` — consumed by Task 5.

Structured to match `components/ConfirmationModal.tsx` (transparent `Modal`, `animationType="fade"`, centred card, icon circle). It is a separate component rather than a reuse of `ConfirmationModal` because that one hardcodes a warning icon, an orange icon circle, and a `Cancel` label, none of which fit here.

- [ ] **Step 1: Create the component**

```tsx
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  onLater: () => void;
  onUpdate: () => void;
};

const LocationUpdateModal = ({ visible, onLater, onUpdate }: Props) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onLater}
  >
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="location-outline" size={28} color="#449EB2" />
        </View>

        <Text style={styles.title}>Update your location</Text>
        <Text style={styles.message}>
          We&apos;ve updated our area list to be more accurate. Please re-select
          your town and area.
        </Text>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.laterBtn}
            onPress={onLater}
            activeOpacity={0.7}
          >
            <Text style={styles.laterText}>Later</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.updateBtn}
            onPress={onUpdate}
            activeOpacity={0.7}
          >
            <Text style={styles.updateText}>Update now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E6F4F7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  laterBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#ddd",
    alignItems: "center",
  },
  laterText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
  },
  updateBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#449EB2",
    alignItems: "center",
  },
  updateText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});

export default LocationUpdateModal;
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/LocationUpdateModal.tsx
git commit -m "feat: add LocationUpdateModal component"
```

---

### Task 5: Wire the prompt into the home screen

**Files:**
- Modify: `app/(tabs)/home.tsx` — imports, the derived-state block (~line 184), the banner block (~line 400)

**Interfaces:**
- Consumes: `needsLocationUpdate` (Task 2), `locationPromptShown` / `dismissLocationPrompt` (Task 3), `LocationUpdateModal` (Task 4).
- Produces: nothing consumed later.

The branch currently gates its location banner on `profileComplete`, which suppresses it for exactly the users who need it — a missing `subArea` makes them incomplete. This task inverts that precedence.

- [ ] **Step 1: Update the imports**

Replace the existing line:

```tsx
import { isLegacyTownValue } from "@/utils/pakistan_areas";
```

with:

```tsx
import LocationUpdateModal from "@/components/LocationUpdateModal";
```

and change:

```tsx
import { isProfileComplete } from "@/utils/profile";
```

to:

```tsx
import { isProfileComplete, needsLocationUpdate } from "@/utils/profile";
```

`isLegacyTownValue` is no longer used in this file — the predicate now owns that check.

- [ ] **Step 2: Replace the derived-state block**

Replace this (the branch's current version):

```tsx
  const needsLocationUpdate =
    profileComplete && isLegacyTownValue(user?.city || "", user?.town || "");
```

with:

```tsx
  // Location-specific prompt takes precedence over the generic incomplete
  // banner: these users ARE incomplete (a missing sub-area makes them so), and
  // the generic "complete your profile" copy would tell them nothing about what
  // actually changed.
  const locationUpdateNeeded = needsLocationUpdate(user);
```

Pull the store flag and action in alongside the existing `useAppStore` usage in this component:

```tsx
  const locationPromptShown = useAppStore((s) => s.locationPromptShown);
  const dismissLocationPrompt = useAppStore((s) => s.dismissLocationPrompt);
```

- [ ] **Step 3: Update the generic banner condition**

Change:

```tsx
          {!profileComplete && (
```

to:

```tsx
          {!profileComplete && !locationUpdateNeeded && (
```

- [ ] **Step 4: Update the location banner condition**

Change:

```tsx
          {needsLocationUpdate && (
```

to:

```tsx
          {locationUpdateNeeded && (
```

and set its label to the exact banner copy:

```tsx
                We&apos;ve updated our area list — please re-select your town
```

- [ ] **Step 5: Mount the modal**

Add inside the screen's root view, as the last child (siblings of the scroll content, so it overlays everything):

```tsx
      <LocationUpdateModal
        visible={locationUpdateNeeded && !locationPromptShown}
        onLater={dismissLocationPrompt}
        onUpdate={() => {
          dismissLocationPrompt();
          router.push("/editProfile");
        }}
      />
```

- [ ] **Step 6: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. An "unused variable" lint error on `isLegacyTownValue` means Step 1 was not completed.

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/home.tsx"
git commit -m "feat: show location update modal and banner on home"
```

---

### Task 6: Clear the location fields in `editProfile`

**Files:**
- Modify: `app/editProfile.tsx` — imports, and the mount `useEffect` at ~lines 76-118

**Interfaces:**
- Consumes: `needsLocationUpdate` (Task 2).
- Produces: nothing consumed later.

**This task overrides existing behaviour, it does not add to it.** The mount effect currently migrates a non-canonical saved town *into* `townOther` and sets `townIsCustom = true`. That pre-fills the stale value as free text, which would let an affected user save the old town as `townOther` and never re-pick a canonical one. When `needsLocationUpdate` is true, all four location fields must start empty instead.

Per the approved design this applies to **both** populations — including users whose canonical town is still valid and are only missing a sub-area. One rule, one code path.

Nothing is destroyed: this is form state only. The store and the Mongo document keep their values until the user saves.

- [ ] **Step 1: Add the import**

Add `needsLocationUpdate` to the imports from `@/utils/profile`, or add the import if the file has none:

```tsx
import { needsLocationUpdate } from "@/utils/profile";
```

- [ ] **Step 2: Compute the flag at the top of the mount effect**

Immediately after `if (user) {`:

```tsx
      // Renamed town, or a sub-area that was never collected. Start every
      // location field empty so the user re-picks from the canonical list
      // rather than confirming a stale value. Form state only — the store and
      // the server keep their values until a save succeeds.
      const mustReselect = needsLocationUpdate(user);
```

- [ ] **Step 3: Short-circuit the town rehydrate**

Replace:

```tsx
      const townIsCanonical = isCanonicalTown(existingCity, savedTown);
      const existingTown = townIsCanonical ? savedTown : "";
      const existingTownOther = townIsCanonical
        ? ""
        : user.townOther || savedTown || "";
      const isCustom = existingTownOther !== "";
```

with:

```tsx
      const townIsCanonical =
        !mustReselect && isCanonicalTown(existingCity, savedTown);
      const existingTown = townIsCanonical ? savedTown : "";
      const existingTownOther = mustReselect
        ? ""
        : townIsCanonical
          ? ""
          : user.townOther || savedTown || "";
      const isCustom = existingTownOther !== "";
```

- [ ] **Step 4: Short-circuit the sub-area rehydrate**

`existingSubArea` already resolves to `""` when `existingTown` is empty, but `existingSubAreaOther` would still pick up the saved free-text value. Replace:

```tsx
      const existingSubAreaOther = existingSubArea ? "" : user.subAreaOther || "";
```

with:

```tsx
      const existingSubAreaOther =
        mustReselect || existingSubArea ? "" : user.subAreaOther || "";
```

- [ ] **Step 5: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 6: Confirm no new validation is needed**

Read `app/editProfile.tsx` around lines 254 and 265 and confirm `validateForm` still requires a town (`!formData.town?.trim() && !formData.townOther?.trim()`) and a sub-area where `requiresSubArea` holds. Both already exist — a cleared form cannot be saved blank. Make no change here.

- [ ] **Step 7: Commit**

```bash
git add app/editProfile.tsx
git commit -m "feat: clear location fields when a re-pick is required"
```

---

### Task 7: Make the discounts screen use the shared completeness gate

**Files:**
- Modify: `app/discounts.tsx` — line 1 (import), line 30, line 160, line 209

**Interfaces:**
- Consumes: `isProfileComplete` from `@/utils/profile`.
- Produces: nothing consumed later.

This screen carries a copy of the pre-branch completeness rule, so a user locked out on home can reach it and avail normally. Building a prompt around a gate that a second screen ignores would tell users they are blocked while quietly letting them through.

The local constant is named `isProfileComplete`, which collides with the imported function, so it is renamed to `profileComplete` — the same name `home.tsx` uses.

- [ ] **Step 1: Add the import**

After the existing imports:

```tsx
import { isProfileComplete } from "@/utils/profile";
```

- [ ] **Step 2: Replace the inline check at line 30**

Replace:

```tsx
  const isProfileComplete = !!(user?.phone?.trim() && user?.province?.trim() && user?.city?.trim());
```

with:

```tsx
  const profileComplete = isProfileComplete(user);
```

- [ ] **Step 3: Update the two usages**

Line 160:

```tsx
      {!profileComplete && (
```

Line 209:

```tsx
          {available.map((item) => renderCard(item, false, !profileComplete))}
```

- [ ] **Step 4: Confirm no stale references remain**

Run: `grep -n "isProfileComplete" app/discounts.tsx`
Expected: exactly one line — the import.

- [ ] **Step 5: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/discounts.tsx
git commit -m "fix: gate discounts on shared isProfileComplete check"
```

---

### Task 8: Delete the superseded migration script

**Files:**
- Delete: `scripts/migrate-town-names.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

Renamed towns are now re-picked by the user rather than rewritten in the database, so this script has no job. It also could not run as written — `mongodb` is not a dependency of this repo — and silently targeted the `test` database when the connection string had no path segment.

- [ ] **Step 1: Confirm nothing references it**

Run: `grep -rn "migrate-town-names" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" . | grep -v node_modules`
Expected: only the file itself, and possibly the spec. If `package.json` has a script entry pointing at it, remove that too.

- [ ] **Step 2: Delete the file**

```bash
git rm scripts/migrate-town-names.js
```

- [ ] **Step 3: Verify the app still builds**

Run: `npx tsc --noEmit && npm test`
Expected: clean, 12 tests passing.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove superseded town-rename migration script"
```

---

## Manual verification

Automated tests cover the predicate only. The value of this change is in what an existing user sees, so run these against a real build before merging. Seed users directly in Mongo.

- [ ] Seed a user with `city: "Islamabad"`, `town: "F-6"`, no `subArea`. Log in. **Expect:** modal appears.
- [ ] Tap **Later**. **Expect:** modal closes, location banner visible, brand cards locked, generic "complete your profile" banner *not* shown.
- [ ] Navigate away and back to home. **Expect:** modal does not reappear.
- [ ] Cold-start the app. **Expect:** modal appears again.
- [ ] Tap **Update now**. **Expect:** `editProfile` opens with town and sub-area blank — *not* pre-filled with "F-6" as free text.
- [ ] Tap Save immediately. **Expect:** "Town is required" validation error.
- [ ] Pick `Sector E-7`, then `E-7/1`, save. **Expect:** success, and on returning to home no modal, no banner, brand cards unlocked.
- [ ] Relaunch. **Expect:** still no prompt.
- [ ] Seed a second user with `city: "Islamabad"`, `town: "Sector E-7"`, no `subArea`. Log in. **Expect:** modal appears; `editProfile` shows town blank as well as sub-area (uniform clearing).
- [ ] Seed a user with `city: "Islamabad"`, `town: "Bani Gala"`. Log in. **Expect:** no modal (no sub-area data for that town).
- [ ] Seed a user with `townOther: "Some Village"` and empty `town`. Log in. **Expect:** no modal.
- [ ] Open the **Discounts** tab as a locked-out user. **Expect:** cards locked and the prompt shown there too — not availing normally.
- [ ] Sign out and sign in as a fully complete user. **Expect:** no modal.
- [ ] Cold-start a dev build; confirm the bundle builds and Reanimated animations still
  run. (This repo previously had no `babel.config.js` — Metro applied `babel-preset-expo`
  implicitly. `app.config.js` enables `experiments.reactCompiler`, and both
  `react-native-reanimated` and `react-native-worklets` depend on plugins that preset
  injects, so the new explicit config is worth confirming against a real build rather
  than trusting `tsc`/`jest` alone.)

## Out of scope

Tracked, not addressed here:

- No server-side `maxlength` / trim on `townOther` and `subAreaOther` (`Mint-Rewards-Backend/app/api/users/update-profile/route.ts`, `lib/models.ts:333-335`).
- `emailServices/profileNotComplete.ts` has no callers.
