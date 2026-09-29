/// <reference types="jest" />

/**
 * Turning a login response into the stored user.
 *
 * This exists because the mapping was written out three times — the login
 * screen, the register screen and the email path in the store — and all three
 * omitted `locationVersion`. The store then held a user whose address looked
 * unconfirmed, and the location gate asked someone who had finished months ago
 * for their house number again, every time they signed in.
 *
 * Nothing failed. `checkAuth()` repaired it on the next app open, so the bug
 * lived only in the seconds after a sign-in, and fixing two of the three copies
 * changed nothing observable. The first test below is the one that would have
 * caught it: it asserts the gate's inputs survive, by name.
 */
import { resolveLocationGate } from "@/utils/locationGate";
import { userFromAuth } from "@/utils/userFromAuth";

const TOKEN = "Bearer abc.def.ghi";

/** A complete account, as either endpoint returns one. */
const RESPONSE = {
  _id: "6ab171ac4561b5e4d41dbad9",
  email: "someone@example.com",
  userName: "Someone",
  phone: "03001234567",
  avatar: "https://example.com/a.png",
  address: "Khawaja Street",
  province: "Sindh",
  city: "Karachi",
  town: "Naya Nazimabad",
  mintId: "38322222",
  latitude: "24.9747946",
  longitude: "67.0287565",
  points: 200,
  emailVerified: true,
  structuredAddress: { houseNo: "R259" },
  locationVersion: 1,
};

describe("what the gate needs", () => {
  it("carries locationVersion through", () => {
    // The field whose absence caused the bug. Named explicitly rather than
    // covered by a deep-equality check, so deleting it fails loudly.
    expect(userFromAuth(RESPONSE, { token: TOKEN }).locationVersion).toBe(1);
  });

  it("carries structuredAddress through", () => {
    expect(userFromAuth(RESPONSE, { token: TOKEN }).structuredAddress).toEqual({
      houseNo: "R259",
    });
  });

  it("carries the coordinates the pin check reads", () => {
    const user = userFromAuth(RESPONSE, { token: TOKEN });
    expect(user.latitude).toBe("24.9747946");
    expect(user.longitude).toBe("67.0287565");
  });

  it("leaves the gate quiet for a user who has already confirmed", () => {
    // The end-to-end statement: this exact mapping, fed to the real gate,
    // must not ask a completed user for their address again.
    const decision = resolveLocationGate({
      user: userFromAuth(RESPONSE, { token: TOKEN }),
      config: {
        mode: "hard",
        activatedCitiesOnly: false,
        maxDismissals: 0,
        minClientBuild: { ios: null, android: null },
      },
      dismissals: 0,
      platform: "ios",
      build: null,
    });
    expect(decision).toEqual({ show: "none", reason: "already confirmed" });
  });

  it("still gates a user who genuinely has not confirmed", () => {
    // The inverse, so the test above cannot pass by the gate being broken.
    const decision = resolveLocationGate({
      user: userFromAuth(
        { ...RESPONSE, locationVersion: undefined },
        { token: TOKEN },
      ),
      config: {
        mode: "hard",
        activatedCitiesOnly: false,
        maxDismissals: 0,
        minClientBuild: { ios: null, android: null },
      },
      dismissals: 0,
      platform: "ios",
      build: null,
    });
    expect(decision.show).not.toBe("none");
  });
});

describe("the rest of the mapping", () => {
  it("takes the token from the caller, not the body", () => {
    expect(userFromAuth(RESPONSE, { token: TOKEN }).token).toBe(TOKEN);
  });

  it("prefers the account's own avatar over Google's", () => {
    const user = userFromAuth(RESPONSE, {
      token: TOKEN,
      picture: "https://google/photo.png",
    });
    expect(user.avatar).toBe("https://example.com/a.png");
  });

  it("falls back to Google's picture when the account has none", () => {
    const user = userFromAuth(
      { ...RESPONSE, avatar: undefined },
      { token: TOKEN, picture: "https://google/photo.png" },
    );
    expect(user.avatar).toBe("https://google/photo.png");
  });

  it("falls back to the typed email when the response omits one", () => {
    const user = userFromAuth(
      { ...RESPONSE, email: undefined },
      { token: TOKEN, fallbackEmail: "typed@example.com" },
    );
    expect(user.email).toBe("typed@example.com");
  });

  it("defaults the optional strings rather than leaving them undefined", () => {
    // The screens render these directly; undefined reaches the UI as blank
    // in some places and as the string "undefined" in others.
    const user = userFromAuth({ _id: "x", userName: "Y" }, { token: TOKEN });
    expect(user.phone).toBe("");
    expect(user.address).toBe("");
    expect(user.city).toBe("");
    expect(user.points).toBe(0);
    expect(user.referrals).toEqual([]);
    expect(user.pickupHistory).toEqual([]);
  });

  it("treats absent booleans as false", () => {
    const user = userFromAuth({ _id: "x", userName: "Y" }, { token: TOKEN });
    expect(user.emailVerified).toBe(false);
    expect(user.firstTimeLogin).toBe(false);
    expect(user.isAdmin).toBe(false);
  });
});
