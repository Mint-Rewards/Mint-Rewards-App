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
};
