/**
 * How a collection's day is named to the household.
 *
 * Shared rather than copied: the home card and the invitation card both say
 * when a round is, and two implementations of "tomorrow" is two chances for
 * one screen to say Saturday while the other says tomorrow.
 */

/** "Tomorrow" beats a date nobody should have to decode. */
export function whenLabel(date: string): string {
  // Parsed as LOCAL midnight, not UTC. `new Date("2026-09-25")` is UTC, and
  // in Karachi that is five hours before the day it names — which reads as
  // "yesterday" for part of every evening.
  const day = new Date(`${date}T00:00:00`);
  const today = new Date();
  const days = Math.round(
    (new Date(day).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
