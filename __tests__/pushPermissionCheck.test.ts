import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * Finding out whether notifications are on, WITHOUT asking.
 *
 * The distinction matters twice over. A check that prompts cannot be run on
 * every foreground, and a person who switches notifications off in system
 * settings does it outside the app — so without a silent check, nothing here
 * ever finds out and they simply stop being told about their collections.
 *
 * On Android `hasPermission()` maps to `areNotificationsEnabled()`, which is
 * the settings toggle rather than the Android 13 runtime grant. Below API 33
 * the runtime permission does not exist at all, so the toggle is the only
 * thing there is to read.
 */

const mockHasPermission = jest.fn<() => Promise<number>>();
const mockRequestPermission = jest.fn<() => Promise<number>>();
const mockAndroidRequest = jest.fn<(p: string) => Promise<string>>();
const mockGetToken = jest.fn<() => Promise<string>>();
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
    hasPermission: mockHasPermission,
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

jest.mock("@/config/env", () => ({
  API_BASE_URL: "https://api.test.invalid",
  ENV: { apiUrl: "https://api.test.invalid" },
}));

const { checkPushPermission, promptForPush } = require("@/utils/push");

beforeEach(() => {
  mockPlatformOS = "android";
  mockPlatformVersion = 33;
  mockHasPermission.mockReset();
  mockRequestPermission.mockReset();
  mockAndroidRequest.mockReset();
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue("fcm-token");
});

describe("checkPushPermission", () => {
  it("never prompts", async () => {
    mockHasPermission.mockResolvedValue(1);
    await checkPushPermission();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockAndroidRequest).not.toHaveBeenCalled();
  });

  it("reads the Android settings toggle as denied", async () => {
    // areNotificationsEnabled() === false. This is the case the app could not
    // see before, and the only one that exists below API 33.
    mockHasPermission.mockResolvedValue(0);
    await expect(checkPushPermission()).resolves.toBe("denied");
  });

  it("reports authorised", async () => {
    mockHasPermission.mockResolvedValue(1);
    await expect(checkPushPermission()).resolves.toBe("granted");
  });

  it("distinguishes never-asked from refused", async () => {
    mockHasPermission.mockResolvedValue(-1);
    await expect(checkPushPermission()).resolves.toBe("undetermined");
  });

  it("reports provisional as itself", async () => {
    mockHasPermission.mockResolvedValue(2);
    await expect(checkPushPermission()).resolves.toBe("provisional");
  });

  it("treats a failed check as working, not as off", async () => {
    /*
     * This runs on every foreground. Nagging someone whose notifications
     * already work, every time they open the app, because a native call threw
     * is worse than missing someone whose are off.
     */
    mockHasPermission.mockRejectedValue(new Error("no native module"));
    await expect(checkPushPermission()).resolves.toBe("granted");
  });

  it("says unsupported off-device", async () => {
    mockPlatformOS = "web";
    await expect(checkPushPermission()).resolves.toBe("unsupported");
    expect(mockHasPermission).not.toHaveBeenCalled();
  });
});

describe("promptForPush", () => {
  it("reports success without sending anyone to settings", async () => {
    mockAndroidRequest.mockResolvedValue("granted");
    mockHasPermission.mockResolvedValue(1);

    await expect(promptForPush()).resolves.toEqual({
      permission: "granted",
      needsSettings: false,
    });
  });

  it("sends the user to settings once the prompt is spent", async () => {
    /*
     * Android stops showing the runtime dialog after two refusals, and below
     * API 33 never shows one. Asking again is then a button that visibly does
     * nothing, so the caller has to know to offer Settings instead.
     */
    mockAndroidRequest.mockResolvedValue("never_ask_again");
    mockHasPermission.mockResolvedValue(0);

    await expect(promptForPush()).resolves.toEqual({
      permission: "denied",
      needsSettings: true,
    });
  });

  it("trusts the re-check over the request's own answer", async () => {
    /*
     * The three platforms disagree about what they return when the prompt was
     * suppressed. hasPermission() afterwards is the one thing that means the
     * same everywhere — here the request claims success and the device
     * disagrees.
     */
    mockAndroidRequest.mockResolvedValue("granted");
    mockHasPermission.mockResolvedValue(0);

    const result = await promptForPush();
    expect(result.permission).toBe("denied");
    expect(result.needsSettings).toBe(true);
  });

  it("does not demand settings for provisional", async () => {
    mockAndroidRequest.mockResolvedValue("granted");
    mockHasPermission.mockResolvedValue(2);

    const result = await promptForPush();
    expect(result.needsSettings).toBe(false);
  });
});
