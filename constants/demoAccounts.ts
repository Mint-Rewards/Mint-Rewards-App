// Accounts that see the demo past-pickups/scheduling content. Everyone
// else sees the existing hardcoded empty state / static home card,
// unchanged. Case-insensitive, trimmed compare against user.email.
export const DEMO_COLLECTIONS_EMAILS: string[] = [
  // PLACEHOLDER — fill in with the real accounts before shipping.
  "hamiyim432@kierko.com",
  "ifrahchishti2004@gmail.com"
  // "REPLACE_WITH_EMAIL_2",
];

export function isDemoCollectionsUser(email: string | undefined | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return DEMO_COLLECTIONS_EMAILS.some((e) => e.trim().toLowerCase() === normalized);
}
