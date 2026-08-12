/**
 * Thin, non-throwing wrappers over the Sentry SDK.
 *
 * Every function here swallows its own failures. Telemetry sits inside catch
 * blocks and error paths all over this app — if a Sentry call could throw, it
 * would replace the original error with one from the reporter, which is the
 * worst possible outcome for debugging. Same policy as `reportFailure` in
 * components/UpdateGate.tsx and `sendLog` in utils/logger.ts.
 *
 * Sentry.init() lives in app/_layout.tsx. These helpers assume it has run;
 * if it hasn't, the SDK no-ops rather than throwing, which is also fine.
 */
import * as Sentry from "@sentry/react-native";

/** Keys that must never leave the device, whatever the caller passes. */
const REDACTED_KEYS =
  /token|password|secret|authorization|otp|latitude|longitude/i;

/**
 * Drops credential- and location-shaped fields from context.
 *
 * Callers pass loosely-typed `extra` bags assembled at the call site, so the
 * filter belongs here rather than being re-argued at each one. Location is
 * included because this app stores home coordinates: a crash report is not a
 * good reason to copy someone's address into a third-party service.
 */
function scrub(context?: Record<string, unknown>) {
  if (!context) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (REDACTED_KEYS.test(key)) continue;
    if (value === undefined) continue;
    safe[key] = value;
  }
  return safe;
}

/**
 * Reports an exception with structured context.
 *
 * `message` becomes the issue title when `error` is not an Error instance —
 * otherwise a rejected string or an API error object would group every
 * unrelated failure under one unreadable issue.
 */
export function captureError(
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
): void {
  try {
    const exception =
      error instanceof Error ? error : new Error(`${message}: ${String(error)}`);

    Sentry.withScope((scope) => {
      const safe = scrub(context);
      if (safe) scope.setContext("details", safe);
      // The message is set as a tag as well as the title: when `error` IS an
      // Error, the title comes from the error and the call-site label would
      // otherwise be lost.
      scope.setTag("origin", message);
      Sentry.captureException(exception);
    });
  } catch {
    // Reporting must never be the reason a catch block throws.
  }
}

/** Records a non-fatal condition worth counting but not worth an exception. */
export function captureWarning(
  message: string,
  context?: Record<string, unknown>,
): void {
  try {
    Sentry.withScope((scope) => {
      const safe = scrub(context);
      if (safe) scope.setContext("details", safe);
      Sentry.captureMessage(message, "warning");
    });
  } catch {
    // See above.
  }
}

/** Adds a trail entry that will be attached to whatever error follows. */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  try {
    Sentry.addBreadcrumb({
      category,
      message,
      level: "info",
      data: scrub(data),
    });
  } catch {
    // See above.
  }
}

/**
 * Attaches (or clears) the signed-in identity on all subsequent events.
 *
 * Passing null is as important as passing a user: without it, the next person
 * to sign in on a shared device inherits the previous one's identity on every
 * report.
 */
export function setSentryUser(
  user: { _id?: string; email?: string; mintId?: string } | null,
): void {
  try {
    if (!user?._id && !user?.email) {
      Sentry.setUser(null);
      return;
    }
    Sentry.setUser({
      id: user._id,
      email: user.email,
      username: user.mintId,
    });
  } catch {
    // See above.
  }
}
