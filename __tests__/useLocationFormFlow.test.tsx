/**
 * The hook driven the way the screen drives it.
 *
 * `renderHook` is not available here, so a probe component exposes the API and
 * the test calls it inside `act`. Worth the small ceremony: the fill-blanks
 * rule and the province/city interplay are timing behaviour, and the constants
 * alone cannot show either.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { useLocationForm } from "@/hooks/useLocationForm";

type Api = ReturnType<typeof useLocationForm>;

// The hook debounces the "did you mean" inputs. Under real timers that fires
// after the test has finished, outside act(), and warns on every case — none of
// these tests exercise suggestions, so the timer is simply never advanced.
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

function mount() {
  const ref: { current: Api | null } = { current: null };
  const Probe = () => {
    ref.current = useLocationForm();
    return null;
  };
  act(() => {
    renderer.create(<Probe />);
  });
  return {
    get api() {
      return ref.current!;
    },
    run(fn: (api: Api) => void) {
      act(() => fn(ref.current!));
    },
  };
}

describe("province narrows the city picker", () => {
  it("offers every city until a province is chosen", () => {
    const h = mount();
    expect(h.api.cityOptions).toContain("Karachi");
    expect(h.api.cityOptions).toContain("Lahore");
  });

  it("narrows once a province is chosen", () => {
    const h = mount();
    h.run((api) => api.selectProvince("Sindh"));
    expect(h.api.cityOptions).toContain("Karachi");
    expect(h.api.cityOptions).not.toContain("Lahore");
  });

  it("clears a city the new province no longer offers", () => {
    const h = mount();
    h.run((api) => api.selectCity("Lahore"));
    h.run((api) => api.selectProvince("Sindh"));
    // Leaving Lahore selected under Sindh would show a value the user can
    // neither see in the list nor re-pick.
    expect(h.api.values.city).toBe("");
  });

  it("sets the province to match when a city is picked directly", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    expect(h.api.values.province).toBe("Sindh");
  });
});

describe("a new pin re-derives the town and sub-area", () => {
  /** Places a pin and returns the token identifying it. */
  function placePin(h: ReturnType<typeof mount>): number {
    let seq = 0;
    h.run((api) => {
      seq = api.confirmPin("24.81", "67.08", "user_placed");
    });
    return seq;
  }

  it("fills a town and phase from the pin", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    const seq = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "DHA", subArea: "Phase 8" }, seq));
    expect(h.api.values.town).toBe("DHA");
    expect(h.api.values.subArea).toBe("Phase 8");
  });

  it("REPLACES what an earlier pin produced when a new pin is placed", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    const first = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "DHA", subArea: "Phase 8" }, first));

    const second = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "Korangi" }, second));
    expect(h.api.values.town).toBe("Korangi");
    // The phase belonged to DHA and cannot survive into Korangi.
    expect(h.api.values.subArea).toBe("");
  });

  it("REPLACES a town the user chose, once they move the pin", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    h.run((api) => api.selectTown("Clifton"));
    const seq = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "DHA", subArea: "Phase 8" }, seq));
    // Moving the pin is a deliberate statement about where the address is.
    expect(h.api.values.town).toBe("DHA");
  });

  it("clears a DERIVED town when the new pin resolves to nothing", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    const first = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "DHA", subArea: "Phase 8" }, first));

    const second = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "", subArea: "" }, second));
    // "DHA" described the OLD pin. Leaving it under a contradicting coordinate
    // is worse than asking again.
    expect(h.api.values.town).toBe("");
    expect(h.api.values.subArea).toBe("");
  });

  it("KEEPS a user-chosen town when the new pin resolves to nothing", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    h.run((api) => api.selectTown("Clifton"));
    const seq = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "", subArea: "" }, seq));
    // Their answer, never written by a pin, so nothing here may discard it.
    expect(h.api.values.town).toBe("Clifton");
  });

  it("drops a reply about a pin the user has already moved on from", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    const stale = placePin(h);
    placePin(h); // the user re-places before the first reply lands

    h.run((api) => api.applyPinPrefill({ town: "DHA" }, stale));
    // The 8s race: this answer describes a coordinate that is no longer set.
    expect(h.api.values.town).toBe("");
  });

  it("drops a reply that lands after the pin was cleared", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    const seq = placePin(h);
    h.run((api) => api.clearPin());
    h.run((api) => api.applyPinPrefill({ town: "DHA" }, seq));
    expect(h.api.values.town).toBe("");
  });

  it("still never touches the house number", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    h.run((api) => api.setValue("houseNo", "14-B"));
    const seq = placePin(h);
    h.run((api) =>
      api.applyPinPrefill(
        { town: "DHA", subArea: "Phase 6", street: "X Road" },
        seq,
      ),
    );
    expect(h.api.values.houseNo).toBe("14-B");
  });

  it("still never changes the city the user chose", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    const seq = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "DHA" }, seq));
    expect(h.api.values.city).toBe("Karachi");
  });

  it("refuses a town that belongs to a DIFFERENT city", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    const seq = placePin(h);
    // A pin near a boundary resolves to the neighbouring city, and buildPrefill
    // validates the town against ITS answer, not the user's.
    h.run((api) => api.applyPinPrefill({ town: "Gulberg" }, seq));
    expect(h.api.values.town).toBe("");
  });

  it("refuses a sub-area that does not belong to the town above it", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    const seq = placePin(h);
    // "Block 2" is a Gulshan-e-Iqbal block; DHA's list is phases.
    h.run((api) => api.applyPinPrefill({ town: "DHA", subArea: "Block 2" }, seq));
    expect(h.api.values.town).toBe("DHA");
    expect(h.api.values.subArea).toBe("");
  });

  it("survives a town correction — the pin is not cleared by one", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    const seq = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "DHA", subArea: "Phase 8" }, seq));

    h.run((api) => api.selectTown("Korangi"));

    // Owner ruling, 2026-08-26. Correcting a derived town must not destroy the
    // coordinate that derived it, or the correction cannot be saved and
    // re-placing the pin just re-derives the same town.
    expect(h.api.values.latitude).toBe("24.81");
    expect(h.api.values.town).toBe("Korangi");
    // The phase belonged to DHA and goes with it.
    expect(h.api.values.subArea).toBe("");
  });

  it("survives the FIRST city choice — there is no old city to be wrong about", () => {
    const h = mount();
    h.run((api) => api.selectProvince("Sindh"));
    // The map is openable from the province rung, so a pin can legitimately
    // exist before a city is named.
    placePin(h);
    h.run((api) => api.selectCity("Karachi"));
    expect(h.api.values.latitude).toBe("24.81");
  });

  it("a CITY change still clears the pin", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    placePin(h);
    h.run((api) => api.selectCity("Lahore"));
    // A different city makes the coordinate provably wrong — untouched half of
    // the ruling.
    expect(h.api.values.latitude).toBe("");
  });

  it("all four town paths keep the pin", () => {
    for (const change of [
      (api: ReturnType<typeof useLocationForm>) => api.selectTown("Korangi"),
      (api: ReturnType<typeof useLocationForm>) => api.useCustomTown(),
      (api: ReturnType<typeof useLocationForm>) => api.backToTownList(),
    ]) {
      const h = mount();
      h.run((api) => api.selectCity("Karachi"));
      placePin(h);
      h.run(change);
      expect(h.api.values.latitude).toBe("24.81");
    }
  });

  it("leaves a typed street alone — it is the user's own words", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    h.run((api) => api.setValue("address", "Opposite the big mosque"));
    const seq = placePin(h);
    h.run((api) => api.applyPinPrefill({ town: "DHA", street: "X Road" }, seq));
    expect(h.api.values.address).toBe("Opposite the big mosque");
  });
});

describe("rehydrating a saved profile", () => {
  it("derives the province from the saved city, since it is not persisted", () => {
    const h = mount();
    h.run((api) => api.reset({ city: "Lahore", town: "Gulberg" }));
    expect(h.api.values.province).toBe("Punjab");
    // And the picker is scoped accordingly, not left showing all 58.
    expect(h.api.cityOptions).not.toContain("Karachi");
  });

  it("leaves the province empty for a city outside the registry", () => {
    const h = mount();
    h.run((api) => api.reset({ city: "Nowhereabad" }));
    expect(h.api.values.province).toBe("");
    // No filter, so the user can still find a real city.
    expect(h.api.cityOptions).toContain("Karachi");
  });

  // Issue 8: province became mandatory on 2026-08-26, so an off-registry city
  // that derived nothing blocked the save — and the only escape, picking a
  // province, fired CLEARED_BY_PROVINCE_CHANGE and wiped the city, town, house
  // number and pin the user arrived with.
  it("falls back to the profile's saved province when the city is off-registry", () => {
    const h = mount();
    h.run((api) => api.reset({ city: "Nowhereabad", province: "Sindh" }));
    expect(h.api.values.province).toBe("Sindh");
  });

  it("lets the registry beat a saved province that disagrees with the city", () => {
    const h = mount();
    // A stale stored province must never be allowed to contradict a city the
    // registry knows — that pairing is exactly what the derived field prevents.
    h.run((api) => api.reset({ city: "Lahore", province: "Sindh" }));
    expect(h.api.values.province).toBe("Punjab");
  });

  it("still ends up empty when neither the registry nor the profile knows", () => {
    const h = mount();
    h.run((api) => api.reset({ city: "Nowhereabad", province: "" }));
    expect(h.api.values.province).toBe("");
  });
});

/**
 * Issue 9 — the ambiguous town edit.
 *
 * A town change no longer clears the pin, which is right when the pin PRODUCED
 * the town and wrong when the user has moved house. These two cases are
 * identical in form state, so the hook asks instead of guessing — but only in
 * the narrow case where it genuinely cannot tell.
 */
describe("a town change on a rehydrated pin asks which kind of change it is", () => {
  // Edit Profile's rehydrate: saved strings, a saved coordinate, no placement
  // and nothing derived this session. The one ambiguous shape.
  const rehydrate = (api: Api) =>
    api.reset({
      city: "Karachi",
      town: "Clifton",
      latitude: "24.8100",
      longitude: "67.0300",
    });

  it("holds the edit back instead of applying it", () => {
    const h = mount();
    h.run(rehydrate);
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    expect(h.api.pendingTownChange).toEqual({
      kind: "select",
      town: "Gulshan-e-Iqbal",
    });
    // Nothing has moved yet — the question is still open.
    expect(h.api.values.town).toBe("Clifton");
    expect(h.api.values.latitude).toBe("24.8100");
  });

  it('"I moved" applies the town and drops the pin', () => {
    const h = mount();
    h.run(rehydrate);
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    let clearedPin = false;
    h.run((api) => {
      clearedPin = api.resolveTownChange(true);
    });
    expect(clearedPin).toBe(true);
    expect(h.api.values.town).toBe("Gulshan-e-Iqbal");
    expect(h.api.values.latitude).toBe("");
    expect(h.api.values.longitude).toBe("");
    expect(h.api.pendingTownChange).toBeNull();
  });

  it('"the area name is wrong" applies the town and keeps the pin', () => {
    const h = mount();
    h.run(rehydrate);
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    let clearedPin = true;
    h.run((api) => {
      clearedPin = api.resolveTownChange(false);
    });
    // This is the town ruling's behaviour, unchanged — the whole point is that
    // correcting a label must never cost the user their coordinate.
    expect(clearedPin).toBe(false);
    expect(h.api.values.town).toBe("Gulshan-e-Iqbal");
    expect(h.api.values.latitude).toBe("24.8100");
  });

  it("cancelling changes nothing at all", () => {
    const h = mount();
    h.run(rehydrate);
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    h.run((api) => api.cancelTownChange());
    expect(h.api.pendingTownChange).toBeNull();
    expect(h.api.values.town).toBe("Clifton");
    expect(h.api.values.latitude).toBe("24.8100");
  });

  it("asks on the 'Other' escape and on back-to-list too", () => {
    // All three entry points clear the town, so all three can strand a pin.
    const custom = mount();
    custom.run(rehydrate);
    custom.run((api) => api.useCustomTown());
    expect(custom.api.pendingTownChange).toEqual({ kind: "custom" });
    expect(custom.api.townIsCustom).toBe(false); // not switched yet

    const list = mount();
    list.run(rehydrate);
    list.run((api) => api.backToTownList());
    expect(list.api.pendingTownChange).toEqual({ kind: "list" });
  });
});

describe("it does NOT ask when the pin and the town already agree", () => {
  it("stays silent when the town was derived from this pin (the confirm modal)", () => {
    const h = mount();
    // What ConfirmAddressModal does: a rehydrated pin, but a GEOCODED town.
    // Editing it here can only mean the geocoder read the coordinate wrongly —
    // the case the town ruling exists to protect. Interrupting it would put
    // back the loop that ruling removed.
    h.run((api) =>
      api.reset(
        {
          city: "Karachi",
          town: "Clifton",
          latitude: "24.8100",
          longitude: "67.0300",
        },
        null,
        { town: true },
      ),
    );
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    expect(h.api.pendingTownChange).toBeNull();
    expect(h.api.values.town).toBe("Gulshan-e-Iqbal");
    expect(h.api.values.latitude).toBe("24.8100");
  });

  it("stays silent when the pin was placed in this session", () => {
    const h = mount();
    h.run(rehydrateWithoutPin);
    h.run((api) => api.confirmPin("24.8100", "67.0300", "user_placed"));
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    // The user placed this pin moments ago; it cannot be describing an old
    // address they have since moved out of.
    expect(h.api.pendingTownChange).toBeNull();
    expect(h.api.values.town).toBe("Gulshan-e-Iqbal");
  });

  it("stays silent when there is no pin to strand", () => {
    const h = mount();
    h.run(rehydrateWithoutPin);
    h.run((api) => api.selectTown("Gulshan-e-Iqbal"));
    expect(h.api.pendingTownChange).toBeNull();
    expect(h.api.values.town).toBe("Gulshan-e-Iqbal");
  });

  it("stays silent when there is no town to lose", () => {
    const h = mount();
    h.run((api) =>
      api.reset({
        city: "Karachi",
        latitude: "24.8100",
        longitude: "67.0300",
      }),
    );
    h.run((api) => api.selectTown("Clifton"));
    expect(h.api.pendingTownChange).toBeNull();
    expect(h.api.values.town).toBe("Clifton");
    expect(h.api.values.latitude).toBe("24.8100");
  });
});

function rehydrateWithoutPin(api: Api) {
  api.reset({ city: "Karachi", town: "Clifton" });
}

/**
 * The visible half of the 2026-08-26 prefill widening.
 *
 * Karachi now pre-selects unmeasured residential areas as flagged guesses, so
 * the flag is what separates "we measured this at >=85%" from "we guessed".
 * If it stops tracking the tier, the app presents both in the same voice — and
 * a user who taps through a silent pre-selection keeps whatever it said.
 */
describe("townPrefillIsGuess", () => {
  it("is false before anything has been prefilled", () => {
    const h = mount();
    expect(h.api.townPrefillIsGuess).toBe(false);
  });

  it("flags a pin-derived town the registry rates provisional", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    h.run((api) =>
      api.applyPinPrefill({ town: "Clifton", subArea: "Block 2" }, 0),
    );
    expect(h.api.values.town).toBe("Clifton");
    expect(h.api.townPrefillIsGuess).toBe(true);
  });

  it("does NOT flag a measured area", () => {
    // DHA carries n=70 at 100%. A note on every prefill is a note nobody reads.
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    h.run((api) => api.applyPinPrefill({ town: "DHA", subArea: "Phase 6" }, 0));
    expect(h.api.values.town).toBe("DHA");
    expect(h.api.townPrefillIsGuess).toBe(false);
  });

  it("clears once the user answers the question themselves", () => {
    const h = mount();
    h.run((api) => api.selectCity("Karachi"));
    h.run((api) => api.applyPinPrefill({ town: "Clifton" }, 0));
    expect(h.api.townPrefillIsGuess).toBe(true);

    h.run((api) => api.selectTown("Nazimabad"));
    // Nazimabad is provisional too, but it is no longer a GUESS — the user
    // picked it. The flag tracks provenance, not the area.
    expect(h.api.values.town).toBe("Nazimabad");
    expect(h.api.townPrefillIsGuess).toBe(false);
  });

  it("is false for a town rehydrated from the profile rather than a pin", () => {
    // `reset` with no `derived` argument is a plain rehydrate: those strings are
    // the user's own saved answers and were never guessed at.
    const h = mount();
    h.run((api) => api.reset({ city: "Karachi", town: "Clifton" }));
    expect(h.api.values.town).toBe("Clifton");
    expect(h.api.townPrefillIsGuess).toBe(false);
  });

  it("flags the confirm modal's own reset, which IS pin-derived", () => {
    const h = mount();
    h.run((api) =>
      api.reset({ city: "Karachi", town: "Clifton" }, null, { town: true }),
    );
    expect(h.api.townPrefillIsGuess).toBe(true);
  });
});
