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

/** True when the number matches the local Pakistani format: 03XXXXXXXXX (11 digits, starts with 03). */
export const isPhone = (phone: string): boolean =>
  /^03\d{9}$/.test(sanitizePhone(phone).replace(/^\+/, ""));
