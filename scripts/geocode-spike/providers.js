/**
 * Geocoding providers for the P0.1a sweep.
 *
 * LocationIQ and Nominatim share a parser on purpose: LocationIQ *is*
 * Nominatim, so its `address` object comes back in the same shape. That is why
 * swapping the provider does not change what the sweep measures — only where
 * the request goes.
 *
 * Google is a different stack and gets its own parser. It is a capped baseline,
 * not a candidate for the whole run: see the ToS notes in README before
 * treating its numbers as a shippable option.
 */

/**
 * Reads a Nominatim-shaped address object.
 *
 * Field choice is measured, not guessed. Over 413 Karachi points with a known
 * area, scoring each field on its own:
 *
 *   field           present  correct  WRONG
 *   suburb            187      55       3
 *   neighbourhood     337      63       7
 *   town              354     175     161
 *   city_district     413       0       0
 *
 * `town` is excluded deliberately, and it is the interesting one. It has by
 * far the best raw hit count -- and it is wrong almost as often as it is
 * right, because OSM's `town` is the ADMINISTRATIVE town. DHA, Clifton and
 * Old Clifton all sit inside "Saddar Town", so reading `town` resolves a DHA
 * pin to Saddar: a different, real, wrong area. Including `town` anywhere in
 * the chain, in any position, under either first-present or first-resolving
 * semantics, pins precision at 58%. Dropping it gives 91%.
 *
 *   suburb -> neighbourhood          91% precision, 20% recall
 *   suburb -> neighbourhood -> town  58% precision, 54% recall
 *
 * Precision is the one that matters. The geocoder is a hint the user confirms,
 * a miss is an honest miss, and this registry's invariant is that a raw
 * geocoder string is never written into `town`. A silently wrong area costs
 * more than a blank one.
 *
 * `city_district` is excluded outright: present on all 413 points, correct on
 * none, because it names the district -- a rung above anything in this
 * registry. Left in the chain it shadowed every field behind it.
 */
function parseNominatimAddress(body) {
  const a = body?.address ?? {};
  return {
    areaRaw: a.suburb ?? a.neighbourhood ?? null,
    // `town` belongs here, at the city rung, where it is not misleading.
    cityRaw: a.city ?? a.town ?? a.municipality ?? null,
    blockHint: a.neighbourhood ?? a.residential ?? null,
    road: a.road ?? null,
    houseNumber: a.house_number ?? null,
  };
}

function parseGoogle(body) {
  const first = body?.results?.[0];
  const get = (type) =>
    first?.address_components?.find((c) => c.types.includes(type))?.long_name ??
    null;
  // Order matters, and the obvious spelling is wrong. `get("sublocality")`
  // matches the FIRST component carrying the bare `sublocality` type, and
  // Google returns components most-specific-first -- so sublocality_level_2
  // (the block: "Block 2", "Phase 6") always beat sublocality_level_1 (the
  // area: "P.E.C.H.S.", "Defence Housing Authority"). The sweep was reading
  // the block and then reporting the area as unregistered. Ask for the level
  // wanted, by name, and keep the bare type only as a last resort.
  return {
    areaRaw:
      get("sublocality_level_1") ??
      get("neighborhood") ??
      get("sublocality") ??
      null,
    cityRaw: get("locality") ?? null,
    blockHint: get("sublocality_level_2") ?? get("neighborhood") ?? null,
    road: get("route") ?? null,
    houseNumber: get("street_number") ?? null,
  };
}

const PROVIDERS = {
  /** Self-hosted or any Nominatim-protocol endpoint. Needs --base. */
  nominatim: {
    name: "nominatim",
    keyEnv: null,
    needsBase: true,
    // Local box: pace it anyway. A tight loop still buries your own hardware.
    defaultDelayMs: 120,
    buildUrl: ({ base, lat, lng }) =>
      `${base.replace(/\/$/, "")}/reverse` +
      `?format=jsonv2&addressdetails=1&zoom=16&accept-language=en&lat=${lat}&lon=${lng}`,
    parse: parseNominatimAddress,
  },

  /** Hosted Nominatim. Free tier: ~2 req/s, 5k/day. */
  locationiq: {
    name: "locationiq",
    keyEnv: "LOCATIONIQ_API_KEY",
    needsBase: false,
    // 2 req/s is the free-tier ceiling; 600ms leaves headroom so a burst of
    // retries does not trip the limiter and poison results with 429s.
    defaultDelayMs: 600,
    // Base is overridable: LocationIQ has regional endpoints (us1/eu1), and a
    // local stub is how the retry/quota paths get tested without burning quota.
    defaultBase: "https://us1.locationiq.com/v1",
    buildUrl: ({ base, lat, lng, key }) =>
      `${(base || "https://us1.locationiq.com/v1").replace(/\/$/, "")}/reverse` +
      `?key=${encodeURIComponent(key)}&lat=${lat}&lon=${lng}` +
      `&format=json&addressdetails=1&zoom=16&accept-language=en`,
    parse: parseNominatimAddress,
  },

  /** Capped comparison baseline only. */
  google: {
    name: "google",
    keyEnv: "GOOGLE_GEOCODING_API_KEY",
    needsBase: false,
    defaultDelayMs: 120,
    // Overridable so the label/retry paths can be tested against a stub
    // without spending metered calls.
    defaultBase: "https://maps.googleapis.com/maps/api",
    buildUrl: ({ base, lat, lng, key }) =>
      `${(base || "https://maps.googleapis.com/maps/api").replace(/\/$/, "")}/geocode/json` +
      `?latlng=${lat},${lng}&language=en&key=${encodeURIComponent(key)}`,
    parse: parseGoogle,
  },
};

/**
 * Refuses a key supplied through an EXPO_PUBLIC_-prefixed variable.
 *
 * Anything with that prefix is inlined into the shipped JS bundle by Expo. A
 * geocoding key that drifts into one becomes a scrapeable, billable secret in
 * every installed app — the exact failure the plan's "never call the geocoder
 * from the client" rule exists to prevent.
 */
function assertNotPublicEnv(envName) {
  const leaked = Object.keys(process.env).filter(
    (k) => k.startsWith("EXPO_PUBLIC_") && /LOCATIONIQ|GEOCOD|MAPS?_API/i.test(k),
  );
  if (leaked.length) {
    throw new Error(
      `Refusing to run: ${leaked.join(", ")} is set.\n` +
        `EXPO_PUBLIC_* variables are inlined into the shipped app bundle, so a ` +
        `geocoding key there is scrapeable and billable by anyone with the app.\n` +
        `Pass the key as ${envName} instead, at invocation only.`,
    );
  }
}

function resolveProvider(name, { base } = {}) {
  const p = PROVIDERS[name];
  if (!p) {
    throw new Error(
      `Unknown provider "${name}". Choose one of: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  if (p.needsBase && !base) {
    throw new Error(
      `--base=http://HOST:PORT is required for "${name}".\n` +
        `Do NOT point it at nominatim.openstreetmap.org: the public instance ` +
        `caps at 1 req/sec and its usage policy prohibits bulk work.`,
    );
  }
  let key = null;
  if (p.keyEnv) {
    assertNotPublicEnv(p.keyEnv);
    key = process.env[p.keyEnv];
    if (!key) throw new Error(`${p.keyEnv} is not set — required for "${name}".`);
  }
  return { ...p, base, key };
}

module.exports = {
  PROVIDERS,
  resolveProvider,
  parseNominatimAddress,
  parseGoogle,
  assertNotPublicEnv,
};
