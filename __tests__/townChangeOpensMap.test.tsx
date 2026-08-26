/**
 * QA 59, as far as a test can take it: does "I've moved house" actually open
 * the map?
 *
 * This is the one path the other Issue 9 tests cannot reach. The hook decides
 * whether to ask and clears the pin; the modal reports which button was
 * pressed; but "open the map" travels a third route — `onOpenMap`, an OPTIONAL
 * prop threaded from the host through `LocationFields` into the sheet. Optional
 * is the dangerous part: omit it and nothing fails to compile, nothing throws,
 * and the user is left with a cleared pin, a validation error and no way to fix
 * either.
 *
 * Both hosts are checked, because the answer differs for a reason that is easy
 * to get wrong. Edit Profile has always passed it. The confirm modal did NOT,
 * on the reasoning that it never prompts — which is true only while the
 * geocoder succeeds. Its failure path falls back to the user's SAVED town, and
 * a saved town under a rehydrated pin is exactly the ambiguous case.
 *
 * What this still does NOT prove, and what QA 59 on a device is for: that the
 * map that opens is visible, centred somewhere sensible, and can accept a new
 * pin. This proves the wire is connected, not that the light comes on.
 */
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";

// `LocationFields` reaches `config/env.ts` through the picker, and that module
// validates the whole app config at import time and throws when it is absent —
// which is why nothing else renders this component. Same two stubs the
// confirm-modal test uses.
jest.mock("@/config/env", () => ({
  ENV: { appVariant: "development", apiUrl: "http://test.invalid" },
  IS_DEV: true,
  API_BASE_URL: "http://test.invalid",
}));
jest.mock("@/utils/locationAnalytics", () => ({
  trackTownChangeResolved: jest.fn(),
}));

import { LocationFields } from "@/components/location/LocationFields";
import { useLocationForm } from "@/hooks/useLocationForm";

type Api = ReturnType<typeof useLocationForm>;

/**
 * The fieldset driven by a REAL hook, the way a host drives it — no stubbed
 * form. The point is the seam between them, so faking either end would test
 * nothing.
 */
function mountFields(opts: { onOpenMap?: () => void }) {
  const ref: { current: Api | null } = { current: null };
  let tree!: renderer.ReactTestRenderer;
  const Host = () => {
    const form = useLocationForm();
    ref.current = form;
    return (
      <LocationFields
        form={form}
        errors={{}}
        clearError={jest.fn()}
        onOpenMap={opts.onOpenMap}
      />
    );
  };
  act(() => {
    tree = renderer.create(<Host />);
  });
  return {
    get api() {
      return ref.current!;
    },
    run(fn: (api: Api) => void) {
      act(() => fn(ref.current!));
    },
    press(testID: string) {
      act(() => {
        tree.root
          .findAllByType(TouchableOpacity)
          .find((n) => n.props.testID === testID)!
          .props.onPress();
      });
    },
    has(testID: string) {
      return tree.root
        .findAllByType(TouchableOpacity)
        .some((n) => n.props.testID === testID);
    },
  };
}

/** Edit Profile's shape: saved strings and a saved pin, nothing derived. */
const rehydrateAmbiguous = (api: Api) =>
  api.reset({
    city: "Karachi",
    town: "Clifton",
    latitude: "24.8100",
    longitude: "67.0300",
  });

describe('"I\'ve moved house" opens the map', () => {
  it("calls onOpenMap and clears the pin, in that order of consequence", () => {
    const onOpenMap = jest.fn();
    const h = mountFields({ onOpenMap });
    h.run(rehydrateAmbiguous);
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    expect(h.has("town-change-moved")).toBe(true);

    h.press("town-change-moved");

    expect(onOpenMap).toHaveBeenCalledTimes(1);
    // Both halves matter: an open map with the old pin still set would let the
    // user save the stale coordinate by simply closing it again.
    expect(h.api.values.latitude).toBe("");
    expect(h.api.values.town).toBe("Gulshan-e-Iqbal");
  });

  it("does not open the map for the relabel answer", () => {
    const onOpenMap = jest.fn();
    const h = mountFields({ onOpenMap });
    h.run(rehydrateAmbiguous);
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    h.press("town-change-relabel");
    expect(onOpenMap).not.toHaveBeenCalled();
    expect(h.api.values.latitude).toBe("24.8100");
  });

  it("does not open the map on cancel", () => {
    const onOpenMap = jest.fn();
    const h = mountFields({ onOpenMap });
    h.run(rehydrateAmbiguous);
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    h.press("town-change-cancel");
    expect(onOpenMap).not.toHaveBeenCalled();
    expect(h.api.values.town).toBe("Clifton");
  });

  it("survives a host that passes no onOpenMap without throwing", () => {
    // The prop is optional and a future host may have no map. It must degrade
    // to "pin cleared, validation will ask for a new one" rather than crash
    // mid-edit.
    const h = mountFields({});
    h.run(rehydrateAmbiguous);
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    expect(() => h.press("town-change-moved")).not.toThrow();
    expect(h.api.values.latitude).toBe("");
  });
});

describe("every host that can show the prompt can also open a map", () => {
  it("both hosts pass onOpenMap to LocationFields", () => {
    // A source check, deliberately. The prompt lives in the shared fieldset, so
    // a new host gets it for free — and gets the broken half for free too if it
    // forgets the prop. This is what caught the confirm modal, which reached
    // the prompt through the geocoder's failure path while passing nothing.
    const fs = require("fs") as typeof import("fs");
    for (const host of [
      "app/editProfile.tsx",
      "components/location/ConfirmAddressModal.tsx",
    ]) {
      const src = fs.readFileSync(host, "utf8");
      const opening = src.indexOf("<LocationFields");
      expect(opening).toBeGreaterThan(-1);
      const element = src.slice(opening, src.indexOf("/>", opening));
      expect(element).toContain("onOpenMap");
    }
  });
});
