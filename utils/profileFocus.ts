/**
 * Which field Edit Profile should jump to when it opens.
 *
 * The gate's checklist names a gap; tapping it routes to the screen that can
 * fill it. Carrying WHICH gap across that navigation is what stops the user
 * landing at the top of a long form and hunting for the thing they just tapped.
 *
 * The value travels as a route parameter, which makes it untrusted input: a
 * deep link, a stale link kept across a release that renamed a field, or a
 * typo all arrive here. So it is parsed rather than cast, and anything
 * unrecognised degrades to null — "just open the form normally". A bad focus
 * hint must never be able to stop the screen rendering.
 */

/**
 * The focusable destinations, which are the CHECKLIST's rows and not the form's
 * fields — the two are deliberately different shapes.
 *
 * `address` covers city, town, sub-area and house number: one question to a
 * person ("where do we collect from"), four inputs on screen. `pin` is separate
 * because it is its own interaction. `email` is absent on purpose: it comes
 * from signup, is read-only on the form, and can never be the outstanding item.
 */
export const PROFILE_FOCUS_TARGETS = [
  "userName",
  "phone",
  "address",
  "pin",
] as const;

export type ProfileFocusTarget = (typeof PROFILE_FOCUS_TARGETS)[number];

/**
 * Reads a route param into a focus target, or null when it names nothing.
 *
 * Accepts the array form too: expo-router hands back `string | string[]`
 * depending on how the param was set, and a caller that only handled `string`
 * would silently ignore a perfectly good value.
 */
export function parseProfileFocus(raw: unknown): ProfileFocusTarget | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return (PROFILE_FOCUS_TARGETS as readonly string[]).includes(trimmed)
    ? (trimmed as ProfileFocusTarget)
    : null;
}
