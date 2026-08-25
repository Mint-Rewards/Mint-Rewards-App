/**
 * Status-aware fetch for the sweep.
 *
 * THE POINT OF THIS FILE: a rate-limit response must never be recorded as
 * "the geocoder returned nothing". If 429s are scored as misses, the hit rate
 * drops for infrastructure reasons and the auto-fill branch could be killed on
 * an artifact rather than on data quality — the same false-negative failure the
 * plan warns about when it forbids measuring against existing user records.
 *
 * Outcomes are therefore distinct and non-overlapping:
 *   { ok: true, body }        - a real answer, scoreable
 *   { fatal: true, reason }   - stop the run (bad key, quota exhausted)
 *   { error: "..." }          - transport/server failure, counted separately
 *                               from an empty result, never as a miss
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULTS = {
  timeoutMs: 10000,
  maxRetries: 4,
  baseBackoffMs: 1000,
};

async function fetchWithPolicy(url, opts = {}) {
  const { timeoutMs, maxRetries, baseBackoffMs } = { ...DEFAULTS, ...opts };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "mint-rewards-geocode-spike/1.0",
          // Node's fetch (undici) sends `Accept-Language: *` when it is not
          // set. LocationIQ reads `*` as "return the NATIVE name", so Karachi
          // areas came back in Urdu ("\u0636\u0644\u0639 \u0645\u0644\u06cc\u0631") and could never match the
          // Latin-script registry -- an agreement rate of 0% that said nothing
          // about the provider. Pin it so the header is never the variable.
          "Accept-Language": "en",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const reason = e.name === "AbortError" ? "timeout" : String(e.message);
      // Transport failures are worth one retry; a flaky socket is not a
      // statement about geocoder coverage.
      if (attempt < maxRetries) {
        await sleep(baseBackoffMs * 2 ** attempt);
        continue;
      }
      return { error: reason };
    }
    clearTimeout(timer);

    // Bad or unauthorised key. Retrying burns quota and writes nothing useful;
    // every subsequent point would fail identically.
    if (res.status === 401 || res.status === 403) {
      return { fatal: true, reason: `auth failed (http ${res.status}) — check the API key` };
    }

    // Rate limited. Back off and retry — NEVER fall through to a result.
    if (res.status === 429) {
      if (attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseBackoffMs * 2 ** attempt;
        await sleep(wait);
        continue;
      }
      // Still limited after every retry: this is a quota wall, not a data
      // point. Stop so the run can resume later rather than filling the
      // results file with rate-limit noise.
      return { fatal: true, reason: "rate limited after retries — daily quota likely exhausted" };
    }

    if (res.status >= 500) {
      if (attempt < maxRetries) {
        await sleep(baseBackoffMs * 2 ** attempt);
        continue;
      }
      return { error: `http ${res.status}` };
    }

    if (!res.ok) return { error: `http ${res.status}` };

    try {
      return { ok: true, body: await res.json() };
    } catch (e) {
      return { error: `bad json: ${e.message}` };
    }
  }
  return { error: "retries exhausted" };
}

module.exports = { fetchWithPolicy };
