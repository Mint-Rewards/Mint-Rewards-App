import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * Asking Android for permission to notify.
 *
 * RNFirebase's requestPermission() is a no-op on Android: it answers
 * AUTHORIZED without asking anybody. So on API 33 and above the runtime
 * request has to be made directly, or the app is never allowed to post a
 * notification — silently, while holding a token that looks perfectly
 * healthy. That is the failure these pin down, because nothing about it
 * surfaces an error.
 */

const mockGetToken = jest.fn<() => Promise<string>>();
const mockRequestPermission = jest.fn<() => Promise<number>>();
const mockAndroidRequest = jest.fn<(p: string) => Promise<string>>();
let mockPlatformOS = "android";
let mockPlatformVersion: number | string = 33;

jest.mock("react-native", () => ({
  get Platform() {
    return { OS: mockPlatformOS, Version: mockPlatformVersion };
  },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS" },
    RESULTS: { GRANTED: "granted", DENIED: "denied", NEVER_ASK_AGAIN: "never_ask_again" },
    request: (p: string) => mockAndroidRequest(p),
  },
}));

jest.mock("@react-native-firebase/messaging", () => {
  const messaging = () => ({
    requestPermission: mockRequestPermission,
    getToken: mockGetToken,
    onTokenRefresh: () => () => {},
    registerDeviceForRemoteMessages: async () => {},
    get isDeviceRegisteredForRemoteMessages() {
      return true;
    },
  });
  messaging.AuthorizationStatus = { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 };
  return { __esModule: true, default: messaging };
});

// config/env validates the real app configuration at import time and reads
// expo-constants, which needs a native module this process does not have.
// The existing push test stubs it for the same reason.
jest.mock("@/config/env", () => ({
  API_BASE_URL: "https://api.test.invalid",
  ENV: { apiUrl: "https://api.test.invalid" },
}));

const { pushIsSupported, registerForPush } = require("@/utils/push");

describe("push on Android", () => {
  beforeEach(() => {
    mockPlatformOS = "android";
    mockPlatformVersion = 33;
    mockAndroidRequest.mockReset();
    mockRequestPermission.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue("fcm-token-abc");
  });

  it("is supported at all, which it was not", () => {
    expect(pushIsSupported()).toBe(true);
  });

  it("asks for POST_NOTIFICATIONS on Android 13", async () => {
    mockAndroidRequest.mockResolvedValue("granted");
    const result = await registerForPush();

    expect(mockAndroidRequest).toHaveBeenCalledWith("android.permission.POST_NOTIFICATIONS");
    expect(result.permission).toBe("granted");
    expect(result.token).toBe("fcm-token-abc");
  });

  it("does not ask below Android 13, where it is granted at install", async () => {
    mockPlatformVersion = 31;
    const result = await registerForPush();

    expect(mockAndroidRequest).not.toHaveBeenCalled();
    expect(result.permission).toBe("granted");
    expect(result.token).toBe("fcm-token-abc");
  });

  it("returns no token when the prompt is refused", async () => {
    // A token without permission is the failure this whole file exists for:
    // it looks healthy and nothing ever arrives.
    mockAndroidRequest.mockResolvedValue("denied");
    const result = await registerForPush();

    expect(result.permission).toBe("denied");
    expect(result.token).toBeNull();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("treats never-ask-again as refused", async () => {
    mockAndroidRequest.mockResolvedValue("never_ask_again");
    expect((await registerForPush()).permission).toBe("denied");
  });

  it("does not use the iOS permission path on Android", async () => {
    // RNFirebase would answer AUTHORIZED without asking, which is exactly
    // how this came to look like it worked.
    mockAndroidRequest.mockResolvedValue("granted");
    await registerForPush();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("still uses the iOS path on iOS", async () => {
    mockPlatformOS = "ios";
    mockRequestPermission.mockResolvedValue(1);
    const result = await registerForPush();

    expect(mockRequestPermission).toHaveBeenCalled();
    expect(mockAndroidRequest).not.toHaveBeenCalled();
    expect(result.token).toBe("fcm-token-abc");
  });
});
