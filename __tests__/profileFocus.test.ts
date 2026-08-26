/**
 * The focus hint is a route parameter, so it is untrusted input — a deep link,
 * a link kept across a release that renamed a field, or a typo. It must degrade
 * to "open the form normally", never throw and never point at nothing.
 */
import { describe, expect, it } from "@jest/globals";
import {
  PROFILE_FOCUS_TARGETS,
  parseProfileFocus,
} from "@/utils/profileFocus";

describe("parseProfileFocus", () => {
  it.each(PROFILE_FOCUS_TARGETS)("accepts %s", (target) => {
    expect(parseProfileFocus(target)).toBe(target);
  });

  it("accepts the array form expo-router can hand back", () => {
    expect(parseProfileFocus(["phone"])).toBe("phone");
  });

  it("trims incidental whitespace from a hand-written link", () => {
    expect(parseProfileFocus(" pin ")).toBe("pin");
  });

  it.each([
    ["an unknown field", "middleName"],
    ["email, which is read-only and never outstanding", "email"],
    ["the empty string", ""],
    ["whitespace only", "   "],
  ])("returns null for %s", (_label, raw) => {
    expect(parseProfileFocus(raw)).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 3],
    ["an object", { focus: "phone" }],
    ["an empty array", []],
  ])("returns null for %s rather than throwing", (_label, raw) => {
    expect(() => parseProfileFocus(raw)).not.toThrow();
    expect(parseProfileFocus(raw)).toBeNull();
  });
});
