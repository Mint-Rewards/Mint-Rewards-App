import { isPhone } from "@/utils/phone";

/**
 * The identity half of Edit Profile's validation, as a rule rather than a
 * block of ifs inside a 900-line screen.
 *
 * IT IS OUT HERE BECAUSE OF HOW IT WENT WRONG. `email` was required
 * unconditionally while being read-only for every account — which cost nothing
 * for as long as every account was created from an email address. Phone signup
 * produced accounts with none, and Edit Profile then could not be saved at
 * all: "Email is required" under a box nobody can type in. Profile completion,
 * the hundred-point bonus and being collectable at all were unreachable for
 * exactly the households phone signup was built for, and the only visible
 * symptom was a save that did nothing.
 *
 * So the rule, in one line: VALIDATE ONLY WHAT THE SCREEN CAN CHANGE. A save
 * refused over a field the user cannot edit is a dead end, not a prompt —
 * there is no action the message could be asking for.
 *
 * The server agrees by omission: `update-profile` leaves `email` out of both
 * of its allowlists, so the field could not have been saved even if it had
 * somehow been typed.
 */
export interface IdentityValues {
  userName: string;
  email: string;
  phone: string;
}

/**
 * Which of them this screen is showing as fixed.
 *
 * Passed in rather than derived, because the screen decides it from the
 * account's credentials and the two must not be able to disagree — that
 * disagreement is the bug above.
 */
export interface IdentityEditability {
  emailFixed: boolean;
  phoneFixed: boolean;
}

export type IdentityErrors = Partial<Record<keyof IdentityValues, string>>;

export function identityErrors(
  values: IdentityValues,
  { emailFixed, phoneFixed }: IdentityEditability,
): IdentityErrors {
  const errors: IdentityErrors = {};

  // Always editable, so always required.
  if (!values.userName.trim()) errors.userName = "Username is required";

  /*
   * Never REQUIRED, even when editable: an account that has no email is a
   * complete account — a security question is the way back in for those
   * households, and `canBeRecovered` accepts it. Checked for shape only, so a
   * typo in one that is being added is still caught.
   */
  if (!emailFixed && values.email.trim() && !/\S+@\S+\.\S+/.test(values.email)) {
    errors.email = "Please enter a valid email";
  }

  /*
   * Required where it is contact information the user owns, and not where it
   * is the credential they sign in with — that one is set at signup and
   * cannot be retyped here.
   */
  if (!phoneFixed) {
    if (!values.phone.trim()) errors.phone = "Phone number is required";
    else if (!isPhone(values.phone)) {
      errors.phone =
        "Please enter a valid phone number in the format 03XXXXXXXXX";
    }
  }

  return errors;
}
