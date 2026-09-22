import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * Push registration.
 *
 * The behaviours worth pinning are the ones whose failure is silent: a token
 * that is never sent to the server, a refreshed token that replaces a dead
 * one, and the release on sign-out — which is a privacy behaviour, not a
 * convenience. None of them surface an error a user would ever see.
 */

// Typed explicitly: @jest/globals infers an untyped mock's argument as `never`,
// so mockResolvedValue(...) will not accept anything without this.
const mockGetToken = jest.fn<() => Promise<string>>();
const mockRequestPermission = jest.fn<() => Promise<number>>();
const mockRegisterDevice = jest.fn<() => Promise<void>>();
const mockOnTokenRefresh = jest.fn<(cb: (token: string) => void) => () => void>();
type Opened = { data?: Record<string, unknown> } | null;
const mockGetInitialNotification = jest.fn<() => Promise<Opened>>();
const mockOnNotificationOpenedApp =
  jest.fn<(cb: (m: NonNullable<Opened>) => void) => () => void>();
let mockIsRegistered = true;

jest.mock("@react-native-firebase/messaging", () => {
  const messaging = () => ({
    requestPermission: mockRequestPermission,
    getToken: mockGetToken,
    onTokenRefresh: mockOnTokenRefresh,
    getInitialNotification: mockGetInitialNotification,
    onNotificationOpenedApp: mockOnNotificationOpenedApp,
    registerDeviceForRemoteMessages: mockRegisterDevice,
    get isDeviceRegisteredForRemoteMessages() {
      return mockIsRegistered;
    },
  });
  messaging.AuthorizationStatus = {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
  };
  return { __esModule: true, default: messaging };
});

jest.mock("@/config/env", () => ({
  API_BASE_URL: "https://api.test",
  ENV: { appVersion: "2.2.1" },
}));

import {
  onNotificationOpened,
  registerDeviceToken,
  registerForPush,
  unregisterDeviceToken,
} from "@/utils/push";

const AUTHORIZED = 1;
const DENIED = 0;
const PROVISIONAL = 2;

describe("registerForPush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRegistered = true;
    mockRequestPermission.mockResolvedValue(AUTHORIZED);
    mockGetToken.mockResolvedValue("device-token");
  });

  it("returns the token once permission is granted", async () => {
    await expect(registerForPush()).resolves.toEqual({
      permission: "granted",
      token: "device-token",
    });
  });

  it("does not ask for a token when permission was refused", async () => {
    // Asking anyway yields a token that can never deliver anything, which
    // then looks like a broken pipeline rather than a declined prompt.
    mockRequestPermission.mockResolvedValue(DENIED);
    await expect(registerForPush()).resolves.toEqual({
      permission: "denied",
      token: null,
    });
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("treats provisional authorisation as usable", async () => {
    mockRequestPermission.mockResolvedValue(PROVISIONAL);
    const result = await registerForPush();
    expect(result.permission).toBe("provisional");
    expect(result.token).toBe("device-token");
  });

  it("registers for remote messages before asking for a token", async () => {
    // On a cold first launch getToken() can beat the APNs handshake and throw
    // "No APNS token specified" — a failure that happens once and then never
    // again, leaving nobody sure what fixed it.
    mockIsRegistered = false;
    await registerForPush();
    expect(mockRegisterDevice).toHaveBeenCalled();
    const registerOrder = mockRegisterDevice.mock.invocationCallOrder[0];
    const tokenOrder = mockGetToken.mock.invocationCallOrder[0];
    expect(registerOrder).toBeLessThan(tokenOrder);
  });

  it("reports a handshake failure rather than throwing into the caller", async () => {
    mockGetToken.mockRejectedValue(new Error("No APNS token specified"));
    const result = await registerForPush();
    expect(result.token).toBeNull();
    expect(result.error).toMatch(/APNS/);
  });
});

type FetchCall = { url: string; init: RequestInit };

/** Replaces global.fetch and records what was sent. */
function stubFetch(response: { ok: boolean; status?: number } | Error) {
  const calls: FetchCall[] = [];
  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (response instanceof Error) throw response;
    return response as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe("registerDeviceToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends the token to the backend with the user's bearer token", async () => {
    const calls = stubFetch({ ok: true });

    await expect(registerDeviceToken("device-token", "Bearer user-jwt")).resolves.toBe(true);

    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.test/api/devices");
    // Verbatim, NOT re-prefixed. The backend issues the token as
    // `Bearer <jwt>` and the app stores it whole, so adding a scheme here
    // yields "Bearer Bearer <jwt>" and a 401 that names nothing useful.
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer user-jwt");
    expect((init.headers as Record<string, string>).authorization).not.toMatch(/Bearer\s+Bearer/);
    const body = JSON.parse(String(init.body));
    expect(body.token).toBe("device-token");
    expect(body.platform).toBe("IOS");
    // Never sends a subject — the backend takes it from the JWT, and a client
    // that could name its own would be able to subscribe to another user.
    expect(body.subjectId).toBeUndefined();
  });

  it("reports failure without throwing", async () => {
    // Called during sign-in. Throwing here would fail a login over a push
    // registration, which is the wrong trade every time.
    stubFetch(new Error("offline"));
    await expect(registerDeviceToken("t", "Bearer jwt")).resolves.toBe(false);

    stubFetch({ ok: false, status: 503 });
    await expect(registerDeviceToken("t", "Bearer jwt")).resolves.toBe(false);
  });
});

describe("unregisterDeviceToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue("device-token");
  });

  it("releases the current token on sign-out", async () => {
    const calls = stubFetch({ ok: true });

    await unregisterDeviceToken("Bearer user-jwt");

    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.test/api/devices");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body)).token).toBe("device-token");
  });

  it("never lets a network failure block signing out", async () => {
    stubFetch(new Error("offline"));
    await expect(unregisterDeviceToken("Bearer user-jwt")).resolves.toBeUndefined();
  });
});

describe("onNotificationOpened", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInitialNotification.mockResolvedValue(null);
    mockOnNotificationOpenedApp.mockReturnValue(() => {});
  });

  it("fires when a backgrounded app is brought forward by a tap", () => {
    const seen: unknown[] = [];
    onNotificationOpened((n) => seen.push(n));

    const handler = mockOnNotificationOpenedApp.mock.calls[0]![0];
    handler({ data: { event: "pickup.invited", collectionId: "23", stopId: "7" } });

    expect(seen).toEqual([
      { event: "pickup.invited", collectionId: "23", stopId: "7" },
    ]);
  });

  it("also fires when the app was not running and the tap launched it", async () => {
    // The case that is easy to leave out: wiring only onNotificationOpenedApp
    // means every tap from a quit app opens the home screen instead, which is
    // the state a user's phone is in first thing in the morning.
    mockGetInitialNotification.mockResolvedValue({
      data: { event: "collection.started", collectionId: "23" },
    });

    const seen: unknown[] = [];
    onNotificationOpened((n) => seen.push(n));
    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([
      { event: "collection.started", collectionId: "23", stopId: null },
    ]);
  });

  it("survives a payload carrying nothing useful", () => {
    const seen: unknown[] = [];
    onNotificationOpened((n) => seen.push(n));
    mockOnNotificationOpenedApp.mock.calls[0]![0]({});
    expect(seen).toEqual([{ event: null, collectionId: null, stopId: null }]);
  });

  it("stops delivering once unsubscribed", async () => {
    // A late getInitialNotification resolving after unmount would otherwise
    // navigate a screen that is no longer there.
    let resolve!: (v: Opened) => void;
    mockGetInitialNotification.mockReturnValue(new Promise<Opened>((r) => (resolve = r)));

    const seen: unknown[] = [];
    const stop = onNotificationOpened((n) => seen.push(n));
    stop();
    resolve({ data: { event: "pickup.invited" } });
    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([]);
  });
});
