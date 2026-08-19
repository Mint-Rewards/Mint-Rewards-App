import { describe, expect, it } from "@jest/globals";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isValidPassword,
  passwordHint,
} from "@/utils/password";

const of = (length: number) => "a".repeat(length);

describe("isValidPassword", () => {
  it("accepts lengths inside the range, inclusive", () => {
    expect(isValidPassword(of(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(isValidPassword(of(PASSWORD_MAX_LENGTH))).toBe(true);
  });

  it("rejects lengths outside the range", () => {
    expect(isValidPassword(of(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(isValidPassword(of(PASSWORD_MAX_LENGTH + 1))).toBe(false);
    expect(isValidPassword("")).toBe(false);
  });
});

describe("passwordHint", () => {
  it("states the range without an error while the field is empty", () => {
    const hint = passwordHint("");
    expect(hint.invalid).toBe(false);
    expect(hint.message).toContain(`${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH}`);
  });

  it("flags a password that is still too short", () => {
    expect(passwordHint(of(PASSWORD_MIN_LENGTH - 1))).toEqual({
      invalid: true,
      message: `Too short - use at least ${PASSWORD_MIN_LENGTH} characters`,
    });
  });

  it("flags reaching the cap, since maxLength blocks further typing", () => {
    expect(passwordHint(of(PASSWORD_MAX_LENGTH)).invalid).toBe(true);
  });

  it("is quiet for a valid password", () => {
    expect(passwordHint(of(PASSWORD_MIN_LENGTH + 1)).invalid).toBe(false);
  });
});
