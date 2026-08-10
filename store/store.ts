import { logAuthEvent, logError, logEvent } from "@/utils/logger";
import { authenticatedFetch } from "@/utils/api";
import { API_BASE_URL } from "@/utils/constants";
import { setUnauthorizedHandler } from "@/utils/session";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const API_URL = API_BASE_URL;

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type OtpErrorCode =
  | "RATE_LIMITED"
  | "ATTEMPTS_EXHAUSTED"
  | "INVALID_SESSION"
  | "ACCOUNT_NOT_FOUND";

export interface OtpResult {
  Status: "Success" | "Error";
  Message?: string;
  ErrorMessage?: string;
  code?: OtpErrorCode;
  retryAfterSeconds?: number;
  token?: string;
  resetToken?: string;
}

async function classifyErrorResponse(
  response: Response,
  data: any,
  fallbackMessage: string,
): Promise<OtpResult> {
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      return {
        Status: "Error",
        ErrorMessage: data?.error || "Too many requests. Please try again later.",
        code: "RATE_LIMITED",
        retryAfterSeconds: parseInt(retryAfter, 10) || 60,
      };
    }
    return {
      Status: "Error",
      ErrorMessage: data?.error || "Too many attempts. Request a new code.",
      code: "ATTEMPTS_EXHAUSTED",
    };
  }
  if (response.status === 401) {
    return {
      Status: "Error",
      ErrorMessage: data?.error || "Invalid or expired reset session.",
      code: "INVALID_SESSION",
    };
  }
  return { Status: "Error", ErrorMessage: data?.error || data?.message || fallbackMessage };
}

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

export interface User {
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
  referrals?: any[];
  firstTimeLogin?: boolean;
  emailVerified?: boolean;
  pickupHistory?: any[];
  token?: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  userName: string;
  phone: string;
  province: string;
  city: string;
  /**
   * Canonical town. Only ever holds a value from `getTownsForCity(city)`, or
   * "". Mutually exclusive with `townOther`.
   */
  town: string;
  /**
   * Free-text town for users whose town isn't in the canonical list. Trimmed
   * and capped at 100 chars. Mutually exclusive with `town`.
   */
  townOther?: string;
  /**
   * Canonical block/sector/phase. Only ever holds a value returned by
   * `getSubAreasForTown(city, town)` in utils/pakistan_areas.ts — never free
   * text. Mutually exclusive with `subAreaOther`.
   */
  subArea?: string;
  /**
   * Free-text sub-area for users whose area isn't in the canonical list.
   * Trimmed and capped at 100 chars. Captured for review, not for
   * segmentation. Mutually exclusive with `subArea`.
   */
  subAreaOther?: string;
  address: string;
  email: string;
  latitude?: string;
  longitude?: string;
}

// Brand Types
export interface Brand {
  _id: string;
  companyName: string;
  brandName: string;
  email: string;
  logo?: string;
  themeImage?: string;
  category: string;
  description?: string;
  address?: string;
  webLink: string;
  appLink?: string;
  contactName: string;
  phone: string;
  registrationNumber?: string;
  domain?: string;
  themeColor?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  role?: string;
  emailVerified?: boolean;
}

export interface BrandTheme {
  _id: string;
  companyName: string;
  logo: string;
  category?: string;
  themeColor: string;
  accentColor: string;
  status?: string;
}

/**
 * A Deal — the consumer incentive, i.e. "what do I get". Served by
 * GET /api/users/deals from the backend's `deals` collection.
 *
 * Vocabulary (see the backend's docs/VOCABULARY.md):
 *   Deal     — the umbrella term for any consumer incentive.
 *   Discount — one TYPE of Deal: a price reduction, by percentage
 *              (discountPercentage) or fixed amount (discountAmount).
 *   Coupon   — only the redemption mechanism: the `code` below, and the PDF
 *              voucher built from it.
 *   Campaign — a sustainability/recycling programme. NOT an incentive, and
 *              deliberately not surfaced in this app.
 *
 * `codes` is never sent to the client: the inventory is the thing being
 * rationed. A user receives exactly one code, from the redeem endpoint.
 */
export interface Deal {
  _id: string;
  title: string;
  description: string;
  // Numbers here, unlike the string the campaign-backed payload used to carry.
  discountPercentage: number | null;
  discountAmount: number | null;
  minimumPurchase: number | null;
  // Nullable: a deal need not be date-bounded at either end.
  startDate: string | null;
  endDate: string | null;
  brand: {
    _id: string;
    companyName: string;
    brandName?: string;
    logo?: string;
    themeColor?: string;
    category?: string;
  };
  isAvailed: boolean;
  // Present only once this user has claimed the deal.
  code: string | null;
  // Every code goes to exactly one user, so a deal can genuinely run out.
  soldOut: boolean;
}

// ============================================================================
// STORE INTERFACES
// ============================================================================

interface UserSlice {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  /**
   * True once the location-update modal has been shown and dismissed this
   * session. Deliberately not persisted: a cold start should prompt again,
   * because the user has not re-picked their town yet and would otherwise sit
   * behind a locked brand list with no explanation.
   *
   * Only reset in `signOut` (not on login) — safe today only because every
   * login is preceded by either a cold start or a `signOut`, so the flag is
   * already `false` by the time a new user's data lands. That invariant lives
   * outside this file with no compiler or runtime check; revisit this if
   * in-app account switching (login without an intervening sign-out) lands.
   */
  locationPromptShown: boolean;
  dismissLocationPrompt: () => void;
  setUserData: (userData: Partial<User>) => void;
  getProfile: () => Promise<void>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ Status: string; ErrorMessage?: string }>;
  signUp: (
    email: string,
    password: string,
    userName: string,
    phone: string,
    province: string,
    city: string,
    town: string,
  ) => Promise<{
    Status: string;
    Message?: string;
    ErrorMessage?: string;
    code?: OtpErrorCode;
    retryAfterSeconds?: number;
  }>;
  signOut: () => Promise<void>;
  resendVerificationOtp: (email: string) => Promise<OtpResult>;
  verifyEmailOtp: (email: string, otp: string) => Promise<OtpResult>;
  forgotPassword: (email: string) => Promise<OtpResult>;
  verifyOTP: (email: string, otp: string) => Promise<OtpResult>;
  setPassword: (resetToken: string, password: string) => Promise<OtpResult>;
  deleteAccount: () => Promise<{
    Status: string;
    Message?: string;
    ErrorMessage?: string;
  }>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  wasteToCo2: () => Promise<number>;
}

interface ProfileSlice {
  profile: UserProfile | null;
  isProfileLoading: boolean;
  profileError: string | null;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{
    Status: string;
    Message?: string;
    ErrorMessage?: string;
  }>;
  setProfileLoading: (loading: boolean) => void;
  setProfileError: (error: string | null) => void;
  sendRefferal: (referralEmails: string[]) => Promise<{
    Status: string;
    Message?: string;
    ErrorMessage?: string;
  }>;
}

/**
 * The app's only consumer-incentive surface.
 *
 * This replaces the old DiscountSlice + CampaignSlice pair, both of which read
 * campaign documents (/api/users/my-discounts and /api/users/active-campaigns)
 * and presented them as consumer offers. A Campaign is a recycling programme,
 * not an incentive, so the app now reads deals and nothing else.
 *
 * One fetch backs every surface: the deals payload embeds the brand on each
 * row, so the brand lists on home and the brand-detail screen are derived from
 * `deals` rather than fetched separately.
 */
interface DealSlice {
  deals: Deal[];
  isDealsLoading: boolean;
  dealsError: string | null;
  getDeals: () => Promise<Deal[]>;
  /**
   * Every APPROVED brand, whether or not it currently has a live deal.
   *
   * Kept separate from `deals` rather than folded into it: a brand's presence
   * in the app follows BrandHub approval, and a deal's presence follows deal
   * moderation plus its dates. Merging the two into one payload would tie a
   * brand's visibility back to its deals, which is the bug this exists to fix.
   */
  brands: Deal["brand"][];
  isBrandsLoading: boolean;
  brandsError: string | null;
  getBrands: () => Promise<Deal["brand"][]>;
  /**
   * Claims one code for this deal. Idempotent per user: re-claiming returns
   * the same code rather than consuming another.
   */
  redeemDeal: (dealId: string) => Promise<{ code: string } | { error: string }>;
}

/**
 * CO₂ saved for a given weight of recycled waste, rounded to 2dp. Exported so
 * screens showing a waste figure that did NOT come from `user.totalWasteCollected`
 * (the demo mock totals on home) derive CO₂ with the same factor as
 * `wasteToCo2` instead of keeping their own copy of 0.21.
 */
export function co2FromWasteKg(wasteKg: number): number {
  return Math.round((wasteKg * 0.21 + Number.EPSILON) * 100) / 100;
}

/**
 * The one upcoming collection the user has scheduled. Demo-only (see
 * constants/mockCollectionsData.ts). Kept in the store rather than a screen's
 * useState so it survives navigation between /collections and the home tab, and
 * persisted to SecureStore so it survives logout and app restarts.
 */
export interface ScheduledCollection {
  collectionId: string;
  slotId: string;
  /**
   * Always "pending" internally — the UI renders it as "Scheduled"
   * (see upcomingStatusLabel in constants/mockCollectionsData.ts).
   */
  status: "pending";
}

interface DemoCollectionsSlice {
  scheduledCollection: ScheduledCollection | null;
  /** No-op when one is already scheduled: a user gets exactly one pickup. */
  scheduleCollection: (collectionId: string, slotId: string) => Promise<void>;
  /**
   * Rehydrates `scheduledCollection` for the signed-in user. Safe to call on
   * every mount; screens that show the schedule call it in an effect.
   */
  loadScheduledCollection: () => Promise<void>;
}

/**
 * Per-user SecureStore key for the demo schedule.
 *
 * Deliberately NOT deleted in signOut (the owner asked for the schedule to
 * survive logout), which is the same exemption `appleFullName_<id>` already
 * has. Scoping the key to the user id is what makes that safe: a second
 * account signing in on the same device reads its own key, not the previous
 * user's booking. SecureStore keys allow only [A-Za-z0-9._-], so the fallback
 * to email is sanitised.
 */
function scheduledCollectionKey(user: User | null): string {
  const identity = user?._id || user?.email || "anonymous";
  return `demoScheduledCollection_${identity.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/** Narrows an unknown parsed JSON blob back to a ScheduledCollection. */
function parseScheduledCollection(raw: string): ScheduledCollection | null {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.collectionId === "string" && typeof parsed?.slotId === "string"
      ? { collectionId: parsed.collectionId, slotId: parsed.slotId, status: "pending" }
      : null;
  } catch {
    return null;
  }
}

// ============================================================================
// STORE
// ============================================================================
type AppStore = UserSlice &
  ProfileSlice &
  DealSlice &
  DemoCollectionsSlice;

export const useAppStore = create<AppStore>((set, get) => ({
  // ========================================================================
  // USER SLICE
  // ========================================================================
  user: null,
  token: null,
  isLoading: false,
  error: null,
  locationPromptShown: false,

  dismissLocationPrompt: () => set({ locationPromptShown: true }),

  setUserData: (userData) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...userData } : { ...userData },
      token: userData.token || state.token,
    })),

  getProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const token =
        get().user?.token || (await SecureStore.getItemAsync("userToken"));

      if (!token) throw new Error("No authentication token found");

      const response = await authenticatedFetch(`${API_URL}/api/users/my-profile`, {
        method: "GET",
        headers: { "Content-Type": "application/json", Authorization: token },
      });
      const data = await response.json();

      if (response.ok) {
        set({
          user: data.user,
          token: token,
          isLoading: false,
          error: null,
        });
      } else {
        await logError("getProfile failed", {
          userId: get().user?.mintId,
          // extra: { status: response.status },
        });
        set({ user: null, isLoading: false, error: data.message });
      }
    } catch (error) {
      await logError("getProfile exception", { error });
      set({ user: null, isLoading: false, error: "Failed to fetch user" });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (response.ok) {
        const user: User = {
          _id: data.user._id,
          token: data.token,
          email: data.user.email || email,
          userName: data.user.userName,
          phone: data.user.phone,
          isAdmin: data.user.isAdmin || false,
          avatar: data.user.avatar,
          address: data.user.address,
          province: data.user.province,
          city: data.user.city,
          town: data.user.town,
          townOther: data.user.townOther,
          subArea: data.user.subArea,
          subAreaOther: data.user.subAreaOther,
          mintId: data.user.mintId,
          latitude: data.user.latitude,
          longitude: data.user.longitude,
          deviceToken: data.user.deviceToken,
          points: data.user.points,
          totalCollections: data.user.totalCollections,
          totalWasteCollected: data.user.totalWasteCollected,
          referrals: data.user.referrals,
          firstTimeLogin: data.user.firstTimeLogin || false,
          emailVerified: data.user.emailVerified || false,
          pickupHistory: data.user.pickupHistory,
        };

        set({ user, isLoading: false, error: null, token: data.token });

        await SecureStore.setItemAsync("userToken", data.token);
        await SecureStore.setItemAsync("userEmail", email);
        await SecureStore.setItemAsync("userName", data.user.userName);
        await SecureStore.setItemAsync(
          "userPoints",
          String(data.user.points || 0),
        );

        // ✅ Log successful login
        await logAuthEvent("LOGIN", data.user._id, { email });

        return { Status: "Success", ...data };
      } else {
        const errorMessage =
          data.error || data.message || "Login failed. Please try again.";
        set({ error: errorMessage, isLoading: false });

        // ✅ Log failed login attempt
        await logEvent("API_ERROR", {
          level: "warn",
          extra: { event: "LOGIN_FAILED", email, reason: errorMessage },
        });

        return { Status: "Error", ErrorMessage: errorMessage };
      }
    } catch (error: any) {
      const errorMessage =
        error?.name === "AbortError"
          ? "Request timed out. Please check your connection and try again."
          : "Network error. Please check your connection and try again.";
      set({ error: errorMessage, isLoading: false });
      await logError("signIn exception", { error });
      return { Status: "Error", ErrorMessage: errorMessage };
    }
  },

  signUp: async (email, password, userName, phone, province, city, town) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/users/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          confirmPassword: password,
          userName,
          phone,
          address: "",
          province,
          city,
          town,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        set({ isLoading: false, error: null });

        // ✅ Log successful registration
        await logAuthEvent("REGISTER", data.user._id, { email, userName });

        return {
          Status: "Success",
          Message: "Account created successfully",
          ...data,
        };
      } else {
        // 429 is handled explicitly rather than through classifyErrorResponse:
        // that helper maps 401 to "invalid or expired reset session", which is
        // meaningless on signup. Signup's rate-limit windows are hourly, so
        // retryAfterSeconds here is minutes-to-an-hour scale, not the ~60s the
        // OTP screens deal in.
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const errorMessage =
            data.error ||
            data.message ||
            "Too many signup attempts. Please try again later.";
          set({ error: errorMessage, isLoading: false });

          await logEvent("API_ERROR", {
            level: "warn",
            extra: { event: "REGISTER_RATE_LIMITED", email, reason: errorMessage },
          });

          return {
            Status: "Error",
            ErrorMessage: errorMessage,
            code: "RATE_LIMITED",
            retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) || 3600 : 3600,
          };
        }

        const errorMessage =
          data.error ||
          data.message ||
          "Registration failed. Please try again.";
        set({ error: errorMessage, isLoading: false });

        await logEvent("API_ERROR", {
          level: "warn",
          extra: { event: "REGISTER_FAILED", email, reason: errorMessage },
        });

        return { Status: "Error", ErrorMessage: errorMessage };
      }
    } catch (error: any) {
      const errorMessage =
        error?.name === "AbortError"
          ? "Request timed out. Please check your connection and try again."
          : "Network error. Please check your connection and try again.";
      set({ error: errorMessage, isLoading: false });
      await logError("signUp exception", { error });
      return { Status: "Error", ErrorMessage: errorMessage };
    }
  },

  deleteAccount: async () => {
    set({ isLoading: true, error: null });
    try {
      const token = get().token || get().user?.token;
      const email = get().user?.email;
      const response = await authenticatedFetch(`${API_URL}/api/users/delete-account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ email }),
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch {
        // 204 No Content or empty body — treat as success if response.ok
      }

      if (response.ok) {
        const user = get().user;
        await logEvent("ACCOUNT_DELETED", {
          userId: user?.mintId,
          userEmail: user?.email,
        });
        set({ isLoading: false, error: null });
        return { Status: "Success", Message: "Account deleted successfully" };
      } else {
        const errorMessage = data?.error || data?.message || `Deletion failed (${response.status})`;
        console.log("[deleteAccount] failed:", response.status, JSON.stringify(data));
        set({ error: errorMessage, isLoading: false });
        return { Status: "Error", ErrorMessage: errorMessage };
      }
    } catch (error) {
      const errorMessage = "Network error. Please try again.";
      set({ error: errorMessage, isLoading: false });
      await logError("deleteAccount exception", {
        userId: get().user?.mintId,
        error,
      });
      return { Status: "Error", ErrorMessage: errorMessage };
    }
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync("userToken");
    await SecureStore.deleteItemAsync("userEmail");
    await SecureStore.deleteItemAsync("userName");
    await SecureStore.deleteItemAsync("userPoints");
    // ✅ Log logout event
    await logAuthEvent("LOGOUT", get().user?._id ?? "", {
      email: get().user?.email,
    });
    // scheduledCollection clears from memory so the next account never sees the
    // previous user's booking, but its SecureStore key is deliberately left in
    // place (see scheduledCollectionKey): the schedule must survive logout, and
    // loadScheduledCollection rehydrates it when its owner signs back in.
    set({
      user: null,
      token: null,
      error: null,
      scheduledCollection: null,
      locationPromptShown: false,
    });
  },

  resendVerificationOtp: async (email) => {
    try {
      const response = await fetch(`${API_URL}/api/users/resend-verification-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await logEvent("EMAIL_VERIFY_RESEND", { extra: { email } });
        return {
          Status: "Success",
          Message:
            data.message ||
            "If an unverified account exists for that email, a new code has been sent.",
        };
      }
      return await classifyErrorResponse(response, data, "Failed to resend code. Please try again.");
    } catch (error) {
      await logError("resendVerificationOtp exception", { error });
      return { Status: "Error", ErrorMessage: "Network error. Please try again." };
    }
  },

  verifyEmailOtp: async (email, otp) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/api/users/verify-email-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        // Keep the header value verbatim ("Bearer <jwt>"), the same shape signIn
        // stores — the API requires the Bearer scheme and rejects a bare token.
        const sessionToken = String(data.token || "");
        set({ token: sessionToken });

        await SecureStore.setItemAsync("userToken", sessionToken);
        await SecureStore.setItemAsync("userEmail", email);
        await get().getProfile();

        const verifiedUser = get().user;
        if (verifiedUser?.userName) {
          await SecureStore.setItemAsync("userName", verifiedUser.userName);
        }
        await SecureStore.setItemAsync("userPoints", String(verifiedUser?.points || 0));

        await logAuthEvent("EMAIL_VERIFIED", verifiedUser?._id ?? "", { email });
        set({ isLoading: false, error: null });
        return { Status: "Success", Message: data.message, token: sessionToken };
      }

      await logEvent("OTP_VERIFY", {
        level: "warn",
        extra: { email, success: false, flow: "email_verify" },
      });
      const result = await classifyErrorResponse(response, data, "Invalid or expired code.");
      set({ isLoading: false, error: result.ErrorMessage ?? null });
      return result;
    } catch (error) {
      const errorMessage = "Network error. Please try again.";
      set({ error: errorMessage, isLoading: false });
      await logError("verifyEmailOtp exception", { error });
      return { Status: "Error", ErrorMessage: errorMessage };
    }
  },

  forgotPassword: async (email) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/api/users/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await logEvent("PASSWORD_RESET", { extra: { email, stage: "request_sent" } });
        set({ isLoading: false });
        return {
          Status: "Success",
          Message: data.message || "A reset code has been sent.",
        };
      }

      // Handled here rather than in classifyErrorResponse: that helper serves five
      // call sites, and teaching it to read every 404 as "no account" would make a
      // missing or misdeployed route render as a confidently wrong message. A
      // route-missing 404 carries no `code`, so it falls through to the generic path.
      if (response.status === 404 && data?.code === "ACCOUNT_NOT_FOUND") {
        const errorMessage = data.error || "No account found for that email.";
        set({ isLoading: false, error: errorMessage });
        return {
          Status: "Error",
          ErrorMessage: errorMessage,
          code: "ACCOUNT_NOT_FOUND",
        };
      }

      const result = await classifyErrorResponse(response, data, "Failed to send reset code. Please try again.");
      set({ isLoading: false, error: result.ErrorMessage ?? null });
      return result;
    } catch (error) {
      const errorMessage = "Network error. Please try again.";
      set({ error: errorMessage, isLoading: false });
      await logError("forgotPassword exception", { error });
      return { Status: "Error", ErrorMessage: errorMessage };
    }
  },

  verifyOTP: async (email, otp) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/api/users/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        await logEvent("OTP_VERIFY", { extra: { email, success: true, flow: "reset" } });
        set({ isLoading: false, error: null });
        return { Status: "Success", resetToken: data.resetToken };
      }

      await logEvent("OTP_VERIFY", {
        level: "warn",
        extra: { email, success: false, flow: "reset" },
      });
      const result = await classifyErrorResponse(response, data, "Invalid or expired code.");
      set({ isLoading: false, error: result.ErrorMessage ?? null });
      return result;
    } catch (error) {
      const errorMessage = "Network error. Please try again.";
      set({ error: errorMessage, isLoading: false });
      await logError("verifyOTP exception", { error });
      return { Status: "Error", ErrorMessage: errorMessage };
    }
  },

  setPassword: async (resetToken, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/api/users/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        set({ isLoading: false, error: null });
        return { Status: "Success", Message: data.message || "Password successfully updated." };
      }

      const result = await classifyErrorResponse(response, data, "Failed to update password. Please try again.");
      set({ isLoading: false, error: result.ErrorMessage ?? null });
      return result;
    } catch (error) {
      const errorMessage = "Network error. Please try again.";
      set({ error: errorMessage, isLoading: false });
      await logError("setPassword exception", { error });
      return { Status: "Error", ErrorMessage: errorMessage };
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  wasteToCo2: async () => {
    const user = get().user;
    if (user?.totalWasteCollected) {
      return co2FromWasteKg(parseFloat(user.totalWasteCollected));
    }
    return 0;
  },

  // ========================================================================
  // PROFILE SLICE
  // ========================================================================
  profile: null,
  isProfileLoading: false,
  profileError: null,

  updateProfile: async (updates) => {
    set({ isProfileLoading: true, profileError: null });
    try {
      const token = get().token || get().user?.token;
      const response = await authenticatedFetch(`${API_URL}/api/users/update-profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ ...updates }),
      });
      const data = await response.json();

      if (response.ok) {
        set({ isProfileLoading: false, profileError: null });

        // ✅ Log profile update
        await logEvent("PROFILE_UPDATE", {
          userId: get().user?.mintId,
          userEmail: get().user?.email,
          extra: { updatedFields: Object.keys(updates) },
        });

        await get().getProfile();
        return {
          Status: "Success",
          Message: "Profile updated successfully",
          ...data,
        };
      } else {
        const errorMessage =
          data.message || "Profile update failed. Please try again.";
        set({ profileError: errorMessage, isProfileLoading: false });
        return { Status: "Error", ErrorMessage: errorMessage };
      }
    } catch (error) {
      const errorMessage =
        "Network error. Please check your connection and try again.";
      set({ profileError: errorMessage, isProfileLoading: false });
      await logError("updateProfile exception", {
        userId: get().user?.mintId,
        error,
      });
      return { Status: "Error", ErrorMessage: errorMessage };
    }
  },

  setProfileLoading: (loading) => set({ isProfileLoading: loading }),
  setProfileError: (error) => set({ profileError: error }),

  sendRefferal: async (referralEmails) => {
    set({ isLoading: true, error: null });
    try {
      const token =
        get().token || get().user?.token || (await SecureStore.getItemAsync("userToken"));
      const response = await authenticatedFetch(`${API_URL}/api/users/referrals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ emails: referralEmails }),
      });
      const data = await response.json();

      if (response.ok) {
        // ✅ Log referral sent
        await logEvent("REFERRAL_SENT", {
          userId: get().user?.mintId,
          userEmail: get().user?.email,
          extra: { referralCount: referralEmails.length },
        });

        set({ isLoading: false });
        return {
          Status: "Success",
          Message: "Referral sent successfully",
          ...data,
        };
      } else {
        const errorMessage =
          data.error || "Failed to send referral. Please try again.";
        set({ error: errorMessage, isLoading: false });
        return { Status: "Error", ErrorMessage: errorMessage };
      }
    } catch (error) {
      const errorMessage =
        "Network error. Please check your connection and try again.";
      set({ error: errorMessage, isLoading: false });
      await logError("sendRefferal exception", {
        userId: get().user?.mintId,
        error,
      });
      return { Status: "Error", ErrorMessage: errorMessage };
    }
  },

  // ========================================================================
  // DEAL SLICE
  // ========================================================================
  //
  // The app's only consumer-incentive surface. Replaced the campaign-backed
  // discount slice: /api/users/my-discounts and /api/users/active-campaigns
  // both served *campaign* documents dressed as offers, and a Campaign is a
  // recycling programme, not an incentive.
  deals: [],
  isDealsLoading: false,
  dealsError: null,
  brands: [],
  isBrandsLoading: false,
  brandsError: null,

  getBrands: async () => {
    set({ isBrandsLoading: true, brandsError: null });
    try {
      const token = get().token || get().user?.token;

      const response = await authenticatedFetch(`${API_URL}/api/users/brands`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          // Raw token, no "Bearer " prefix — the backend reads it as-is.
          ...(token ? { Authorization: token } : {}),
        },
      });

      const data = await response.json();

      if (response.ok) {
        const brands: Deal["brand"][] = data.brands || [];
        set({ brands, isBrandsLoading: false, brandsError: null });
        return brands;
      }

      // The previously-loaded list is left in place. Brands are the shell the
      // deals render into, so blanking it on a transient failure would empty a
      // screen that still has perfectly good deals to show.
      set({
        brandsError: data.error || "Failed to fetch brands.",
        isBrandsLoading: false,
      });
      return get().brands;
    } catch {
      set({
        brandsError: "Network error. Please try again.",
        isBrandsLoading: false,
      });
      return get().brands;
    }
  },

  getDeals: async () => {
    set({ isDealsLoading: true, dealsError: null });
    try {
      // getProfile() replaces `user` wholesale with the backend profile, which
      // carries no token — so user.token is undefined after any profile fetch.
      // Always fall back to the store token.
      const token = get().token || get().user?.token;

      const response = await authenticatedFetch(`${API_URL}/api/users/deals`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          // Raw token, no "Bearer " prefix — the backend reads it as-is.
          ...(token ? { Authorization: token } : {}),
        },
      });

      const data = await response.json();

      if (response.ok) {
        const deals: Deal[] = data.deals || [];
        set({ deals, isDealsLoading: false, dealsError: null });
        return deals;
      }

      set({
        dealsError: data.error || "Failed to fetch deals.",
        isDealsLoading: false,
      });
      return [];
    } catch {
      set({
        dealsError: "Network error. Please try again.",
        isDealsLoading: false,
      });
      return [];
    }
  },

  redeemDeal: async (dealId) => {
    try {
      const token = get().token || get().user?.token;

      const response = await authenticatedFetch(
        `${API_URL}/api/users/deals/${dealId}/redeem`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: token } : {}),
          },
        },
      );

      const data = await response.json();

      if (!response.ok || !data.code) {
        // 404 unknown deal, 409 no codes left / fully redeemed, 503 contention.
        return { error: data.error || "This deal could not be claimed." };
      }

      // Reflect the claim locally so the card flips to "Used" without waiting
      // for a refetch. `alreadyClaimed` is not an error — the endpoint is
      // idempotent per user and hands back the same code.
      set((state) => ({
        deals: state.deals.map((d) =>
          d._id === dealId ? { ...d, isAvailed: true, code: data.code } : d,
        ),
      }));

      return { code: data.code as string };
    } catch {
      return { error: "Network error. Please try again." };
    }
  },

  // ========================================================================
  // DEMO COLLECTIONS SLICE
  // ========================================================================
  scheduledCollection: null,

  scheduleCollection: async (collectionId, slotId) => {
    // One pickup per user, and the first booking wins — checked here as well as
    // hidden in the UI.
    if (get().scheduledCollection) return;
    const entry: ScheduledCollection = { collectionId, slotId, status: "pending" };
    set({ scheduledCollection: entry });
    try {
      await SecureStore.setItemAsync(
        scheduledCollectionKey(get().user),
        JSON.stringify(entry),
      );
    } catch (error) {
      // The in-memory booking still stands; it just won't survive a restart.
      await logError("scheduleCollection persist failed", { error });
    }
  },

  loadScheduledCollection: async () => {
    if (get().scheduledCollection) return;
    try {
      const raw = await SecureStore.getItemAsync(scheduledCollectionKey(get().user));
      const entry = raw ? parseScheduledCollection(raw) : null;
      if (entry) set({ scheduledCollection: entry });
    } catch (error) {
      await logError("loadScheduledCollection failed", { error });
    }
  },
}));

// Lets authenticatedFetch sign the user out on 401 without importing the store
// (which would reintroduce the store -> api -> store require cycle).
setUnauthorizedHandler(() => useAppStore.getState().signOut());
