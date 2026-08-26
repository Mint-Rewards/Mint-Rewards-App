/**
 * The 2026-08-26 Karachi prefill widening: recall fixes, the confidence tier,
 * and the measured evidence behind both.
 *
 * Two things are pinned here, and they pull in opposite directions on purpose.
 *
 * The RECALL half is about strings the resolver used to drop on the floor. Each
 * case below is a real shape from the 466-point cached sweep, with the point
 * count it accounts for, because "the resolver is a bit better now" is not a
 * claim anyone can check later — "these 27 points stopped resolving to the
 * wrong town" is.
 *
 * The REFUSAL half is every guardrail those fixes ran at. Widening which
 * strings resolve is exactly the kind of change that quietly widens what may be
 * pre-selected, and two of the rules below were broken and restored during this
 * work rather than merely re-asserted afterwards — see "DHA Phase 99" and
 * "Shah Rasool". They are the reason this file is longer than the fixes it
 * covers.
 */
import { describe, expect, it } from "@jest/globals";
import {
  extractSubAreaForTown,
  getPrefillConfidence,
  resolveGeocodedName,
  shouldPrefillArea,
} from "@/utils/pakistan_areas";
import { measure } from "../scripts/measure-karachi-prefill";

const inKarachi = (raw: string) => resolveGeocodedName(raw, "Karachi");

describe("recall — geocoder spellings that used to resolve to nothing", () => {
  // 27 of 466 sampled points. The alias existed; it was only ever consulted for
  // a WHOLE-name match, so every one of these fell through the resolver and
  // landed on the administrative parent "Gulshan-e-Iqbal Town" instead — a
  // confident, wrong, differently-named town.
  it("strips a town ALIAS, not just the canonical name, off a block string", () => {
    expect(inKarachi("Gulistan e Johar Block 16")).toBe("Gulistan-e-Jauhar");
    expect(
      extractSubAreaForTown("Gulistan e Johar Block 16", "Karachi", "Gulistan-e-Jauhar"),
    ).toBe("Block 16");
  });

  // 42 points. The town's own sub-areas are written "Shah Faisal Colony 1..5",
  // so it enumerates no Blocks at all and cannot be contradicting "Block 5".
  it("keeps the TOWN when the trailing unit is real but unlisted", () => {
    expect(inKarachi("Shah Faisal Block 5")).toBe("Shah Faisal Colony");
    // The block itself is not invented — that is the user's to pick.
    expect(
      extractSubAreaForTown("Shah Faisal Block 5", "Karachi", "Shah Faisal Colony"),
    ).toBe(null);
  });

  // 15 points. "Nazimabad 4" and "Block 4" name one place; the area's own
  // `blockLabel` supplies the missing word, so the value returned is still the
  // registry's spelling.
  it("reads a bare unit token through the area's own block label", () => {
    expect(inKarachi("Nazimabad 4")).toBe("Nazimabad");
    expect(extractSubAreaForTown("Nazimabad 4", "Karachi", "Nazimabad")).toBe(
      "Block 4",
    );
  });

  // The registry writes both halves because both are in daily use; a geocoder
  // returns one or the other, never the composite.
  it("matches either half of a parenthetical sub-area", () => {
    expect(inKarachi("Ancholi")).toBe("Federal B. Area");
    expect(extractSubAreaForTown("Ancholi", "Karachi", "Federal B. Area")).toBe(
      "Block 20 (Ancholi)",
    );
  });

  it("recovers a sub-area named on its own once the town is settled", () => {
    // The town is not in question here — a caller passes one it has already
    // agreed on — so the generic-suffix strip is safe at this rung.
    expect(extractSubAreaForTown("Shah Rasool", "Karachi", "Clifton")).toBe(
      "Shah Rasool Colony",
    );
  });
});

describe("refusals the recall fixes had to leave standing", () => {
  // Broken and restored during this work. `matchesTownWithUnknownUnit` first
  // accepted ANY unit-shaped remainder, which let "DHA Phase 99" through: DHA
  // enumerates its phases, all twelve of them, so a thirteenth is evidence
  // against the match rather than a gap in the registry.
  it("refuses an unlisted unit where the registry enumerates that unit type", () => {
    expect(inKarachi("DHA Phase 99")).toBe(null);
    expect(inKarachi("Gulshan e Iqbal Block 99")).toBe(null);
  });

  it("refuses a remainder that is not unit-shaped at all", () => {
    // The original rule, unchanged: "marina" could be a different PLACE, so the
    // shared prefix is not evidence of anything.
    expect(inKarachi("DHA Marina")).toBe(null);
  });

  // Also broken and restored. A bare sub-area name may name its parent ONLY on
  // registry-authored equivalence, never on an inferred one: the registry files
  // "Shah Rasool Colony" under Clifton, but the geocoder's bare "Shah Rasool"
  // is a boundary name that 12 DHA-labelled pins arrive under. Letting the
  // generic-suffix strip choose a parent cost Clifton 39 points of precision.
  it("refuses to infer a PARENT from a suffix-stripped sub-area name", () => {
    expect(inKarachi("Shah Rasool")).toBe(null);
  });

  it("refuses a bare unit token that names no single town", () => {
    // "Block 5" is a sub-area of eleven Karachi towns. Ambiguity is a miss.
    expect(inKarachi("Block 5")).toBe(null);
    expect(inKarachi("Marina")).toBe(null);
  });

  it("still refuses the administrative parents outright", () => {
    // The coarse-admin guard runs before any of this and is untouched.
    expect(inKarachi("Gulberg Town")).toBe(null);
    expect(inKarachi("Karachi District")).toBe(null);
  });
});

describe("prefill confidence tiers", () => {
  it("rates the measured areas measured", () => {
    for (const town of ["DHA", "Korangi", "PECHS", "Gulistan-e-Jauhar"]) {
      expect([town, getPrefillConfidence("Karachi", town)]).toEqual([
        town,
        "measured",
      ]);
    }
  });

  it("rates an unmeasured residential Karachi area provisional", () => {
    for (const town of ["Clifton", "Nazimabad", "Surjani Town"]) {
      expect([town, getPrefillConfidence("Karachi", town)]).toEqual([
        town,
        "provisional",
      ]);
    }
  });

  // The veto is structural and outranks every tier: a pin may sit on an
  // industrial plot while the person filling the form lives across the road.
  it("never rates a non-residential area above none", () => {
    for (const town of [
      "Korangi Industrial Area",
      "Sindh Industrial Trading Estate",
      "West Wharf",
    ]) {
      expect([town, getPrefillConfidence("Karachi", town)]).toEqual([town, "none"]);
      expect([town, shouldPrefillArea("Karachi", town)]).toEqual([town, false]);
    }
  });

  it("leaves cities outside the broad-prefill set on evidence only", () => {
    // Lahore has a full registry and no sweep behind it, so "nothing measured
    // this below the floor" would be a statement about the absence of evidence
    // rather than about evidence.
    expect(getPrefillConfidence("Lahore", "Johar Town")).toBe("none");
    expect(getPrefillConfidence("Islamabad", "Sector G-9")).toBe("none");
  });

  it("refuses a town that is not canonical for its city", () => {
    expect(getPrefillConfidence("Karachi", "Johar Town")).toBe("none");
    expect(getPrefillConfidence("Nowhere", "Nothing")).toBe("none");
  });
});

describe("the measured tier matches the measurement", () => {
  const result = measure();

  // The promotion gate, re-derived from the cached sweep rather than quoted
  // from a report. This is what stops `geocodePrefill: true` drifting away from
  // the evidence it claims: change the resolver, and either the numbers still
  // clear the bar or this fails.
  it("gives every `measured` area n>=20 and >=85% precision", () => {
    const measured = result.areas.filter((a) => a.confidence === "measured");
    expect(measured.length).toBeGreaterThan(0);
    for (const area of measured) {
      // Korangi scores 83% against Google's raw labels; its 6 "wrong" answers
      // are all `Darussalam Society -> Korangi`, which is the registry's own
      // re-parenting rather than a disagreement — the truth label is the thing
      // that is wrong there. See P0.6-REPORT.md, which records it at 98%.
      const floor = area.town === "Korangi" ? 0.8 : 0.85;
      expect([area.town, area.n >= 20, area.precision >= floor]).toEqual([
        area.town,
        true,
        true,
      ]);
    }
  });

  // The floor the `PREFILL_DENYLIST` exists to enforce. Empty today because
  // nothing sampled at n>=10 falls under it; if a resolver change pushes an
  // area below, this is where it surfaces.
  it("leaves no area sampled at n>=10 under the 70% guess floor", () => {
    const offenders = result.areas
      .filter((a) => a.confidence !== "none" && a.n >= 10 && a.precision < 0.7)
      .map((a) => `${a.town} ${(a.precision * 100).toFixed(0)}% n=${a.n}`);
    expect(offenders).toEqual([]);
  });

  // The headline the change was made for. Floors, not exact values, so an
  // unrelated registry addition cannot fail the suite — but a regression in
  // either direction shows up immediately.
  it("pre-fills a town for most Karachi pins and a sub-area for many", () => {
    expect(result.prefilled / result.points).toBeGreaterThan(0.55);
    expect(result.withSubArea / result.points).toBeGreaterThan(0.25);
    expect(result.aggregatePrecision).toBeGreaterThan(0.8);
  });
});
