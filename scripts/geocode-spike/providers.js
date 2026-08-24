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
 * Field order is measured, not guessed. Over 46 Karachi points with a known
 * area, each candidate field scored:
 *
 *   town          40 present   12 correct
 *   neighbourhood 38 present    6 correct
 *   suburb        28 present    5 correct
 *   city_district 46 present    0 correct   <- always "Karachi District"
 *
 * `city_district` is excluded outright rather than demoted: it names the
 * district, a rung above anything in this registry, so it can never be right.
 * Leaving it in the chain was actively harmful -- present on every single
 * point, it shadowed every field behind it and capped the whole provider at
 * 5/46. Ordering town -> suburb -> neighbourhood scores 16/46, close to the
 * 17/46 any-field ceiling.
 *
 * That order was chosen on these same 46 points, so treat 16/46 as fitted.
 * The full sweep is the out-of-sample measurement.
 */
function parseNominatimAddress(body) {
  const a = body?.address ?? {};
  return {
    areaRaw: a.town ?? a.suburb ?? a.neighbourhood ?? null,
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
