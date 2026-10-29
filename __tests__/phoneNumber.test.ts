/// <reference types="jest" />

/**
 * One number, however it is written.
 *
 * A household reading their number off a SIM packet types `03001234567`. The
 * same household, prompted by a form that shows a country code, types
 * `+923001234567`. These are the same number and must reach the same account —
 * at sign-up, at sign-in, and in a sheet an agent hands to operations.
 *
 * The stored identity is E.164, so everything hinges on both spellings
 * normalising to it before any comparison happens. That was already true; what
 * was missing was anything stopping it from quietly stopping being true. A
 * regression here does not throw — it signs somebody out of their own account
 * and, worse, lets a second one be created for a number that already has one.
 */
import { normalizePhone } from "../utils/phoneNumber";

/** Every way the same Pakistani mobile gets written down. */
const SAME_NUMBER = [
  "03001234567", // off the SIM packet
  "+923001234567", // from a form that showed a country code
  "3001234567", // the 0 dropped
  "0092-300-1234567", // the old international prefix
  "+92 300 1234567", // spaced
  "+92-300-1234567", // dashed
  "0300 1234567", // spaced, local
  "(0300) 123-4567", // bracketed
  " 03001234567 ", // pasted with whitespace
];

describe("one number, however it is written", () => {
  it("resolves every spelling to the same stored identity", () => {
    const results = SAME_NUMBER.map((s) => normalizePhone(s));
    for (const [i, r] of results.entries()) {
      expect({ input: SAME_NUMBER[i], ok: r.ok }).toEqual({
        input: SAME_NUMBER[i],
        ok: true,
      });
    }
    const canonical = new Set(results.map((r) => (r.ok ? r.e164 : "REJECTED")));
    expect(canonical).toEqual(new Set(["+923001234567"]));
  });

  /*
   * THE ONE THAT PROTECTS ACCOUNTS. Signing up with one spelling and signing
   * in with the other has to find the same person. The server compares E.164,
   * so if these two ever diverge the second spelling silently becomes a
   * different account.
   */
  it("treats a leading 0 and a leading +92 as interchangeable", () => {
    const local = normalizePhone("03218889999");
    const international = normalizePhone("+923218889999");
    expect(local.ok && international.ok).toBe(true);
    expect(local.ok && local.e164).toBe(international.ok && international.e164);
  });

  it("is idempotent, so a normalised number can be fed back in", () => {
    const once = normalizePhone("03001234567");
    expect(once.ok).toBe(true);
    const twice = normalizePhone(once.ok ? once.e164 : "");
    expect(twice.ok && twice.e164).toBe(once.ok && once.e164);
  });
});

describe("what it still refuses", () => {
  /*
   * Accepting punctuation must not become accepting anything. These are the
   * cases where being lenient would create an account nobody can sign into.
   */
  it("refuses a number that is not Pakistani", () => {
    expect(normalizePhone("+14155550123").ok).toBe(false);
    expect(normalizePhone("+442071234567").ok).toBe(false);
  });

  it("refuses a Pakistani landline", () => {
    // Mobiles are 3XXXXXXXXX after the country code; 21 is Karachi's landline.
    expect(normalizePhone("+922134567890").ok).toBe(false);
    expect(normalizePhone("02134567890").ok).toBe(false);
  });

  it("refuses the wrong number of digits", () => {
    expect(normalizePhone("0300123456").ok).toBe(false); // one short
    expect(normalizePhone("030012345678").ok).toBe(false); // one long
  });

  it("refuses letters and emptiness", () => {
    expect(normalizePhone("not a number").ok).toBe(false);
    expect(normalizePhone("").ok).toBe(false);
    expect(normalizePhone(null).ok).toBe(false);
    expect(normalizePhone(undefined).ok).toBe(false);
  });

  it("says which kind of wrong it is", () => {
    // The messages differ because the fixes differ: use another number, or
    // check what you typed.
    const foreign = normalizePhone("+14155550123");
    expect(foreign.ok).toBe(false);
    expect(foreign.ok === false && foreign.message).toMatch(/Pakistani/i);
  });
});

describe("reading it back", () => {
  /*
   * E.164 is for storage and comparison. What goes on a confirmation screen
   * is the form the household recognises as their own number.
   */
  it("returns the local form a person would recognise", () => {
    const r = normalizePhone("+923001234567");
    expect(r.ok && r.national).toBe("0300 1234567");
  });

  it("gives the same local form whichever way it was typed", () => {
    const a = normalizePhone("03001234567");
    const b = normalizePhone("+92 300 1234567");
    expect(a.ok && a.national).toBe(b.ok && b.national);
  });
});
