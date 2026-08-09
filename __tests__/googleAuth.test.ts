/**
 * The ordering asserted here is the whole fix: a Google ID token lives one
 * hour, and `signIn()` on an account that is still signed in natively can
 * return the credential cached from a previous app run. Signing out first is
 * what forces a fresh token; without it the backend rejects the stale one as
 * "Invalid token" and every retry re-sends the same cached copy.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSignIn = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSignOut = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHasPlayServices = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: (...args: unknown[]) => mockHasPlayServices(...args),
    signIn: (...args: unknown[]) => mockSignIn(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
  },
}));

import { signInWithGoogle } from "@/utils/googleAuth";

describe("signInWithGoogle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPlayServices.mockResolvedValue(true);
    mockSignIn.mockResolvedValue({ data: { idToken: "fresh-token" } });
    mockSignOut.mockResolvedValue(undefined);
  });

  it("clears the cached native session before signing in", async () => {
    await signInWithGoogle();

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignIn.mock.invocationCallOrder[0],
    );
  });

  it("returns the freshly minted credential", async () => {
    const result = await signInWithGoogle();

    expect(result).toEqual({ success: true, data: { idToken: "fresh-token" } });
  });

  it("still attempts sign-in when there was no session to clear", async () => {
    mockSignOut.mockRejectedValue(new Error("no user signed in"));
    jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await signInWithGoogle();

    expect(mockSignIn).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { idToken: "fresh-token" } });
  });

  it("reports a cancelled sign-in distinctly so callers stay silent", async () => {
    mockSignIn.mockRejectedValue({ code: "SIGN_IN_CANCELLED" });

    await expect(signInWithGoogle()).resolves.toEqual({
      success: false,
      error: "cancelled",
    });
  });
});
