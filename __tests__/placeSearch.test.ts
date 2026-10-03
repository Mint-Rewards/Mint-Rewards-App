/**
 * Typing a place name to move the map.
 *
 * The ranking is the whole feature. A name like "Saddar" exists in four
 * cities, and offering a household in Karachi the one in Peshawar first is
 * how somebody sets their pin 1,200km from their house.
 */
import { describe, expect, it } from "@jest/globals";
import { searchNeedsNetwork, searchPlaces } from "@/utils/placeSearch";

describe("searchPlaces", () => {
  it("says nothing for a single character", () => {
    // One letter matches half the country and is never a real intent.
    expect(searchPlaces("n")).toEqual([]);
    expect(searchPlaces(" ")).toEqual([]);
  });

  it("finds a town in the city the person already chose", () => {
    const hits = searchPlaces("nazim", { city: "Karachi" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.city).toBe("Karachi");
    expect(hits[0]!.label).toMatch(/Nazimabad/i);
    expect(hits[0]!.centre).not.toBeNull();
  });

  it("puts the person's own city ahead of the same name elsewhere", () => {
    // Saddar is in Karachi, Rawalpindi, Peshawar and Quetta. The one under
    // their feet is the one they mean.
    const karachi = searchPlaces("saddar", { city: "Karachi" });
    expect(karachi[0]!.city).toBe("Karachi");

    const pindi = searchPlaces("saddar", { city: "Rawalpindi" });
    expect(pindi[0]!.city).toBe("Rawalpindi");
  });

  it("prefers a name that starts with what was typed", () => {
    // "model" should offer Model Colony before Shah Faisal Colony, which
    // merely contains "col".
    const hits = searchPlaces("model", { city: "Karachi" });
    expect(hits[0]!.label.toLowerCase().startsWith("model")).toBe(true);
  });

  it("still finds cities when no city has been chosen yet", () => {
    const hits = searchPlaces("lahor");
    expect(hits.some((h) => h.label === "Lahore" && h.kind === "city")).toBe(true);
  });

  it("carries a coordinate the map can fly to", () => {
    const [first] = searchPlaces("clifton", { city: "Karachi" });
    expect(first!.centre).toEqual({
      latitude: expect.any(Number),
      longitude: expect.any(Number),
    });
    // Karachi, not Bristol: inside Pakistan's bounding box.
    expect(first!.centre!.latitude).toBeGreaterThan(23);
    expect(first!.centre!.latitude).toBeLessThan(38);
    expect(first!.centre!.longitude).toBeGreaterThan(60);
    expect(first!.centre!.longitude).toBeLessThan(78);
  });

  it("does not repeat the same place twice", () => {
    const hits = searchPlaces("a", { city: "Karachi", limit: 50 });
    const labels = hits.map((h) => `${h.city}:${h.label}`);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("honours the limit, so the list never buries the map", () => {
    expect(searchPlaces("a", { city: "Karachi", limit: 5 }).length).toBeLessThanOrEqual(5);
  });
});

describe("searchNeedsNetwork", () => {
  it("stays local when the registry placed something", () => {
    const hits = searchPlaces("nazimabad", { city: "Karachi" });
    expect(searchNeedsNetwork("nazimabad", hits)).toBe(false);
  });

  it("reaches for the network only when nothing can be placed", () => {
    // A landmark the registry does not carry.
    expect(searchNeedsNetwork("lucky one mall", [])).toBe(true);
  });

  it("will not spend a request on two characters", () => {
    // Below three characters a remote search returns half a province and
    // costs the same as a useful one.
    expect(searchNeedsNetwork("na", [])).toBe(false);
  });

  it("treats a name with no coordinate as unplaced", () => {
    // The registry knows the name but not where it is, which is no use to a
    // map — that is exactly when the network earns its request.
    expect(
      searchNeedsNetwork("somewhere", [
        { label: "Somewhere", city: "Karachi", centre: null, kind: "town" },
      ]),
    ).toBe(true);
  });
});
