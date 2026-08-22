/**
 * Password rules, shared by the screens that accept a new password.
 *
 * Kept out of `utils/constants.ts` so they stay free of the Expo config and
 * `react-native` imports that module pulls in, and can be unit tested.
 */

/** Minimum password length, mirrored by the backend. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Maximum password length. bcrypt silently truncates at 72 bytes, so cap well
 * below that rather than accepting input the hash would ignore.
 */
export const PASSWORD_MAX_LENGTH = 64;

export const isValidPassword = (password: string): boolean =>
  password.length >= PASSWORD_MIN_LENGTH &&
  password.length <= PASSWORD_MAX_LENGTH;

/**
 * Inline guidance for the password field: states the accepted range up front,
 * and flips to an error tone as soon as what has been typed falls outside it,
 * so the user is not first told at submit time.
 */
export const passwordHint = (
  password: string,
): { invalid: boolean; message: string } => {
  const range = `Must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`;
  if (password.length === 0) return { invalid: false, message: range };
  if (password.length < PASSWORD_MIN_LENGTH)
    return {
      invalid: true,
      message: `Too short - use at least ${PASSWORD_MIN_LENGTH} characters`,
    };
  if (password.length >= PASSWORD_MAX_LENGTH)
    return {
      invalid: true,
      message: `Maximum length reached - ${PASSWORD_MAX_LENGTH} characters`,
    };
  return { invalid: false, message: range };
};
