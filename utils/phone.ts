/**
 * Phone-number helpers.
 *
 * Kept out of `utils/constants.ts` so they stay free of the Expo config and
 * `react-native` imports that module pulls in, and can be unit tested.
 */

/**
 * Strips everything a phone number cannot contain. Keeps digits and a single
 * leading "+" so international numbers survive; drops spaces, dashes, brackets
 * and the `*#,;` characters the `phone-pad` keyboard offers.
 */
export const sanitizePhone = (phone: string): string => {
  const digits = (phone || "").replace(/[^\d]/g, "");
  return (phone || "").trim().startsWith("+") ? `+${digits}` : digits;
};

/** True when the number has 10-15 digits once sanitized, matching E.164 limits. */
export const isPhone = (phone: string): boolean =>
  /^\d{10,15}$/.test(sanitizePhone(phone).replace(/^\+/, ""));
