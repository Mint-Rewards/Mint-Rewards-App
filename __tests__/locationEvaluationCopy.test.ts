/**
 * The server's verdict, made readable.
 *
 * These are wire identifiers reaching a person, so the two failure modes worth
 * guarding are showing them raw ("areaId is missing") and saying nothing at all
 * when there IS something to say.
 */
import { describe, expect, it } from "@jest/globals";
import {
  describeMissingFields,
  missingSentence,
} from "@/utils/locationEvaluation";

describe("describeMissingFields", () => {
  it("names each field the way the form does", () => {
    expect(describeMissingFields(["cityId", "areaId", "pin"])).toEqual([
      "City",
      "Town",
      "Map pin",
    ]);
  });

  it("keeps the server's order", () => {
    expect(describeMissingFields(["pin", "cityId"])).toEqual([
      "Map pin",
      "City",
    ]);
  });

  it("uses the registry's wording for the house number", () => {
    // Residential: a house or flat number.
    expect(
      describeMissingFields(["houseNo"], { city: "Karachi", town: "DHA" }),
    ).toEqual(["House / flat no."]);
    // Non-residential: the same field, a question a plot can answer.
    expect(
      describeMissingFields(["houseNo"], {
        city: "Karachi",
        town: "Korangi Industrial Area",
      }),
    ).toEqual(["Unit / building name"]);
  });

  it("drops a requirement this build does not know about", () => {
    // A server that adds a fifth field before the client ships support for it
    // must not produce "you are missing deliveryWindowId".
    expect(describeMissingFields(["pin", "deliveryWindowId"])).toEqual([
      "Map pin",
    ]);
  });

  it("never throws on a malformed body", () => {
    for (const raw of [null, undefined, "pin", 3, {}]) {
      expect(() => describeMissingFields(raw as never)).not.toThrow();
      expect(describeMissingFields(raw as never)).toEqual([]);
    }
  });
});

describe("missingSentence", () => {
  it("names one outstanding field", () => {
    expect(missingSentence({ complete: false, missing: ["pin"] })).toBe(
      "Your address still needs Map pin before you can book a pickup.",
    );
  });

  it("lists several the way a person writes a list", () => {
    expect(
      missingSentence({ complete: false, missing: ["cityId", "areaId", "pin"] }),
    ).toBe(
      "Your address still needs City, Town and Map pin before you can book a pickup.",
    );
  });

  it("says nothing when the profile is complete", () => {
    expect(missingSentence({ complete: true, missing: [] })).toBeNull();
  });

  it("says nothing when there is no evaluation at all", () => {
    expect(missingSentence(null)).toBeNull();
    expect(missingSentence(undefined)).toBeNull();
  });

  it("tells a user who CAN see a coordinate what to actually do", () => {
    const sentence = missingSentence(
      { complete: false, missing: ["pin"] },
      { hasCoordinate: true },
    )!;
    // "Your address still needs Map pin" in front of a visible coordinate reads
    // as a broken app. The server rejected it for its SOURCE, not its absence.
    expect(sentence).not.toContain("still needs Map pin");
    expect(sentence).toContain("Adjust pin");
    expect(sentence).toContain("re-confirming");
  });

  it("still lists the other outstanding fields alongside the re-confirm", () => {
    const sentence = missingSentence(
      { complete: false, missing: ["areaId", "pin"] },
      { hasCoordinate: true },
    )!;
    expect(sentence).toContain("Adjust pin");
    expect(sentence).toContain("Town");
  });

  it("names the field plainly when there is no coordinate to confuse it with", () => {
    expect(
      missingSentence({ complete: false, missing: ["pin"] }, { hasCoordinate: false }),
    ).toBe("Your address still needs Map pin before you can book a pickup.");
  });

  it("stays silent rather than vague when nothing is recognisable", () => {
    // "Something is wrong and we can't say what" cannot be acted on, and it
    // undermines a save that genuinely succeeded.
    expect(
      missingSentence({ complete: false, missing: ["deliveryWindowId"] }),
    ).toBeNull();
  });
});
