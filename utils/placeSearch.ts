/**
 * Finding a place on the map by typing its name.
 *
 * Someone setting their pin is often not standing at their door — they are at
 * work, or on a bus, completing a profile they were nagged about. The map opens
 * on a default view and dragging from there to their own street is a minute of
 * pinching. Typing "Nazimabad" should take them there.
 *
 * ## Why this searches the registry the app already ships
 *
 * A geocoding API charges per keystroke and needs a network. The app carries a
 * complete list of Pakistan's cities, towns and sub-areas, with centroids for
 * the ones people actually live in — so the common case is answered locally,
 * instantly, for nothing, and on a bus with no signal.
 *
 * The network is a fallback for what the registry cannot place, not the first
 * move. See `searchNeedsNetwork`.
 *
 * Pure, so the matching can be tested without a map or a device.
 */
import {
  AREA_CENTROIDS,
  CITY_CENTROIDS,
  getSelectableTownsForCity,
  getSelectableSubAreasForTown,
} from "@/utils/pakistan_areas";

export interface PlaceSuggestion {
  /** What to show: "Nazimabad" or "Nazimabad, Karachi". */
  label: string;
  /** The city it belongs to, for the second line. */
  city: string;
  /** Null when the registry knows the name but not where it is. */
  centre: { latitude: number; longitude: number } | null;
  kind: "city" | "town" | "subArea";
}

const fold = (value: string) => value.trim().toLowerCase();

/**
 * How a match is ranked.
 *
 * A prefix match beats a match in the middle, because somebody typing "naz"
 * means Nazimabad and not "Gulshan-e-Nazimabad". Within that, the shorter name
 * wins: it is the more general place and the more likely intent.
 */
function score(name: string, needle: string): number | null {
  const n = fold(name);
  const i = n.indexOf(needle);
  if (i === -1) return null;
  return i * 1000 + n.length;
}

const centreOf = (lngLat: readonly [number, number] | undefined | null) =>
  lngLat ? { latitude: lngLat[1], longitude: lngLat[0] } : null;

/**
 * Suggestions for what has been typed so far.
 *
 * `city` is the one the person has already chosen in their profile. When it is
 * known, their own city's towns and sub-areas are searched first and ranked
 * above everything else — a household in Karachi typing "model" means Model
 * Colony, not Model Town in Lahore. It also means the usual case never has to
 * consider the other 871 cities.
 */
export function searchPlaces(
  query: string,
  options: { city?: string | null; limit?: number } = {},
): PlaceSuggestion[] {
  const needle = fold(query);
  // One character matches half the country and is never a real intent.
  if (needle.length < 2) return [];
  const limit = options.limit ?? 8;

  const out: { suggestion: PlaceSuggestion; rank: number }[] = [];
  const seen = new Set<string>();

  const push = (suggestion: PlaceSuggestion, rank: number) => {
    const key = `${suggestion.kind}:${suggestion.city}:${suggestion.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ suggestion, rank });
  };

  /*
   * The person's own city first, and heavily favoured.
   *
   * Not merely included — ranked ahead, because a name repeats across cities
   * and the one under their feet is the one they mean. "Saddar" exists in
   * Karachi, Rawalpindi, Peshawar and Quetta.
   */
  const home = options.city?.trim();
  if (home) {
    for (const town of getSelectableTownsForCity(home)) {
      const s = score(town, needle);
      if (s === null) continue;
      push(
        {
          label: town,
          city: home,
          centre: centreOf(AREA_CENTROIDS[`${home}::${town}`]),
          kind: "town",
        },
        s,
      );
      for (const sub of getSelectableSubAreasForTown(home, town)) {
        const ss = score(sub, needle);
        if (ss === null) continue;
        push(
          {
            label: `${sub}, ${town}`,
            city: home,
            // Sub-areas have no centroid of their own; their town's is the
            // honest approximation and still lands the map on the right
            // neighbourhood.
            centre: centreOf(AREA_CENTROIDS[`${home}::${town}`]),
            kind: "subArea",
          },
          ss + 1,
        );
      }
    }
  }

  // Cities, so somebody who has moved — or has not set a city yet — can still
  // get to the right part of the country.
  const CITY_PENALTY = 100_000;
  for (const city of Object.keys(CITY_CENTROIDS)) {
    const s = score(city, needle);
    if (s === null) continue;
    push(
      { label: city, city, centre: centreOf(CITY_CENTROIDS[city]), kind: "city" },
      home && fold(city) === fold(home) ? s : s + CITY_PENALTY,
    );
  }

  // Areas in other cities, last: useful, but never ahead of home.
  const AWAY_PENALTY = 200_000;
  for (const key of Object.keys(AREA_CENTROIDS)) {
    const [city, area] = key.split("::");
    if (!city || !area) continue;
    if (home && fold(city) === fold(home)) continue; // already covered, better
    const s = score(area, needle);
    if (s === null) continue;
    push(
      {
        label: `${area}, ${city}`,
        city,
        centre: centreOf(AREA_CENTROIDS[key]),
        kind: "town",
      },
      s + AWAY_PENALTY,
    );
  }

  return out
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((x) => x.suggestion);
}

/**
 * Whether this query is worth spending a geocoding request on.
 *
 * Only when the registry offered nothing that can be placed on a map. A query
 * the registry answered needs no network; one it could not is a landmark, a
 * village, or a spelling the registry does not carry — and those are what an
 * API is for.
 */
export function searchNeedsNetwork(
  query: string,
  suggestions: PlaceSuggestion[],
): boolean {
  // Below three characters a remote search returns half a province and costs
  // the same as a useful one.
  if (query.trim().length < 3) return false;
  return !suggestions.some((s) => s.centre !== null);
}
