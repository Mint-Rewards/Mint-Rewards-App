/**
 * Covers the two properties of utils/sentry.ts that are easy to break and
 * expensive to get wrong: it must never throw (it runs inside catch blocks),
 * and it must never forward credentials or home coordinates to Sentry.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();
const mockAddBreadcrumb = jest.fn();
const mockSetUser = jest.fn();
const mockSetContext = jest.fn();
const mockSetTag = jest.fn();

jest.mock("@sentry/react-native", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
  setUser: (...args: unknown[]) => mockSetUser(...args),
  withScope: (fn: (scope: unknown) => void) =>
    fn({ setContext: mockSetContext, setTag: mockSetTag }),
}));

import {
  addBreadcrumb,
  captureError,
  captureWarning,
  setSentryUser,
} from "@/utils/sentry";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("captureError", () => {
  it("forwards a real Error as-is and tags the call-site label", () => {
    const error = new Error("printToFileAsync failed");
    captureError("coupon PDF generation failed after redeem", error);

    expect(mockCaptureException).toHaveBeenCalledWith(error);
    expect(mockSetTag).toHaveBeenCalledWith(
      "origin",
      "coupon PDF generation failed after redeem",
    );
  });

  it("synthesizes a titled Error for non-Error throws so issues group sanely", () => {
    captureError("signIn exception", "HTTP 500");

    const reported = mockCaptureException.mock.calls[0][0] as Error;
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toBe("signIn exception: HTTP 500");
  });

  it("drops credentials and coordinates from context", () => {
    captureError("updateProfile exception", new Error("boom"), {
      dealId: "deal_123",
      userToken: "eyJhbGciOi",
      password: "hunter2",
      Authorization: "raw-token",
      otp: "123456",
      latitude: "24.86",
      longitude: "67.00",
    });

    expect(mockSetContext).toHaveBeenCalledWith("details", {
      dealId: "deal_123",
    });
  });

  it("never throws when the SDK does", () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error("transport is down");
    });
    expect(() => captureError("anything", new Error("original"))).not.toThrow();
  });
});

describe("captureWarning", () => {
  it("reports at warning level with scrubbed context", () => {
    captureWarning("global 401 sign-out", {
      path: "/api/users/deals",
      Authorization: "raw-token",
    });

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      "global 401 sign-out",
      "warning",
    );
    expect(mockSetContext).toHaveBeenCalledWith("details", {
      path: "/api/users/deals",
    });
  });
});

describe("addBreadcrumb", () => {
  it("scrubs breadcrumb data too", () => {
    addBreadcrumb("http", "GET /api/users/deals", {
      auth: "present",
      token: "secret",
    });

    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: "http",
      message: "GET /api/users/deals",
      level: "info",
      data: { auth: "present" },
    });
  });
});

describe("setSentryUser", () => {
  it("attaches the signed-in identity", () => {
    setSentryUser({ _id: "abc123", email: "user@example.com", mintId: "MR-1" });

    expect(mockSetUser).toHaveBeenCalledWith({
      id: "abc123",
      email: "user@example.com",
      username: "MR-1",
    });
  });

  it("clears identity on sign-out so the next user does not inherit it", () => {
    setSentryUser(null);
    expect(mockSetUser).toHaveBeenCalledWith(null);
  });

  it("treats an empty user object as no identity", () => {
    setSentryUser({ mintId: "MR-1" });
    expect(mockSetUser).toHaveBeenCalledWith(null);
  });
});
