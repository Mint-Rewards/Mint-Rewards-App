/**
 * Only validate what the screen can change.
 *
 * Edit Profile required an email address unconditionally while showing the
 * field read-only to everybody. That cost nothing for as long as every account
 * was created from an email address. Phone signup produced accounts with none,
 * and the screen then could not be saved at all — "Email is required" under a
 * box nobody can type in — so profile completion, the hundred-point bonus and
 * being collectable were unreachable for exactly the households phone signup
 * was built for. QA found it; nothing here would have.
 */
import { describe, expect, it } from "@jest/globals";
import { identityErrors } from "@/utils/identityValidation";

const PHONE_ONLY = {
  values: { userName: "Ayesha", email: "", phone: "03001234567" },
  // Signs in with the number; has no email at all.
  editability: { emailFixed: true, phoneFixed: true },
};

const EMAIL_ACCOUNT = {
  values: { userName: "Ayesha", email: "ayesha@example.com", phone: "03001234567" },
  // Signs in with the address; the number is contact information they own.
  editability: { emailFixed: true, phoneFixed: false },
};

describe("identityErrors", () => {
  /* THE BUG. Everything else here is to stop the fix going too far. */
  it("lets a phone-only account with no email save", () => {
    expect(identityErrors(PHONE_ONLY.values, PHONE_ONLY.editability)).toEqual(
      {},
    );
  });

  it("never asks for an email, even from an account that could type one", () => {
    for (const emailFixed of [true, false]) {
      expect(
        identityErrors(
          { userName: "Ayesha", email: "", phone: "03001234567" },
          { emailFixed, phoneFixed: true },
        ).email,
      ).toBeUndefined();
    }
  });

  /*
   * The same deadlock by the other door, and it nearly happened: bulk
   * onboarding created accounts whose `phone` column was empty, and a
   * read-only empty box with "Phone number is required" under it is the
   * identical trap. The data was repaired; this keeps the screen from
   * depending on that.
   */
  it("does not ask for a phone number it is showing as fixed", () => {
    expect(
      identityErrors(
        { userName: "Ayesha", email: "", phone: "" },
        { emailFixed: true, phoneFixed: true },
      ),
    ).toEqual({});
  });

  it("still requires a phone number from the accounts that can edit it", () => {
    expect(
      identityErrors(
        { ...EMAIL_ACCOUNT.values, phone: "" },
        EMAIL_ACCOUNT.editability,
      ).phone,
    ).toBe("Phone number is required");
  });

  it("still rejects a malformed phone number from those accounts", () => {
    expect(
      identityErrors(
        { ...EMAIL_ACCOUNT.values, phone: "12345" },
        EMAIL_ACCOUNT.editability,
      ).phone,
    ).toContain("03XXXXXXXXX");
  });

  it("accepts a well-formed one", () => {
    expect(identityErrors(EMAIL_ACCOUNT.values, EMAIL_ACCOUNT.editability)).toEqual(
      {},
    );
  });

  it("requires a username, which is always editable", () => {
    for (const userName of ["", "   "]) {
      expect(
        identityErrors({ ...PHONE_ONLY.values, userName }, PHONE_ONLY.editability)
          .userName,
      ).toBe("Username is required");
    }
  });

  /*
   * Shape is still checked on an email somebody is adding — optional is not
   * the same as unchecked. Only reachable once the field is editable, which it
   * is not yet; the rule is written so that change is one flag.
   */
  it("checks the shape of an email being typed into an editable field", () => {
    expect(
      identityErrors(
        { userName: "Ayesha", email: "not-an-address", phone: "03001234567" },
        { emailFixed: false, phoneFixed: true },
      ).email,
    ).toBe("Please enter a valid email");

    expect(
      identityErrors(
        { userName: "Ayesha", email: "a@b.co", phone: "03001234567" },
        { emailFixed: false, phoneFixed: true },
      ).email,
    ).toBeUndefined();
  });
});
