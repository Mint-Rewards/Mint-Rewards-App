/**
 * P2-6 — integrity of the shipped centroid tables.
 *
 * These are the sweep's own acceptance rules, re-asserted against the data that
 * actually landed in the file. The sweep runs offline, by hand, roughly never;
 * a bad paste, a hand-added "obvious" entry, or a swapped coordinate pair would
 * otherwise reach users with nothing in between. A centroid is only ever a map
 * camera position, so none of this is about survey accuracy — it is about the
 * failure that motivated leaving the tables empty for a release: a confident,
 * plausible, WRONG neighbourhood.
 */
import { describe, expect, it } from "@jest/globals";
import {
  AREA_CENTROIDS,
  CITY_CENTROIDS,
  PAKISTAN_LOCATIONS,
  getAreaCentroid,
  getCityCentroid,
  getTownsForCity,
} from "@/utils/pakistan_areas";

/** Generously drawn; the sweep rejects anything outside it. */
const PK = { minLng: 60.5, maxLng: 77.9, minLat: 23.5, maxLat: 37.2 };

const ALL_CITIES = Object.values(PAKISTAN_LOCATIONS.cities).flat();

function distanceKm(
  [lngA, latA]: readonly [number, number],
  [lngB, latB]: readonly [number, number],
): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(latB - latA);
  const dLng = rad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

describe("every centroid names something in the registry", () => {
  it("every city centroid key is a registry city", () => {
    const unknown = Object.keys(CITY_CENTROIDS).filter(
      (c) => !ALL_CITIES.includes(c),
    );
    // A key nobody can select is dead weight that still looks like coverage.
    expect(unknown).toEqual([]);
  });

  it("every area centroid key is a real city::town pair", () => {
    const unknown = Object.keys(AREA_CENTROIDS).filter((key) => {
      const [city, town] = key.split("::");
      return !getTownsForCity(city).includes(town);
    });
    expect(unknown).toEqual([]);
  });
});

describe("every centroid is inside Pakistan", () => {
  it("no entry falls outside the national bounding box", () => {
    // Also the lat/lng-swap detector: Karachi swapped is 67°N 24°E, which is in
    // the Barents Sea and fails both halves at once.
    //
    // Every offender is collected and asserted at once rather than run as a
    // case per row. 268 near-identical entries in the test count would drown
    // the suite, and one failing case naming one key is less useful here than
    // the whole list — a bad paste breaks a contiguous run of them.
    const outside = Object.entries({ ...CITY_CENTROIDS, ...AREA_CENTROIDS })
      .filter(
        ([, [lng, lat]]) =>
          lng < PK.minLng ||
          lng > PK.maxLng ||
          lat < PK.minLat ||
          lat > PK.maxLat,
      )
      .map(([key, point]) => `${key} @ ${point.join(",")}`);
    expect(outside).toEqual([]);
  });
});

describe("no coordinate is claimed by two names", () => {
  it("no two entries share a point", () => {
    // Two areas cannot share a centroid to six decimals (~11cm). A repeat means
    // the geocoder fell back to one generic feature for a class of names —
    // which really happened on the first sweep, where a single "Sector G, DHA
    // Phase 2" point came back for five different Islamabad sectors.
    const seen = new Map<string, string>();
    const shared: string[] = [];
    for (const [key, point] of Object.entries({
      ...CITY_CENTROIDS,
      ...AREA_CENTROIDS,
    })) {
      const at = point.join(",");
      const first = seen.get(at);
      if (first) shared.push(`${first} and ${key} both claim ${at}`);
      else seen.set(at, key);
    }
    expect(shared).toEqual([]);
  });
});

describe("an area sits inside its own city", () => {
  it("no area centroid is further than 60km from its city's", () => {
    // Town names repeat nationally — "Model Town", "Satellite Town", "Cantt"
    // exist in a dozen cities — so the likeliest wrong answer is the right name
    // in the WRONG city, which cross-provider agreement cannot catch because
    // both providers make it. 60km is drawn around Karachi, the widest city
    // here. Cities the sweep did not confirm are skipped: there is nothing
    // trustworthy to measure against.
    const stray = Object.keys(AREA_CENTROIDS)
      .map((key) => {
        const [city, town] = key.split("::");
        const cityPoint = getCityCentroid(city);
        if (!cityPoint) return null;
        const km = distanceKm(getAreaCentroid(city, town)!, cityPoint);
        return km >= 60 ? `${key} is ${km.toFixed(1)}km from ${city}` : null;
      })
      .filter(Boolean);
    expect(stray).toEqual([]);
  });
});

describe("coverage, stated rather than assumed", () => {
  it("covers the cities that operations actually run in", () => {
    // Tier A and B. If a future sweep drops one of these the map silently
    // reverts to a country-wide view for the users who matter most.
    for (const city of ["Karachi", "Lahore", "Islamabad"]) {
      expect(getCityCentroid(city)).not.toBeNull();
    }
  });

  it("is partial, and the fallback path stays exercised", () => {
    const cityCoverage = Object.keys(CITY_CENTROIDS).length / ALL_CITIES.length;
    expect(cityCoverage).toBeGreaterThan(0.8);
    // Deliberately NOT 100%. Every consumer must keep handling a miss: the
    // sweep drops whatever its two providers disagree about, and no registry
    // will ever outrun the names people type into the "Other" box.
    const towns = Object.values(PAKISTAN_LOCATIONS.towns).flat().length;
    expect(Object.keys(AREA_CENTROIDS).length).toBeLessThan(towns);
  });

  it("resolves a known area through the accessor, not just the table", () => {
    // DHA Karachi: ~24.81N, ~67.08E, and the tightest-zoom path in the app.
    const dha = getAreaCentroid("Karachi", "DHA");
    expect(dha).not.toBeNull();
    expect(dha![1]).toBeCloseTo(24.81, 1);
    expect(dha![0]).toBeCloseTo(67.08, 1);
  });
});
