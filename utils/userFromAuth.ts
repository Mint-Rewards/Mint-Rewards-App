/**
 * One place that turns a login response into the user the store holds.
 *
 * There were three copies of this — app/login.tsx, app/register.tsx and the
 * email path in store/store.ts — each a hand-written list of fields to keep.
 * None of them listed `locationVersion`, so after any fresh sign-in the store
 * held a user whose location looked unconfirmed, and the gate asked someone
 * who had finished their address months ago for their house number again.
 *
 * It survived because `checkAuth()` stores the profile response whole, so the
 * next app open always repaired it. The bug only existed in the seconds after
 * a sign-in, and only on the one path a returning user actually takes — which
 * is why fixing two of the three copies changed nothing.
 *
 * The lesson is the duplication, not the missing field. A whitelist repeated
 * three times will drift again the next time the profile gains something, and
 * nothing would fail to tell us.
 */
import type { User } from "@/store/store";

/**
 * The shape both login endpoints return.
 *
 * `POST /api/users/login` nests the account under `user` and the token beside
 * it; `POST /api/auth/google` returns them flattened together with a `picture`
 * from Google. Callers unwrap to whichever object holds the account fields and
 * pass the extras separately.
 */
export interface AuthResponseUser {
  _id?: string;
  email?: string;
  userName?: string;
  phone?: string;
  isAdmin?: boolean;
  avatar?: string;
  address?: string;
  province?: string;
  city?: string;
  town?: string;
  townOther?: string;
  subArea?: string;
  subAreaOther?: string;
  mintId?: string;
  latitude?: string;
  longitude?: string;
  deviceToken?: string;
  points?: number;
  totalCollections?: string;
  totalWasteCollected?: string;
  referrals?: string[];
  firstTimeLogin?: boolean;
  emailVerified?: boolean;
  pickupHistory?: User["pickupHistory"];
  structuredAddress?: User["structuredAddress"];
  locationVersion?: number;
}

export interface UserFromAuthExtras {
  /** Already prefixed with "Bearer " by both endpoints. */
  token: string;
  /** Google's avatar, used only when the account has none of its own. */
  picture?: string;
  /** What the person typed, for the endpoint that echoes no email back. */
  fallbackEmail?: string;
}

export function userFromAuth(
  raw: AuthResponseUser,
  extras: UserFromAuthExtras,
): User {
  return {
    _id: raw._id,
    token: extras.token,
    email: raw.email || extras.fallbackEmail,
    userName: raw.userName,
    phone: raw.phone || "",
    isAdmin: raw.isAdmin || false,
    avatar: raw.avatar || extras.picture || "",
    address: raw.address || "",
    province: raw.province || "",
    city: raw.city || "",
    town: raw.town || "",
    townOther: raw.townOther || "",
    subArea: raw.subArea || "",
    subAreaOther: raw.subAreaOther || "",
    mintId: raw.mintId,
    latitude: raw.latitude || "",
    longitude: raw.longitude || "",
    deviceToken: raw.deviceToken || "",
    points: raw.points || 0,
    totalCollections: raw.totalCollections || "",
    totalWasteCollected: raw.totalWasteCollected || "",
    referrals: raw.referrals || [],
    firstTimeLogin: raw.firstTimeLogin || false,
    emailVerified: raw.emailVerified || false,
    pickupHistory: raw.pickupHistory || [],
    // The two the location gate reads. Absent here, the gate treats a
    // completed address as unconfirmed — see the note at the top of this file.
    structuredAddress: raw.structuredAddress,
    locationVersion: raw.locationVersion,
  };
}
