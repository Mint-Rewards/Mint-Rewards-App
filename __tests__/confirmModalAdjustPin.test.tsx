/**
 * "Adjust pin" must re-derive the address, exactly as Edit Profile's pin does.
 *
 * This modal's whole claim is "here is where we think you are, confirm it". A
 * pin the user has just moved while the town below it still describes the OLD
 * one is the most misleading state it can be in — worse than the edit form,
 * where the two are plainly separate questions.
 *
 * The extra concern here is `suggestedAreaRef`: it is what `area_overridden`
 * measures prefill accuracy against, so it has to move with the suggestion or
 * the dashboard reports overrides nobody performed.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";

jest.mock("@/config/env", () => ({
  ENV: { appVariant: "development", apiUrl: "http://test.invalid" },
  IS_DEV: true,
  API_BASE_URL: "http://test.invalid",
}));
jest.mock("@/utils/sentry", () => ({
  captureError: jest.fn(),
  setSentryUser: jest.fn(),
}));

const savedUser = {
  mintId: "M1",
    city: "Karachi",
    town: "Clifton",
    subArea: "",
    address: "",
    latitude: "24.8100",
    longitude: "67.0300",
  structuredAddress: { houseNo: "14-B" },
};
const mockStore = { user: savedUser as Record<string, unknown>, token: "t" };
jest.mock("@/store/store", () => ({ useAppStore: () => mockStore }));

const mockTrackOverride = jest.fn();
jest.mock("@/utils/locationAnalytics", () => ({
  trackAreaOverridden: (...a: unknown[]) => mockTrackOverride(...a),
}));

/** Geocoder answers, keyed by the coordinate asked about. */
const geoByCoord: Record<string, unknown> = {};
jest.mock("@/utils/locationPrefill", () => {
  const actual =
    jest.requireActual<typeof import("@/utils/locationPrefill")>(
      "@/utils/locationPrefill",
    );
  return {
    ...actual,
    reverseGeocode: async (lat: number, lng: number) =>
      geoByCoord[`${lat},${lng}`] ?? actual.EMPTY_GEOCODE_RESULT,
  };
});

// The fieldset and the map are exercised elsewhere; only their props matter.
jest.mock("@/components/location/LocationFields", () => ({
  LocationFields: () => null,
}));
jest.mock("@/components/ui/MapPicker", () => "MapPicker");

import { ConfirmAddressModal } from "@/components/location/ConfirmAddressModal";
import { LocationFields } from "@/components/location/LocationFields";
import { EMPTY_GEOCODE_RESULT } from "@/utils/locationPrefill";

/** A resolved answer in the shape the route returns. */
const resolvedAs = (unmatched: string[]) => ({
  ...EMPTY_GEOCODE_RESULT,
  unmatched,
});

const mockOnConfirm = jest.fn(async () => {});

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <ConfirmAddressModal
        visible
        dismissible
        onDismiss={jest.fn()}
        onConfirm={mockOnConfirm}
      />,
    );
  });
  return tree;
}

/** The values currently on the shared fieldset. */
function values(tree: renderer.ReactTestRenderer) {
  return tree.root.findByType(LocationFields).props.form.values;
}

/** Drives the map picker's confirm, as tapping "Adjust pin" then Confirm does. */
async function adjustPinTo(
  tree: renderer.ReactTestRenderer,
  lat: string,
  lng: string,
) {
  await act(async () => {
    tree.root.findByType("MapPicker" as never).props.onConfirm(lat, lng, "user_placed");
  });
}

/**
 * Taps the modal's Save CTA — the only button whose subtree renders the word
 * "Save". Found by walking rendered Text rather than serialising props, which
 * contains React fibers and cannot be stringified.
 */
async function save(tree: renderer.ReactTestRenderer) {
  const cta = tree.root
    .findAll(
      (n) =>
        n.props?.accessibilityRole === "button" &&
        typeof n.props?.onPress === "function",
    )
    .find((node) =>
      node
        .findAllByType(Text)
        .some((t) =>
          String(
            Array.isArray(t.props.children)
              ? t.props.children.join("")
              : (t.props.children ?? ""),
          ).includes("Save"),
        ),
    );
  await act(async () => {
    cta!.props.onPress();
  });
}

beforeEach(() => {
  mockStore.user = savedUser;
  mockTrackOverride.mockReset();
  mockOnConfirm.mockReset();
  for (const k of Object.keys(geoByCoord)) delete geoByCoord[k];
});

describe("Adjust pin re-derives the address", () => {
  it("opens on the saved values", async () => {
    const tree = await mount();
    expect(values(tree).city).toBe("Karachi");
    expect(values(tree).town).toBe("Clifton");
  });

  it("offers the province picker, derived from the saved city", async () => {
    const tree = await mount();
    const fields = tree.root.findByType(LocationFields).props;
    // Not suppressed here any more (owner request): a city resolved from a pin
    // can be the WRONG city, and correcting it in a 58-entry list is the harder
    // half of the job without the filter.
    expect(fields.showProvince).not.toBe(false);
    // Province is never persisted, so it is derived from the city on rehydrate
    // rather than read back.
    expect(fields.form.values.province).toBe("Sindh");
    expect(fields.form.cityOptions).toContain("Karachi");
    expect(fields.form.cityOptions).not.toContain("Lahore");
  });

  it("a province change clears the city AND the pin", async () => {
    const tree = await mount();
    await act(async () => {
      tree.root.findByType(LocationFields).props.form.selectProvince("Punjab");
    });
    expect(values(tree).city).toBe("");
    // Consequence worth knowing: a correct pin under a WRONG city is lost when
    // the province is used to fix the city. Flagged in the handoff — the same
    // inversion that was just ruled on for town applies to city in this modal,
    // where the city is itself pin-derived.
    expect(values(tree).latitude).toBe("");
  });

  it("replaces the town and phase when the pin moves", async () => {
    geoByCoord["24.81,67.08"] = resolvedAs(["DHA Phase 8"]);
    const tree = await mount();

    await adjustPinTo(tree, "24.81", "67.08");

    expect(values(tree).town).toBe("DHA");
    expect(values(tree).subArea).toBe("Phase 8");
    expect(values(tree).latitude).toBe("24.81");
  });

  it("keeps the saved town when the new pin resolves to nothing", async () => {
    const tree = await mount();
    await adjustPinTo(tree, "24.99", "67.99");
    // Clifton came from the user's own saved profile, not from a pin this
    // session, so nothing here may discard it.
    expect(values(tree).town).toBe("Clifton");
  });

  it("never derives the house number, which is this modal's whole point", async () => {
    geoByCoord["24.81,67.08"] = resolvedAs(["DHA Phase 8"]);
    const tree = await mount();
    await adjustPinTo(tree, "24.81", "67.08");
    expect(values(tree).houseNo).toBe("14-B");
  });

  it("reports NO override when the user saves the new pin's own suggestion", async () => {
    geoByCoord["24.81,67.08"] = resolvedAs(["DHA Phase 8"]);
    const tree = await mount();
    await adjustPinTo(tree, "24.81", "67.08");
    await save(tree);

    // Accepting the suggestion is agreement. If the ref still held the
    // suggestion made for the OLD pin, this would report an override the user
    // never performed and quietly corrupt the prefill-accuracy metric.
    expect(mockTrackOverride).not.toHaveBeenCalled();
  });

  it("does NOT save while a required field is missing", async () => {
    mockStore.user = { ...savedUser, structuredAddress: { houseNo: "" } };
    const tree = await mount();
    await save(tree);

    // House number is the one field this modal exists to collect, so a save
    // without it must go nowhere — and the modal stays up, because the host
    // only takes it down once the server says the profile is complete.
    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it("surfaces which field is missing rather than failing silently", async () => {
    mockStore.user = { ...savedUser, structuredAddress: { houseNo: "" } };
    const tree = await mount();
    await save(tree);
    expect(tree.root.findByType(LocationFields).props.errors.houseNo).toContain(
      "required",
    );
  });

  it("saves once every required field is filled", async () => {
    const tree = await mount();
    await act(async () => {
      tree.root.findByType(LocationFields).props.form.setValue("houseNo", "14-B");
    });
    await save(tree);
    expect(mockOnConfirm).toHaveBeenCalled();
  });

  it("hands the host the placement, so a re-placed pin counts as one", async () => {
    geoByCoord["24.81,67.08"] = resolvedAs(["DHA Phase 8"]);
    const tree = await mount();
    await adjustPinTo(tree, "24.81", "67.08");
    await act(async () => {
      tree.root.findByType(LocationFields).props.form.setValue("houseNo", "14-B");
    });
    await save(tree);

    // The host hardcoded "derived" before this, which maps to `legacy_string` —
    // a source the server does not accept as a pin at all. Re-placing the pin
    // could therefore never satisfy it.
    expect(mockOnConfirm).toHaveBeenCalledWith(
      expect.anything(),
      "user_placed",
    );
  });

  it("sends NO placement when the pin was only rehydrated", async () => {
    const tree = await mount();
    await act(async () => {
      tree.root.findByType(LocationFields).props.form.setValue("houseNo", "99");
    });
    await save(tree);

    // null omits `location` from the patch entirely — "don't touch". Sending
    // "derived" would re-describe a coordinate this session never produced and
    // downgrade a `building`-precision pin to `legacy_string` (the P0-1 defect)
    // for anyone who opened this sheet just to add a house number.
    expect(mockOnConfirm).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("reports an override against the NEW suggestion, not the old one", async () => {
    geoByCoord["24.81,67.08"] = resolvedAs(["DHA Phase 8"]);
    const tree = await mount();
    await adjustPinTo(tree, "24.81", "67.08");

    // The user disagrees with the pin's reading and picks Korangi instead.
    await act(async () => {
      tree.root.findByType(LocationFields).props.form.selectTown("Korangi");
    });

    // The pin SURVIVES the correction (owner ruling, 2026-08-26). Until then a
    // town change cleared it, which blocked the save, and re-placing the pin
    // re-derived "DHA" over the correction — a loop with no way out, and
    // `area_overridden` unreachable.
    expect(values(tree).latitude).toBe("24.81");

    await save(tree);

    expect(mockOnConfirm).toHaveBeenCalled();
    // Measured against DHA — what THIS pin suggested — not against whatever the
    // originally saved coordinate had suggested.
    expect(mockTrackOverride).toHaveBeenCalledWith({
      geocodedAreaName: "DHA",
      selectedAreaName: "Korangi",
    });
  });
});
