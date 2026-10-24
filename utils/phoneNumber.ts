/**
 * Pakistani mobile numbers, for immediate feedback while typing.
 *
 * A DELIBERATELY PARTIAL MIRROR of lib/phoneNumber.ts in the backend. The
 * server is authoritative and re-validates everything; this exists so a typo
 * is caught before a round trip, not so the client can decide anything.
 *
 * Kept narrow for that reason. Where the two could drift, the rule lives on
 * the server only — see `pinShapeError` below, which checks that a PIN is six
 * digits and nothing more. The backend additionally refuses sequences,
 * repeats, dates and a denylist of common PINs; duplicating that list here
 * would mean two copies disagreeing the first time either changed, and the
 * server already returns a message good enough to show.
 */

/** Canonical form: +92 followed by a 10-digit mobile number starting 3. */
const PK_MOBILE = /^3\d{9}$/;

export type PhoneResult =
  | { ok: true; e164: string; national: string }
  | { ok: false; message: string };

/**
 * `+923001234567` from whatever the person typed.
 *
 * Accepts `03001234567`, `3001234567`, `+92 300 1234567`, `0092-300-1234567`
 * and the same with spaces, dashes or brackets — somebody reading a number off
 * a SIM packet types what they see, and refusing them over punctuation loses a
 * household for no reason.
 */
export function normalizePhone(input: string | null | undefined): PhoneResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, message: "Enter your mobile number." };

  if (/[A-Za-z]/.test(raw)) {
    return { ok: false, message: "That does not look like a phone number." };
  }

  let digits = raw.replace(/[^\d]/g, "");

  // 0092… and 92… both mean the country code; 0300… is the local form.
  if (digits.startsWith("0092")) digits = digits.slice(4);
  else if (digits.startsWith("92")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  if (!PK_MOBILE.test(digits)) {
    return {
      ok: false,
      message: "Enter a Pakistani mobile number, starting 03 or +92 3.",
    };
  }

  return {
    ok: true,
    e164: `+92${digits}`,
    national: `0${digits.slice(0, 3)} ${digits.slice(3)}`,
  };
}

/** Digits and length only. The server judges whether a PIN is a GOOD one. */
export const PIN_LENGTH = 6;

export function pinShapeError(pin: string): string | null {
  if (!pin) return "Choose a PIN.";
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    return `Your PIN must be ${PIN_LENGTH} digits.`;
  }
  return null;
}
