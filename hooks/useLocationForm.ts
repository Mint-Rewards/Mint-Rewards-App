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
  getAllProvinces,
  getCitiesForPicker,
} from "@/utils/locationForm";
import {
  getBlockLabel,
  getPrefillConfidence,
  getProvinceForCity,
  isCanonicalTown,
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
  /**
   * UI-only: narrows the city picker. NEVER persisted — `buildLocationPayload`
   * derives the saved `province` from the chosen city, which is what stops an
   * impossible pair like Karachi/Punjab reaching the server. See
   * `getCitiesForPicker`.
   */
  province: string;
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
  province: "",
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
 * The pin fields, blanked. Spread into every update that changes the CITY.
 *
 * A pin placed in the old city says nothing true about the new one, and
 * validation only checks that a pin parses, not that it is anywhere near the
 * place named above it.
 *
 * Cleared rather than moved to the new place's centroid: an app-placed pin is
 * tagged `legacy_string`/`unknown`, which routing excludes, so it would look set
 * and route nowhere. Clearing forces a real one, and the map reopens on the new
 * place (see `getSelectionRegion`).
 *
 * A TOWN change no longer clears it (owner ruling, 2026-08-26). It used to,
 * back when the town was chosen BEFORE the pin and a stale pin could be ~30km
 * out. Under Province -> City -> Pin the dependency runs the other way: the pin
 * is placed first and PRODUCES the town, so clearing it on a town edit destroys
 * the very thing that produced the value being corrected — and left the user in
 * a loop with no way to save a town the geocoder disagreed with. See
 * `CLEARED_BY_TOWN_CHANGE`.
 */
const CLEARED_PIN = { latitude: "", longitude: "" };

/**
 * Everything a TOWN change invalidates: the town itself, its "Other" escape,
 * and the sub-area beneath it.
 *
 * Spread by all four paths that change the town — the picker, "Other", a "did
 * you mean" suggestion, and back-to-list — so they cannot drift apart. Three of
 * this repo's defects have been one of these paths forgetting a field.
 *
 * **The pin is deliberately NOT here** (owner ruling, 2026-08-26; it was, until
 * then). Editing the town is how a user corrects a value the pin produced, and
 * clearing the pin made that correction unsaveable: the save then demanded a
 * pin, re-placing it re-derived the same town over the correction, and round it
 * went. `area_overridden` — the event built to measure precisely that
 * disagreement — could never fire. A town edit says the geocoder read the
 * coordinate wrongly, not that the coordinate is wrong.
 */
export const CLEARED_BY_TOWN_CHANGE = {
  town: "",
  townOther: "",
  subArea: "",
  subAreaOther: "",
} as const;

/**
 * Everything a CITY change invalidates: all of the above, plus the pin and the
 * house number.
 *
 * The house number is in THIS list and not in the town one, and that asymmetry
 * is the decision (P2-15). A coordinate is absolute — after any place change it
 * is provably wrong. A house number is relative: "14-B" is meaningless without
 * its area rather than incorrect within it, and someone who mis-taps a town and
 * corrects it usually still lives at 14-B, so clearing there would force a
 * pointless retype. A different CITY is the stronger signal — and since the
 * field is mandatory, a value carried across one would satisfy validation and
 * save silently against an address it was never written for.
 */
export const CLEARED_BY_CITY_CHANGE = {
  ...CLEARED_BY_TOWN_CHANGE,
  ...CLEARED_PIN,
  houseNo: "",
} as const;

/**
 * Everything a PROVINCE change invalidates: the city, and therefore everything
 * a city change invalidates too.
 *
 * Province is only a filter, but changing it can leave the chosen city outside
 * the offered list — a selection the user can no longer see or re-pick. Clearing
 * the city is what keeps the picker and the value in step.
 *
 * **This cascade reaching the PIN is intended behaviour (owner ruling,
 * 2026-08-26). Do not "fix" it.**
 *
 * It was raised as a defect: in the confirm modal, using the province filter to
 * correct a wrong city also destroys a pin that was right, because province
 * clears the city and a city change clears the pin. The ruling is that this is
 * the correct trade, and it is NOT the same shape as the town inversion above.
 * A town is PRODUCED by the pin, so clearing the pin on a town edit destroys the
 * evidence being corrected. A province is not produced by anything — it is
 * chosen, upstream of the city, to narrow a list of 58. Changing it is a
 * statement that the whole place is wrong, not that one derived label was read
 * wrongly, and a pin is the most place-specific value on the form. Keeping a
 * coordinate across a province change would let a Karachi pin sit under a
 * Peshawar address and satisfy validation, which is the failure the mandatory
 * cascade exists to prevent — and which a real screenshot showed happening.
 *
 * The cost is a re-pin for someone who used the filter as a search box. That is
 * accepted: re-pinning is one map tap, and the alternative silently saves a
 * wrong address. Cheap and loud beats invisible and wrong.
 */
export const CLEARED_BY_PROVINCE_CHANGE = {
  ...CLEARED_BY_CITY_CHANGE,
  city: "",
} as const;

/**
 * A town edit, described rather than performed, so it can be held pending an
 * answer and replayed unchanged once one arrives. Mirrors the three entry
 * points exactly: the picker, the "Other" escape (and its suggestions), and
 * back-to-list.
 */
export type PendingTownChange =
  | { kind: "select"; town: string }
  | { kind: "custom" }
  | { kind: "list" };

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

  /**
   * Which pin the in-flight prefill request belongs to.
   *
   * Bumped by every `confirmPin` and `clearPin`. A reply carrying an older
   * number describes a pin that is no longer on the map and is dropped. This
   * replaced an earlier "only fill blanks" rule, which protected against the
   * same race — an 8s request landing after the user had typed — but at the
   * cost of a NEW pin being unable to correct a town the previous one set.
   * Sequencing separates the two questions: staleness is decided by which pin
   * the answer is about, not by whether the field happens to be empty.
   */
  const prefillSeqRef = useRef(0);

  /**
   * Whether the current town / sub-area were written by a prefill rather than
   * chosen by the user.
   *
   * A derived value describes the pin it came from, so when the pin moves and
   * the new position resolves to nothing, it is stale and must go. A value the
   * USER chose is their answer and survives regardless — this is the whole
   * distinction that lets a new pin replace its predecessor's guesses without
   * ever discarding an answer somebody typed.
   */
  const derivedRef = useRef({ town: false, subArea: false });

  /**
   * Whether the town currently in the field is a GUESS the user should check.
   *
   * True only where both halves hold: a pin derived this town (rather than the
   * user choosing it), and the registry rates that area `provisional` rather
   * than `measured` — see `getPrefillConfidence`. `measured` areas are shown
   * exactly as they always were, because they carry a >=85% figure and a note
   * on every one of them would train people to ignore the note.
   *
   * Computed at render rather than stored, and deliberately so. The obvious
   * alternative — a state flag written beside every `derivedRef.current.town`
   * write — cannot be made correct here: `applyPinPrefill` decides `town` and
   * `derived.town` INSIDE a `setValues` updater, which React runs lazily at
   * render time. The existing code gets away with it only because it hands the
   * updater an object and re-reads that same reference later; a boolean or a
   * string captured the same way is still empty when the line after
   * `setValues` runs. Deriving here sidesteps the ordering entirely: by the
   * time this body executes, the queue has been drained.
   *
   * Reading a ref during render is the read half of that rule, not the write
   * half — and every transition that changes this also changes `values`, so
   * there is no state this can be stale against.
   */
  const townPrefillIsGuess =
    derivedRef.current.town &&
    getPrefillConfidence(values.city, values.town) === "provisional";

  /**
   * A town edit held back until the user says which kind of edit it is.
   *
   * Null whenever nothing is being asked, which is the overwhelming majority of
   * the time — `townChangeNeedsConfirm` decides, and it is deliberately narrow.
   */
  const [pendingTownChange, setPendingTownChange] =
    useState<PendingTownChange | null>(null);

  // ── Derived options ──────────────────────────────────────────────────────
  // City is the top of the cascade now that the province dropdown is gone, so
  // every registry city is offered at once — 100+ entries, which is exactly why
  // this field uses the searchable picker.
  const provinceOptions = useMemo(() => getAllProvinces(), []);

  // Scoped by the province filter when one is set, and the FULL list when it is
  // not — including when the province names nothing the registry knows. The
  // picker must never be empty; see `getCitiesForPicker`.
  const cityOptions = useMemo(
    () => getCitiesForPicker(values.province),
    [values.province],
  );

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
   * Province narrows which cities are offered. It is not saved and is not part
   * of the answer — see `LocationFormValues.province`.
   *
   * Clearing the city looks aggressive for a mere filter, but the alternative
   * is worse: a city outside the new province stays selected while being absent
   * from the list, so the user can see a value they cannot re-pick and cannot
   * tell whether it still applies.
   */
  const selectProvince = useCallback((province: string) => {
    setValues((prev) => {
      if (province === prev.province) return prev;
      return { ...prev, ...CLEARED_BY_PROVINCE_CHANGE, province };
    });
    setTownIsCustom(false);
    setSubAreaIsOther(false);
  }, []);

  /**
   * City is the top of the SAVED cascade. Changing it clears town, sub-area,
   * the house number and the pin — see `CLEARED_BY_CITY_CHANGE` for why the
   * house number and the pin are on that list and not on the town one.
   */
  const selectCity = useCallback((city: string) => {
    setValues((prev) => {
      if (city === prev.city) return prev; // re-picking is not a change
      return {
        ...prev,
        ...CLEARED_BY_CITY_CHANGE,
        // Clearing the pin is for a CHANGE of city, not the first choice of
        // one. With the map openable from the province rung, a user may place a
        // pin and then name the city it sits in — wiping it there would punish
        // the exact order the province viewport exists to support, and there is
        // no old city for it to be wrong about.
        ...(prev.city ? {} : { latitude: prev.latitude, longitude: prev.longitude }),
        city,
        // Keep the filter honest. Picking a city with no province chosen (or
        // one from a different province, which the unfiltered list allows)
        // would otherwise leave the two contradicting each other on screen.
        province: getProvinceForCity(city) ?? prev.province,
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
  const applyTownChange = useCallback((change: PendingTownChange) => {
    // Clearing `derivedRef.current.town` is also what drops the guess note:
    // the user just answered the question themselves, so whatever they picked
    // is their own answer. See `townPrefillIsGuess`.
    derivedRef.current = { town: false, subArea: false };
    setSubAreaIsOther(false);
    if (change.kind === "select") {
      setValues((prev) => {
        if (change.town === prev.town) return prev;
        return { ...prev, ...CLEARED_BY_TOWN_CHANGE, town: change.town };
      });
      setTownIsCustom(false);
      return;
    }
    setValues((prev) => ({ ...prev, ...CLEARED_BY_TOWN_CHANGE }));
    setTownIsCustom(change.kind === "custom");
  }, []);

  /**
   * Whether this town edit is the ambiguous one, and has to be asked about.
   *
   * True only when all three hold:
   *
   * - there is a town to lose (an empty one cannot be stale), and
   * - there is a pin, and
   * - **that pin did not produce this town.** `derivedRef.current.town` says a
   *   prefill wrote it from the pin now on the map; `placementRef.current`
   *   says the pin was placed in this session rather than rehydrated. Either
   *   one means the pair is fresh and consistent, so the edit can only mean
   *   "the geocoder read my coordinate wrongly" — the case the town ruling
   *   exists to protect, which must never be interrupted.
   *
   * What is left is a rehydrated pin under a town nothing this session
   * derived: the app genuinely cannot tell a mislabelled area from a house
   * move, so it stops guessing and asks. See Issue 9.
   */
  const townChangeNeedsConfirm = useCallback(
    () =>
      !!(values.town.trim() || values.townOther.trim()) &&
      !!values.latitude.trim() &&
      !!values.longitude.trim() &&
      placementRef.current === null &&
      !derivedRef.current.town,
    [values.town, values.townOther, values.latitude, values.longitude],
  );

  const requestTownChange = useCallback(
    (change: PendingTownChange) => {
      if (townChangeNeedsConfirm()) setPendingTownChange(change);
      else applyTownChange(change);
    },
    [townChangeNeedsConfirm, applyTownChange],
  );

  const selectTown = useCallback(
    (town: string) => requestTownChange({ kind: "select", town }),
    [requestTownChange],
  );

  /** Switches the town to free text. Mutually exclusive with a canonical town. */
  const useCustomTown = useCallback(
    () => requestTownChange({ kind: "custom" }),
    [requestTownChange],
  );

  /** Abandons a free-text town and returns to the list. */
  const backToTownList = useCallback(
    () => requestTownChange({ kind: "list" }),
    [requestTownChange],
  );

  /**
   * Answers the pending question and applies the edit either way.
   *
   * `moved: true` means the address itself changed, so the coordinate is wrong
   * and goes; `false` means only the label was wrong, which is the existing
   * behaviour unchanged. Returns whether the pin was cleared, so a host can
   * open the map on the answer that needs a new one.
   */
  const resolveTownChange = useCallback(
    (moved: boolean): boolean => {
      const change = pendingTownChange;
      setPendingTownChange(null);
      if (!change) return false;
      applyTownChange(change);
      if (!moved) return false;
      setValues((prev) => ({ ...prev, ...CLEARED_PIN }));
      placementRef.current = null;
      prefillSeqRef.current += 1;
      return true;
    },
    [pendingTownChange, applyTownChange],
  );

  /** Backs out of the edit entirely, leaving the town and the pin as they were. */
  const cancelTownChange = useCallback(() => setPendingTownChange(null), []);

  const selectSubArea = useCallback((subArea: string) => {
    derivedRef.current.subArea = false;
    setValues((prev) => ({ ...prev, subArea, subAreaOther: "" }));
    setSubAreaIsOther(false);
  }, []);

  const useCustomSubArea = useCallback(() => {
    derivedRef.current.subArea = false;
    setValues((prev) => ({ ...prev, subArea: "", subAreaOther: "" }));
    setSubAreaIsOther(true);
  }, []);

  /** Commits a confirmed pin, with how it was placed. */
  /**
   * Commits a confirmed pin, with how it was placed.
   *
   * Returns the token identifying THIS pin. A caller that goes on to
   * reverse-geocode must hand the token back to `applyPinPrefill`, which is how
   * a reply about a pin the user has since moved gets discarded.
   */
  const confirmPin = useCallback(
    (latitude: string, longitude: string, placement?: PinPlacement): number => {
      setValues((prev) => ({ ...prev, latitude, longitude }));
      placementRef.current = placement ?? null;
      prefillSeqRef.current += 1;
      return prefillSeqRef.current;
    },
    [],
  );

  /**
   * Fills the fields BELOW the pin from what the geocoder made of it.
   *
   * Only town, sub-area and street. Two deliberate omissions:
   *
   *  - **City is never overwritten.** In this flow the user picked it before
   *    dropping the pin, so it is an answer, not a guess. A geocoder that
   *    disagrees is describing where the pin landed, which may legitimately be
   *    across a boundary from where someone lives — and silently rewriting a
   *    field the user has already answered is the one thing this form does not
   *    do anywhere else.
   *  - **House number is never prefilled.** The geocoder cannot know it. It is
   *    the field the user always types, which is the whole reason it is
   *    mandatory.
   *
   * Everything here is a SUGGESTION the user can change; `buildPrefill` has
   * already refused to pre-select anything non-residential or non-canonical.
   *
   * **It fills blanks only.** An empty geocoder value must not wipe an answer,
   * and — the case that actually bites — neither must a late one: the request
   * has an 8s budget and the user keeps typing while it is in flight, so a
   * result that lands after they have picked their own town would otherwise
   * silently replace it. Filling blanks makes the outcome the same whether the
   * geocoder answers in 200ms, in 8s, or never.
   */
  const applyPinPrefill = useCallback(
    (
      prefill: { town?: string; subArea?: string; street?: string },
      seq: number,
    ): boolean => {
      // A reply about a pin that is no longer on the map. Dropping it here is
      // what makes overwriting safe below.
      //
      // Returns whether it applied, because a caller may have bookkeeping of
      // its own to keep in step — the confirm modal has to update the
      // suggestion the `area_overridden` metric is measured against, and must
      // not do so off an answer this rejected.
      if (seq !== prefillSeqRef.current) return false;

      let nextDerived = { ...derivedRef.current };
      const town = prefill.town?.trim() ?? "";
      const subArea = prefill.subArea?.trim() ?? "";
      const street = prefill.street?.trim() ?? "";

      setValues((prev) => {
        const next = { ...prev };

        // The suggested town must be canonical for the city the USER chose, not
        // for whichever city the geocoder decided the pin sits in. Those can
        // differ — a pin near a boundary resolves to the neighbouring city —
        // and `buildPrefill` validates against its own answer. Writing a Lahore
        // town under a Karachi city produces a value absent from the town
        // picker and a save blocked by a validation error naming a field the
        // user never touched.
        const townFitsCity = !!town && isCanonicalTown(prev.city, town);

        if (townFitsCity) {
          next.town = town;
          next.townOther = "";
          nextDerived.town = true;
        } else if (nextDerived.town) {
          // The new pin resolved to nothing, and what is in the field was
          // written by the PREVIOUS pin — so it describes somewhere the user is
          // no longer pointing at. Clearing beats leaving a confident stale
          // value under a coordinate that contradicts it. A town the user chose
          // is untouched here, which is the point of tracking this at all.
          next.town = "";
          next.townOther = "";
          nextDerived.town = false;
        }

        // Same rule one level down: a sub-area belongs to a town, so it is only
        // offerable once the town above it is settled and agrees.
        const townForSubArea = next.town;
        const subAreaFitsTown =
          !!subArea &&
          getSubAreasForTown(prev.city, townForSubArea).includes(subArea);

        if (subAreaFitsTown) {
          next.subArea = subArea;
          next.subAreaOther = "";
          nextDerived.subArea = true;
        } else if (nextDerived.subArea || next.town !== prev.town) {
          // Cleared when it was derived, and ALSO whenever the town moved
          // underneath it: a block belongs to exactly one town, so a Phase 8
          // left over from DHA is meaningless once the town is Clifton — even
          // if the user picked that phase themselves.
          next.subArea = "";
          next.subAreaOther = "";
          nextDerived.subArea = false;
        }

        // Street is free text and the only field `blockHint` may reach. Still
        // blanks-only, deliberately: it is the one field carrying something a
        // person may have typed at length, and the hint behind it is a raw
        // geocoder string rather than a registry value, so it has not earned
        // the right to replace their words.
        if (street && !prev.address.trim()) {
          next.address = street;
        }
        return next;
      });

      derivedRef.current = nextDerived;
      if (nextDerived.town) setTownIsCustom(false);
      if (nextDerived.subArea) setSubAreaIsOther(false);
      return true;
    },
    [],
  );

  const clearPin = useCallback(() => {
    setValues((prev) => ({ ...prev, ...CLEARED_PIN }));
    placementRef.current = null;
    // Invalidates any in-flight prefill: there is no pin for it to describe.
    prefillSeqRef.current += 1;
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
    (
      next: Partial<LocationFormValues>,
      placement: PinPlacement | null = null,
      derived: { town?: boolean; subArea?: boolean } = {},
    ) => {
      const city = (next.city || "").trim();
      setValues({
        ...EMPTY,
        ...next,
        // Province precedence, and the order is the decision (Issue 8).
        //
        // 1. The REGISTRY wins whenever it recognises the city. It is the only
        //    source that cannot contradict the city on screen, and keeping the
        //    filter honest is the whole reason this field is derived rather
        //    than asked for.
        // 2. Otherwise fall back to whatever the caller carried in — in
        //    practice the profile's own saved `province`, which both hosts now
        //    pass. This is the legacy-user rescue: a city outside the registry
        //    derives nothing, and since province became MANDATORY on
        //    2026-08-26 an empty field blocked the save outright. The only way
        //    out was to pick a province, which fires
        //    `CLEARED_BY_PROVINCE_CHANGE` and wipes the city, town, house
        //    number and pin the user came in with. Their stored province —
        //    answered back when the dropdown existed, and required by
        //    `isProfileComplete` ever since — fills the field instead, so they
        //    edit a house number without being marched through a re-pick.
        // 3. "" only when neither knows, which is the pre-existing P0.2d null
        //    path and still blocks the save, correctly: nobody has ever
        //    answered the question.
        province: (city ? getProvinceForCity(city) : null) ?? next.province ?? "",
      });
      setTownIsCustom(!!next.townOther?.trim());
      setSubAreaIsOther(!!next.subAreaOther?.trim());
      placementRef.current = placement;
      // Defaults to "nothing here came from a pin", which is what a plain
      // rehydrate is — Edit Profile reads saved strings and passes nothing.
      //
      // The confirm modal is the exception and must say so: it resets with a
      // GEOCODED town, derived from the rehydrated pin moments earlier. Left at
      // the default, `townChangeNeedsConfirm` would read that town as
      // user-chosen and interrupt every correction of a geocoder mistake in the
      // one screen built for exactly that (Issue 9). It also keeps
      // `applyPinPrefill`'s stale-town branch honest on the first pin
      // adjustment there, which the flat `false` quietly disabled.
      derivedRef.current = {
        town: !!derived.town,
        subArea: !!derived.subArea,
      };
      prefillSeqRef.current += 1;
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
    townPrefillIsGuess,

    provinceOptions,
    cityOptions,
    townOptions,
    subAreaOptions,
    townSuggestions,
    subAreaSuggestions,
    blockLabel,
    houseNoField,

    selectProvince,
    selectCity,
    selectTown,
    useCustomTown,
    backToTownList,
    pendingTownChange,
    resolveTownChange,
    cancelTownChange,
    selectSubArea,
    useCustomSubArea,

    confirmPin,
    applyPinPrefill,
    clearPin,
    placementRef,
    forgetPlacement,
  };
}

export type LocationFormApi = ReturnType<typeof useLocationForm>;
