/**
 * The gate decides who gets blocked out of Home on a ship day that touches
 * every existing user, so the matrix (mode × version × pin × dismissals ×
 * build) is enumerated rather than sampled — and the fail-open paths are
 * asserted first, because they are the ones whose failure mode is "nobody can
 * use the app".
 *
 * No mocking needed: `utils/locationGate` pulls in only `pakistan_areas` (pure
 * data) and a type-only import of the store, which the transform erases. It
 * never reaches `utils/api` or `config/env`, so the stubbing dance in
 * `locationApi.test.ts` does not apply here.
 */
import { describe, expect, it } from "@jest/globals";

import type { User } from "@/store/store";
import {
  LOCATION_COMPLETION_VERSION,
  isActivatedCity,
  resolveLocationGate,
  type GateMode,
  type LocationGateConfig,
  type MissingField,
} from "@/utils/locationGate";

type TestUser = User & { locationVersion?: number };

/** Karachi is the only tier-A city in the registry today. */
const ACTIVATED_CITY = "Karachi";
/** Lahore is tier B — real data, but not "activated" by the tier proxy. */
const UNACTIVATED_CITY = "Lahore";

const config = (over: Partial<LocationGateConfig> = {}): LocationGateConfig => ({
  mode: "soft",
  activatedCitiesOnly: false,
  maxDismissals: 2,
  minClientBuild: { ios: 100, android: 100 },
  ...over,
});

/** A user with everything answered EXCEPT the pin and the version stamp. */
const answered = (over: Partial<TestUser> = {}): TestUser => ({
  userName: "Ifrah",
  phone: "03001234567",
  city: ACTIVATED_CITY,
  town: "DHA",
  subArea: "Phase 6",
  structuredAddress: { houseNo: "12-A" },
  ...over,
});

const pinned = (over: Partial<TestUser> = {}): TestUser =>
  answered({ latitude: "24.8007", longitude: "67.0500", ...over });

const resolve = (
  over: Partial<Parameters<typeof resolveLocationGate>[0]> = {},
) =>
  resolveLocationGate({
    user: answered(),
    config: config(),
    dismissals: 0,
    platform: "ios",
    build: 100,
    ...over,
  });

describe("resolveLocationGate — fail open", () => {
  // The property the whole module exists to protect. A config the app could
  // not fetch, or fetched and could not understand, must never block anyone.
  it("shows nothing when the config is unavailable, whatever the user looks like", () => {
    expect(resolve({ config: null, user: answered() })).toEqual({
      show: "none",
      reason: "config unavailable",
    });
    expect(resolve({ config: null, user: {} })).toEqual({
      show: "none",
      reason: "config unavailable",
    });
    expect(resolve({ config: null, user: pinned() })).toEqual({
      show: "none",
      reason: "config unavailable",
    });
  });

  it("fails open even for an outdated hard-mode client", () => {
    // Every escalation path is downstream of having a config at all.
    expect(
      resolve({ config: null, user: {}, build: 1, dismissals: 99 }),
    ).toEqual({ show: "none", reason: "config unavailable" });
  });

  it("shows nothing with no user", () => {
    expect(resolve({ user: null })).toEqual({ show: "none", reason: "no user" });
    expect(resolve({ user: undefined })).toEqual({
      show: "none",
      reason: "no user",
    });
  });

  it("checks the user before the config, so a signed-out session is never a config error", () => {
    expect(resolve({ user: null, config: null })).toEqual({
      show: "none",
      reason: "no user",
    });
  });
});

describe("resolveLocationGate — kill switch and version", () => {
  it("shows nothing when the mode is off", () => {
    expect(resolve({ config: config({ mode: "off" }), user: {} })).toEqual({
      show: "none",
      reason: "gate off",
    });
  });

  it.each<[GateMode]>([["soft"], ["hard"]])(
    "shows nothing in %s mode once the user is stamped at the completion version",
    (mode) => {
      expect(
        resolve({
          config: config({ mode }),
          user: answered({ locationVersion: LOCATION_COMPLETION_VERSION }),
        }),
      ).toEqual({ show: "none", reason: "already confirmed" });
    },
  );

  it("stays quiet for a version ahead of this build's", () => {
    // A server that has moved on asks through a newer client, not this one.
    expect(
      resolve({
        user: answered({ locationVersion: LOCATION_COMPLETION_VERSION + 5 }),
      }),
    ).toEqual({ show: "none", reason: "already confirmed" });
  });

  it("still asks a user stamped below the completion version", () => {
    expect(resolve({ user: answered({ locationVersion: 0 }) }).show).toBe(
      "finish",
    );
  });

  it("pins the completion version to the backend's", () => {
    // Bumping this constant means the client has shipped the new field. If
    // this fails, check lib/evaluateLocation.ts before changing the number.
    expect(LOCATION_COMPLETION_VERSION).toBe(1);
  });
});

describe("resolveLocationGate — activated cities", () => {
  it("treats tier A as activated and everything else as not", () => {
    expect(isActivatedCity(ACTIVATED_CITY)).toBe(true);
    expect(isActivatedCity(UNACTIVATED_CITY)).toBe(false);
    expect(isActivatedCity("")).toBe(false);
    expect(isActivatedCity(undefined)).toBe(false);
  });

  it("shows nothing outside an activated city when the flag is on", () => {
    expect(
      resolve({
        config: config({ activatedCitiesOnly: true }),
        user: answered({ city: UNACTIVATED_CITY, town: "" }),
      }),
    ).toEqual({ show: "none", reason: "city not activated" });
  });

  it("ignores the city entirely when the flag is off", () => {
    expect(
      resolve({
        config: config({ activatedCitiesOnly: false }),
        user: answered({ city: UNACTIVATED_CITY, town: "" }),
      }).show,
    ).toBe("finish");
  });

  it("still gates inside an activated city with the flag on", () => {
    expect(
      resolve({
        config: config({ activatedCitiesOnly: true }),
        user: answered(),
      }).show,
    ).toBe("finish");
  });

  it("gates a user who has no city at all, even under activatedCitiesOnly", () => {
    // The flag scopes the gate to cities we operate in — but it can only be
    // applied to a user we can actually place. Someone with no city has no
    // tier, and suppressing them would mean never asking for the one field
    // that would tell us whether they are in scope: the flag would switch the
    // gate off exactly where it is most needed. An unplaceable user is gated.
    const decision = resolveLocationGate({
      user: answered({ city: "" }),
      config: config({ activatedCitiesOnly: true }),
      dismissals: 0,
      platform: "ios",
      build: null,
    });

    expect(decision.show).toBe("finish");
    expect(
      (decision as { missing: string[] }).missing,
    ).toContain("city");
  });
});

describe("resolveLocationGate — minClientBuild escalation", () => {
  const cases: {
    name: string;
    mode: GateMode;
    platform: "ios" | "android" | "web";
    build: number | null;
    expected: "none" | "finish";
    dismissible?: boolean;
  }[] = [
    {
      name: "an outdated client is escalated off → soft",
      mode: "off",
      platform: "ios",
      build: 99,
      expected: "finish",
      dismissible: true,
    },
    {
      name: "an up-to-date client in off mode stays off",
      mode: "off",
      platform: "ios",
      build: 100,
      expected: "none",
    },
    {
      name: "an unknown build cannot be escalated",
      mode: "off",
      platform: "android",
      build: null,
      expected: "none",
    },
    {
      name: "web has no floor and is never escalated",
      mode: "off",
      platform: "web",
      build: 1,
      expected: "none",
    },
    {
      name: "escalation never softens an existing hard gate",
      mode: "hard",
      platform: "android",
      build: 1,
      expected: "finish",
      dismissible: false,
    },
    {
      name: "soft stays soft when outdated",
      mode: "soft",
      platform: "android",
      build: 1,
      expected: "finish",
      dismissible: true,
    },
  ];

  it.each(cases)("$name", ({ mode, platform, build, expected, dismissible }) => {
    const decision = resolve({
      config: config({ mode }),
      user: answered(),
      platform,
      build,
    });
    expect(decision.show).toBe(expected);
    if (decision.show !== "none") expect(decision.dismissible).toBe(dismissible);
  });

  it("reads the floor for the platform it is actually on", () => {
    const cfg = config({ mode: "off", minClientBuild: { ios: 500, android: 1 } });
    expect(resolve({ config: cfg, platform: "ios", build: 100 }).show).toBe(
      "finish",
    );
    expect(resolve({ config: cfg, platform: "android", build: 100 }).show).toBe(
      "none",
    );
  });

  it("treats a build exactly at the floor as current", () => {
    expect(
      resolve({ config: config({ mode: "off" }), build: 100 }).show,
    ).toBe("none");
  });

  it("does not escalate when the platform has no floor configured", () => {
    expect(
      resolve({
        config: config({
          mode: "off",
          minClientBuild: { ios: null, android: 100 },
        }),
        platform: "ios",
        build: 1,
      }).show,
    ).toBe("none");
  });
});

describe("resolveLocationGate — dismissibility", () => {
  const cases: {
    mode: GateMode;
    dismissals: number;
    maxDismissals: number;
    dismissible: boolean;
  }[] = [
    { mode: "soft", dismissals: 0, maxDismissals: 2, dismissible: true },
    { mode: "soft", dismissals: 1, maxDismissals: 2, dismissible: true },
    { mode: "soft", dismissals: 2, maxDismissals: 2, dismissible: false },
    { mode: "soft", dismissals: 3, maxDismissals: 2, dismissible: false },
    { mode: "soft", dismissals: 0, maxDismissals: 0, dismissible: false },
    { mode: "hard", dismissals: 0, maxDismissals: 99, dismissible: false },
    { mode: "hard", dismissals: 99, maxDismissals: 99, dismissible: false },
  ];

  it.each(cases)(
    "$mode mode, $dismissals of $maxDismissals dismissals → dismissible $dismissible",
    ({ mode, dismissals, maxDismissals, dismissible }) => {
      // Asserted on both modals: the skip affordance is a property of the
      // gate, not of which modal it chose.
      const finish = resolve({
        config: config({ mode, maxDismissals }),
        user: answered(),
        dismissals,
      });
      const confirm = resolve({
        config: config({ mode, maxDismissals }),
        user: pinned(),
        dismissals,
      });
      expect(finish.show).toBe("finish");
      expect(confirm.show).toBe("confirm");
      if (finish.show !== "none") expect(finish.dismissible).toBe(dismissible);
      if (confirm.show !== "none") expect(confirm.dismissible).toBe(dismissible);
    },
  );

  it("blocks a maxed-out soft user rather than letting them through", () => {
    // Exhausted skips still show the modal — dismissible is about the skip.
    expect(
      resolve({
        config: config({ mode: "soft", maxDismissals: 1 }),
        dismissals: 5,
      }).show,
    ).toBe("finish");
  });
});

describe("resolveLocationGate — the pin is the discriminator", () => {
  const cases: {
    name: string;
    latitude?: string;
    longitude?: string;
    show: "confirm" | "finish";
  }[] = [
    { name: "a valid pair", latitude: "24.8007", longitude: "67.05", show: "confirm" },
    { name: "a negative pair", latitude: "-24.8", longitude: "-67.05", show: "confirm" },
    { name: "zeroes, which parse", latitude: "0", longitude: "0", show: "confirm" },
    { name: "padded whitespace", latitude: " 24.8 ", longitude: " 67.05 ", show: "confirm" },
    { name: "an absent pair", show: "finish" },
    { name: "empty strings", latitude: "", longitude: "", show: "finish" },
    { name: "whitespace only", latitude: "   ", longitude: "   ", show: "finish" },
    { name: "half a pair", latitude: "24.8007", show: "finish" },
    { name: "junk", latitude: "abc", longitude: "67.05", show: "finish" },
    // parseFloat would accept this; Number does not, deliberately.
    { name: "a half-parseable coordinate", latitude: "24abc", longitude: "67.05", show: "finish" },
    { name: "NaN as text", latitude: "NaN", longitude: "67.05", show: "finish" },
    { name: "Infinity as text", latitude: "Infinity", longitude: "67.05", show: "finish" },
  ];

  it.each(cases)("$name → $show", ({ latitude, longitude, show }) => {
    expect(resolve({ user: answered({ latitude, longitude }) }).show).toBe(show);
  });

  it("sends a pinned user with gaps to confirm, not round the whole form", () => {
    // The journey the design doc calls out by name: a pin but no house number.
    expect(
      resolve({ user: pinned({ structuredAddress: {} }) }),
    ).toEqual({ show: "confirm", dismissible: true });
  });
});

describe("resolveLocationGate — missing fields", () => {
  const missingFor = (user: TestUser): MissingField[] => {
    const decision = resolve({ user });
    if (decision.show !== "finish") throw new Error(`expected finish, got ${decision.show}`);
    return decision.missing;
  };

  it("lists every gap in checklist order for an empty user", () => {
    expect(missingFor({})).toEqual([
      "userName",
      "phone",
      "city",
      "town",
      "houseNo",
      "pin",
    ]);
  });

  it("lists only the pin when everything else is answered", () => {
    expect(missingFor(answered())).toEqual(["pin"]);
  });

  it("accepts either half of the town pair", () => {
    expect(missingFor(answered({ town: "", townOther: "Somewhere" }))).toEqual([
      "pin",
    ]);
    expect(missingFor(answered({ town: "", townOther: "   " }))).toContain(
      "town",
    );
  });

  it("demands a sub-area only where one can be answered", () => {
    // DHA carries sub-area data and is flagged required.
    expect(missingFor(answered({ subArea: "" }))).toEqual(["subArea", "pin"]);
    // Clifton does not require one, so a blank is not a gap.
    expect(missingFor(answered({ town: "Clifton", subArea: "" }))).toEqual([
      "pin",
    ]);
    // A free-text town has no canonical list to choose from.
    expect(
      missingFor(answered({ town: "", townOther: "Somewhere", subArea: "" })),
    ).toEqual(["pin"]);
  });

  it("accepts either half of the sub-area pair", () => {
    expect(
      missingFor(answered({ subArea: "", subAreaOther: "Near the masjid" })),
    ).toEqual(["pin"]);
  });

  it("reads the house number from the structured address", () => {
    expect(missingFor(answered({ structuredAddress: undefined }))).toEqual([
      "houseNo",
      "pin",
    ]);
    expect(
      missingFor(answered({ structuredAddress: { houseNo: "  " } })),
    ).toEqual(["houseNo", "pin"]);
  });

  it("never asks for province or a free-text address", () => {
    // Province is derived from city and never shown; the street address became
    // optional when houseNo replaced it.
    const missing = missingFor(answered({ province: "", address: "" }));
    expect(missing).toEqual(["pin"]);
  });

  it("treats whitespace-only values as missing", () => {
    // The town stays answered here: the gate asks whether the question has an
    // answer, not whether that answer is still reachable from a blanked city.
    expect(
      missingFor(answered({ userName: "  ", phone: "\t", city: "  " })),
    ).toEqual(["userName", "phone", "city", "pin"]);
  });
});

describe("resolveLocationGate — precedence", () => {
  it("prefers the kill switch over an unconfirmed user", () => {
    expect(
      resolve({ config: config({ mode: "off" }), user: {} }).show,
    ).toBe("none");
  });

  it("prefers the escalated mode over the configured off switch", () => {
    expect(
      resolve({ config: config({ mode: "off" }), build: 1 }).show,
    ).toBe("finish");
  });

  it("prefers the city check over the version stamp", () => {
    expect(
      resolve({
        config: config({ activatedCitiesOnly: true }),
        user: answered({
          city: UNACTIVATED_CITY,
          town: "",
          locationVersion: LOCATION_COMPLETION_VERSION,
        }),
      }),
    ).toEqual({ show: "none", reason: "city not activated" });
  });

  it("prefers the version stamp over a missing pin", () => {
    const stamped: TestUser = { locationVersion: LOCATION_COMPLETION_VERSION };
    expect(resolve({ user: stamped })).toEqual({
      show: "none",
      reason: "already confirmed",
    });
  });
});
