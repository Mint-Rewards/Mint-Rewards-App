const expoPreset = require("jest-expo/jest-preset");

module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
  // Excludes git worktrees under .claude/worktrees, which check out this same
  // repo (same package name) — without this, Haste sees two modules with an
  // identical name and throws a naming-collision error.
  modulePathIgnorePatterns: ["<rootDir>/.claude/worktrees"],
  // jest-expo's preset un-ignores "@sentry/react-native" but not the
  // "@sentry/core" and "@sentry/browser" packages it re-exports, which ship
  // untranspiled ESM — so any test that reaches utils/sentry.ts (now including
  // anything importing store/store.ts, utils/api.ts or utils/logger.ts) dies
  // on "Unexpected token 'export'". Widening the existing pattern to the whole
  // @sentry scope fixes all of them, and deriving it from the preset means an
  // expo upgrade that changes the list doesn't silently strip our edit.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace("@sentry/react-native", "@sentry"),
  ),
};
