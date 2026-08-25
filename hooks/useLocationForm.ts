/**
 * The location half of a profile form: values, the cascade, the "Other"
 * escapes, and the derived option lists.
 *
 * Extracted from `app/editProfile.tsx` so the confirm-address modal can ask the
 * same questions without owning a second copy of the answers. That is not a
 * theoretical concern in this repo — the same idea implemented twice has
 * produced three separate defects here (two disagreeing `hasLocation`
 * definitions, a province cascade that outlived its dropdown, and a block that
 * survived its town). One hook, two hosts.
 *
 * What this owns: city, town/townOther, subArea/subAreaOther, houseNo, street,
 * and the pin. What it does NOT own: identity fields (name, email, phone), the
 * save call, or anything that renders. Hosts keep those.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  OTHER_OPTION,
  buildTownOptions,
  getAllCities,
} from "@/utils/locationForm";
import {
  getBlockLabel,
  getHouseNoField,
  getSelectableTownsForCity,
  getSubAreasForTown,
  matchCanonicalNames,
  requiresSubArea,
} from "@/utils/pakistan_areas";
import type { PinPlacement } from "@/utils/pinState";

/** Matches the server-side cap on `townOther` / `subAreaOther`. */
export const OTHER_TEXT_MAX = 100;

export interface LocationFormValues {
  city: string;
  town: string;
  townOther: string;
  subArea: string;
  subAreaOther: string;
  houseNo: string;
  /** Street address. Optional since 2026-08-25; derived from the geocoder where possible. */
  address: string;
  latitude: string;
  longitude: string;
}

const EMPTY: LocationFormValues = {
  city: "",
  town: "",
  townOther: "",
  subArea: "",
  subAreaOther: "",
  houseNo: "",
  address: "",
  latitude: "",
  longitude: "",
};

/**
 * The pin fields, blanked. Spread into every update that changes the selected
 * PLACE — city or town.
 *
 * A pin placed in the old town says nothing true about the new one, and
 * validation only checks that a pin parses, not that it is anywhere near the
 * place named above it. Within one city that is still a ~30km error that saves
 * cleanly.
 *
 * Cleared rather than moved to the new place's centroid: an app-placed pin is
 * tagged `legacy_string`/`unknown`, which routing excludes, so it would look set
 * and route nowhere. Clearing forces a real one, and the map reopens on the new
 * place (see `getSelectionRegion`).
 */
const CLEARED_PIN = { latitude: "", longitude: "" };

export function useLocationForm(initial?: Partial<LocationFormValues>) {
  const [values, setValues] = useState<LocationFormValues>({
    ...EMPTY,
    ...initial,
  });
  const [townIsCustom, setTownIsCustom] = useState(
    !!initial?.townOther?.trim(),
  );
  const [subAreaIsOther, setSubAreaIsOther] = useState(
    !!initial?.subAreaOther?.trim(),
  );

  /**
   * How the current pin was set. Nothing renders from it, so a ref is enough —
   * it must not cause a re-render, and it must survive between the map closing
   * and the save.
   */
  const placementRef = useRef<PinPlacement | null>(null);

  // ── Derived options ──────────────────────────────────────────────────────
  // City is the top of the cascade now that the province dropdown is gone, so
  // every registry city is offered at once — 100+ entries, which is exactly why
  // this field uses the searchable picker.
  const cityOptions = useMemo(() => getAllCities(), []);

  // The PICKER view, not the validation view: `getTownsForCity` still returns
  // deprecated towns so existing profiles stay valid, while this hides them from
  // new selections. Without this the deprecation is inert and users keep
  // creating the very values it exists to retire.
  const baseTownOptions = useMemo(
    () => (values.city ? getSelectableTownsForCity(values.city) : []),
    [values.city],
  );
  const townOptions = useMemo(
    () => buildTownOptions(values.city),
    [values.city],
  );

  // The sub-area step exists only for towns that actually have canonical data.
  // A free-text town never does — its value lives in `townOther`, leaving `town`
  // empty — so the step is skipped and not required for those.
  const showSubArea =
    !townIsCustom && requiresSubArea(values.city, values.town);

  const subAreaOptions = useMemo(
    () =>
      showSubArea
        ? [...getSubAreasForTown(values.city, values.town), OTHER_OPTION]
        : [],
    [showSubArea, values.city, values.town],
  );

  /** What this level is called here — "Block" in DHA, "Sector" in Islamabad. */
  const blockLabel = getBlockLabel(values.city, values.town);

  /**
   * House-number wording, registry-driven. A household is asked for a house or
   * flat number, an industrial plot for a unit or building name — most
   * households cannot answer the second, and vice versa.
   */
  const houseNoField = getHouseNoField(values.city, values.town);

  // ── "Other" suggestions ──────────────────────────────────────────────────
  // While someone types a free-text town or sub-area, offer canonical entries
  // that look like what they wrote, so a near-miss spelling gets steered back
  // onto the list instead of becoming another `*Other` row to review later.
  // Debounced so the list settles rather than churning mid-word.
  const debouncedTownOther = useDebouncedValue(values.townOther);
  const debouncedSubAreaOther = useDebouncedValue(values.subAreaOther);

  const townSuggestions = townIsCustom
    ? matchCanonicalNames(baseTownOptions, debouncedTownOther)
    : [];

  const subAreaSuggestions =
    showSubArea && subAreaIsOther
      ? matchCanonicalNames(
          getSubAreasForTown(values.city, values.town),
          debouncedSubAreaOther,
        )
      : [];

  // ── Mutations ────────────────────────────────────────────────────────────
  const setValue = useCallback(
    <K extends keyof LocationFormValues>(key: K, value: LocationFormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /** Drops the placement alongside the pin, so the next one starts from scratch. */
  const forgetPlacement = useCallback(() => {
    placementRef.current = null;
  }, []);

  /**
   * City is the top of the cascade. Changing it clears town, sub-area and the
   * pin: none of those answers means anything under a different city.
   */
  const selectCity = useCallback((city: string) => {
    setValues((prev) => {
      if (city === prev.city) return prev; // re-picking is not a change
      return {
        ...prev,
        city,
        town: "",
        townOther: "",
        subArea: "",
        subAreaOther: "",
        ...CLEARED_PIN,
      };
    });
    setTownIsCustom(false);
    setSubAreaIsOther(false);
  }, []);

  /**
   * A canonical town — from the picker or from a "did you mean" suggestion.
   *
   * NOTE: this deliberately does not clear `placementRef`. It is reached from
   * render-time helpers, where a ref write is a render-time ref access the
   * linter correctly rejects. It is also unnecessary: placement and coordinate
   * are only ever written together by the map's confirm, and validation blocks a
   * save without a pin, so a stale placement can never be paired with a
   * coordinate it did not describe.
   */
  const selectTown = useCallback((town: string) => {
    setValues((prev) => {
      if (town === prev.town) return prev;
      return {
        ...prev,
        town,
        townOther: "",
        subArea: "",
        subAreaOther: "",
        ...CLEARED_PIN,
      };
    });
    setTownIsCustom(false);
    setSubAreaIsOther(false);
  }, []);

  /** Switches the town to free text. Mutually exclusive with a canonical town. */
  const useCustomTown = useCallback(() => {
    setValues((prev) => ({
      ...prev,
      town: "",
      townOther: "",
      subArea: "",
      subAreaOther: "",
      ...CLEARED_PIN,
    }));
    setTownIsCustom(true);
    setSubAreaIsOther(false);
  }, []);

  /** Abandons a free-text town and returns to the list. */
  const backToTownList = useCallback(() => {
    setValues((prev) => ({
      ...prev,
      town: "",
      townOther: "",
      subArea: "",
      subAreaOther: "",
      ...CLEARED_PIN,
    }));
    setTownIsCustom(false);
    setSubAreaIsOther(false);
  }, []);

  const selectSubArea = useCallback((subArea: string) => {
    setValues((prev) => ({ ...prev, subArea, subAreaOther: "" }));
    setSubAreaIsOther(false);
  }, []);

  const useCustomSubArea = useCallback(() => {
    setValues((prev) => ({ ...prev, subArea: "", subAreaOther: "" }));
    setSubAreaIsOther(true);
  }, []);

  /** Commits a confirmed pin, with how it was placed. */
  const confirmPin = useCallback(
    (latitude: string, longitude: string, placement?: PinPlacement) => {
      setValues((prev) => ({ ...prev, latitude, longitude }));
      placementRef.current = placement ?? null;
    },
    [],
  );

  const clearPin = useCallback(() => {
    setValues((prev) => ({ ...prev, ...CLEARED_PIN }));
    placementRef.current = null;
  }, []);

  /**
   * Replaces every value at once — used when a rehydrate or prefill arrives.
   *
   * `placement` rides along because a reset that carries a coordinate must also
   * say how trustworthy it is; leaving the ref to the caller invites a
   * render-time ref write (a compiler error) and a coordinate/placement pair
   * written in two places. Defaults to null — "nothing this session produced a
   * pin" — which is what keeps an untouched pin from being re-described.
   */
  const reset = useCallback(
    (next: Partial<LocationFormValues>, placement: PinPlacement | null = null) => {
      setValues({ ...EMPTY, ...next });
      setTownIsCustom(!!next.townOther?.trim());
      setSubAreaIsOther(!!next.subAreaOther?.trim());
      placementRef.current = placement;
    },
    [],
  );

  return {
    values,
    setValue,
    reset,

    townIsCustom,
    subAreaIsOther,
    showSubArea,

    cityOptions,
    townOptions,
    subAreaOptions,
    townSuggestions,
    subAreaSuggestions,
    blockLabel,
    houseNoField,

    selectCity,
    selectTown,
    useCustomTown,
    backToTownList,
    selectSubArea,
    useCustomSubArea,

    confirmPin,
    clearPin,
    placementRef,
    forgetPlacement,
  };
}

export type LocationFormApi = ReturnType<typeof useLocationForm>;
