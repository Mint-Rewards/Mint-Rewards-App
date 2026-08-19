import { describe, expect, it } from "@jest/globals";
import { isPhone, sanitizePhone } from "../utils/phone";

describe("sanitizePhone", () => {
  it("strips special characters the phone-pad keyboard offers", () => {
    expect(sanitizePhone("03*0#0;1,2 3-4(5)6 7")).toBe("03001234567");
  });

  it("keeps a single leading +", () => {
    expect(sanitizePhone("+92 300 1234567")).toBe("+923001234567");
    expect(sanitizePhone("9+2300")).toBe("92300");
  });

  it("handles empty input", () => {
    expect(sanitizePhone("")).toBe("");
  });
});

describe("isPhone", () => {
  it("accepts plain and international numbers", () => {
    expect(isPhone("03001234567")).toBe(true);
    expect(isPhone("+923001234567")).toBe(true);
  });

  it("rejects too short, too long and non-numeric input", () => {
    expect(isPhone("123456789")).toBe(false);
    expect(isPhone("1234567890123456")).toBe(false);
    expect(isPhone("abcdefghijk")).toBe(false);
    expect(isPhone("")).toBe(false);
  });
});
