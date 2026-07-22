import { logAuthEvent, logError, logEvent } from "@/utils/logger";
import { authenticatedFetch } from "@/utils/api";
import { API_BASE_URL } from "@/utils/constants";
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
  town: string;
  address: string;
  email: string;
  latitude?: string;
  longitude?: string;
}

// Campaign Types
export interface CampaignAddress {
  province: string;
  city: string;
  town: string;
  _id?: string;
}

export type CampaignStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Campaign {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  discountCodes: string[];
  isSingleCode: boolean;
  discountPercentage?: string;
  addresses: CampaignAddress[];
  status: CampaignStatus;
  users?: string[];
  brand: Brand;
  brandRegistration?: string;
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

export interface DiscountItem {
  _id: string;
  name?: string;
  discountPercentage?: string;
  brand: { _id: string; companyName: string; logo?: string; themeColor?: string; category?: string };
  startDate: string;
  endDate: string;
  isAvailed: boolean;
}

// ============================================================================
// STORE INTERFACES
// ============================================================================

interface UserSlice {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
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

interface DiscountSlice {
  discounts: DiscountItem[];
  isDiscountsLoading: boolean;
  discountsError: string | null;
  getDiscounts: () => Promise<DiscountItem[]>;
  availDiscount: (discountId: string) => Promise<string | null>;
  markDiscountUsed: (discountId: string) => Promise<void>;
}

interface CampaignSlice {
  campaigns: Campaign[];
  isCampaignLoading: boolean;
  campaignError: string | null;

  brands: BrandTheme[];
  isBrandLoading: boolean;
  brandError: string | null;

  brandsWithCampaigns: (BrandTheme & { campaigns: Campaign[] })[];
  isBrandsWithCampaignsLoading: boolean;
  brandsWithCampaignsError: string | null;

  getBrands: () =>
    | Promise<{ Status: string; ErrorMessage?: string }>
    | Promise<BrandTheme[]>;

  getBrandsWithCampaigns: () =>
    | Promise<{ Status: string; ErrorMessage?: string }>
    | Promise<
        (BrandTheme & {
          campaigns: Campaign[];
        })[]
      >;

  getCampaigns: () =>
    | Promise<{ Status: string; ErrorMessage?: string }>
    | Promise<Campaign[]>;
}

// ============================================================================
// STORE
// ============================================================================
type AppStore = UserSlice & ProfileSlice & CampaignSlice & DiscountSlice;

export const useAppStore = create<AppStore>((set, get) => ({
  // ========================================================================
  // USER SLICE
  // ========================================================================
  user: null,
  token: null,
  isLoading: false,
  error: null,

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
    set({ user: null, token: null, error: null });
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
      const wasteKg = parseFloat(user.totalWasteCollected);
      return Math.round((wasteKg * 0.21 + Number.EPSILON) * 100) / 100;
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
  // CAMPAIGN SLICE
  // ========================================================================
  campaigns: [],
  isCampaignLoading: false,
  campaignError: null,

  brands: [],
  isBrandLoading: false,
  brandError: null,

  brandsWithCampaigns: [],
  isBrandsWithCampaignsLoading: false,
  brandsWithCampaignsError: null,

  getBrands: async () => {
    set({ isBrandLoading: true, brandError: null });
    try {
      const token = get().token || get().user?.token;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = token;

      const response = await authenticatedFetch(`${API_URL}/api/users/active-campaigns`, {
        method: "GET",
        headers,
      });
      const data = await response.json();

      if (response.ok) {
        set({
          brands: data.activeBrands || [],
          isBrandLoading: false,
          brandError: null,
        });
        return data.activeBrands;
      } else {
        const errorMessage = data.message || "Error fetching campaigns.";
        set({ campaignError: errorMessage, isCampaignLoading: false });
        return {
          Status: "Error",
          ErrorMessage: errorMessage,
        };
      }
    } catch (error) {
      console.error("Campaigns error:", error);
      const errorMessage =
        "Network error. Please check your connection and try again.";
      set({ campaignError: errorMessage, isCampaignLoading: false });
      return {
        Status: "Error",
        ErrorMessage: errorMessage,
      };
    }
  },

  getBrandsWithCampaigns: async () => {
    set({ isBrandsWithCampaignsLoading: true, brandsWithCampaignsError: null });

    try {
      const token = get().token || get().user?.token;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers.Authorization = token;
      }

      const response = await authenticatedFetch(`${API_URL}/api/brands`, {
        method: "GET",
        headers,
      });

      const data = await response.json();

      if (response.ok) {
        // Set user data in store

        set({
          brandsWithCampaigns: data.brands || [],
          isBrandsWithCampaignsLoading: false,
          brandsWithCampaignsError: null,
        });

        return data.brands;
      } else {
        const errorMessage = data.message || "Error fetching campaigns.";
        set({
          brandsWithCampaignsError: errorMessage,
          isBrandsWithCampaignsLoading: false,
        });
        return {
          Status: "Error",
          ErrorMessage: errorMessage,
        };
      }
    } catch (error) {
      console.error("Campaigns error:", error);
      const errorMessage =
        "Network error. Please check your connection and try again.";
      set({
        brandsWithCampaignsError: errorMessage,
        isBrandsWithCampaignsLoading: false,
      });
      return {
        Status: "Error",
        ErrorMessage: errorMessage,
      };
    }
  },

  getCampaigns: async () => {
    set({ isCampaignLoading: true, campaignError: null });

    try {
      const token = get().token || get().user?.token;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = token;

      const response = await authenticatedFetch(`${API_URL}/api/users/active-campaigns`, {
        method: "GET",
        headers,
      });
      const data = await response.json();

      if (response.ok) {
        set({
          campaigns: data.activeCampaigns || [],
          isCampaignLoading: false,
          campaignError: null,
        });
        return data.activeCampaigns;
      } else {
        const errorMessage = data.message || "Error fetching brands.";
        set({ brandError: errorMessage, isBrandLoading: false });
        return {
          Status: "Error",
          ErrorMessage: errorMessage,
        };
      }
    } catch (error) {
      console.error("Brands error:", error);
      const errorMessage =
        "Network error. Please check your connection and try again.";
      set({ brandError: errorMessage, isBrandLoading: false });
      return {
        Status: "Error",
        ErrorMessage: errorMessage,
      };
    }
  },

  setCampaignLoading: (loading: boolean) => set({ isCampaignLoading: loading }),
  setCampaignError: (error: string | null) => set({ campaignError: error }),

  // ========================================================================
  // DISCOUNT SLICE
  // ========================================================================
  discounts: [],
  isDiscountsLoading: false,
  discountsError: null,

  getDiscounts: async () => {
    set({ isDiscountsLoading: true, discountsError: null });
    try {
      const token = get().token || get().user?.token;
      console.log("[getDiscounts] token:", token);
      const response = await authenticatedFetch(`${API_URL}/api/users/my-discounts`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
      });
      const data = await response.json();
      console.log("[getDiscounts] status:", response.status, "body:", JSON.stringify(data));
      if (response.ok) {
        set({ discounts: data.discounts || [], isDiscountsLoading: false });
        return data.discounts || [];
      }
      set({ discountsError: data.error || "Failed to fetch discounts.", isDiscountsLoading: false });
      return [];
    } catch {
      set({ discountsError: "Network error. Please try again.", isDiscountsLoading: false });
      return [];
    }
  },

  availDiscount: async (discountId) => {
    try {
      const token = get().token || get().user?.token;
      const response = await authenticatedFetch(`${API_URL}/api/users/my-discounts`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ discountId }),
      });
      const data = await response.json();
      console.log("[availDiscount] status:", response.status, "body:", JSON.stringify(data));
      if (response.ok) {
        return data.code ?? data.discountCode ?? null;
      }
      return null;
    } catch (e) {
      console.log("[availDiscount] exception:", e);
      return null;
    }
  },

  markDiscountUsed: async (discountId) => {
    try {
      const token = get().token || get().user?.token;
      const response = await authenticatedFetch(`${API_URL}/api/users/my-discounts`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ discountId }),
      });
      if (response.ok) {
        set((state) => ({
          discounts: state.discounts.map((d) =>
            d._id === discountId ? { ...d, isAvailed: true } : d,
          ),
        }));
      }
    } catch {
      // best-effort — local state remains unchanged until next refresh
    }
  },
}));
