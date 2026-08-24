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
 * All three of suburb / city_district / neighbourhood are tried before
 * declaring a miss. Nominatim is inconsistent about which key carries the
 * locality, and reading only `suburb` would under-report the hit rate — which
 * could sink the provider decision on a field-name detail rather than on data.
 */
function parseNominatimAddress(body) {
  const a = body?.address ?? {};
  return {
    areaRaw: a.suburb ?? a.city_district ?? a.neighbourhood ?? null,
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
  return {
    areaRaw: get("sublocality") ?? get("sublocality_level_1") ?? null,
    cityRaw: get("locality") ?? null,
    blockHint: get("sublocality_level_2") ?? null,
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
      `?format=jsonv2&addressdetails=1&zoom=16&lat=${lat}&lon=${lng}`,
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
      `&format=json&addressdetails=1&zoom=16`,
    parse: parseNominatimAddress,
  },

  /** Capped comparison baseline only. */
  google: {
    name: "google",
    keyEnv: "GOOGLE_GEOCODING_API_KEY",
    needsBase: false,
    defaultDelayMs: 120,
    buildUrl: ({ lat, lng, key }) =>
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}&key=${encodeURIComponent(key)}`,
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
