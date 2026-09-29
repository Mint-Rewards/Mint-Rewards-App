/// <reference types="jest" />

/**
 * An empty history and a failed request are different answers.
 *
 * They used to be the same one. The backend's history route sat a commit
 * behind what was deployed and answered 404; this hook swallowed it, returned
 * an empty list, and the screen told the household they had never had a
 * collection. Tracing that took three services, because nothing anywhere
 * said a request had failed.
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";

type FetchLike = (url: string, options: RequestInit) => Promise<unknown>;
const mockAuthenticatedFetch = jest.fn<FetchLike>();

jest.mock("@/utils/api", () => ({
  apiUrl: (path: string) => `https://api.test.invalid${path}`,
  authenticatedFetch: (url: string, options: RequestInit) =>
    mockAuthenticatedFetch(url, options),
}));
jest.mock("@/store/store", () => ({ useAppStore: () => undefined }));

const { fetchPastCollections } = require("@/hooks/usePastCollections");

const TOKEN = "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature";

afterEach(() => {
  mockAuthenticatedFetch.mockReset();
});

describe("a history request that did not succeed", () => {
  it("reports a 404 as a failure, not as an empty history", async () => {
    // The exact shape of the bug: the route was not deployed.
    mockAuthenticatedFetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await fetchPastCollections(TOKEN);
    expect(result.failed).toBe(true);
    expect(result.collections).toEqual([]);
  });

  it("reports a server error as a failure", async () => {
    mockAuthenticatedFetch.mockResolvedValue({ ok: false, status: 500 });
    expect((await fetchPastCollections(TOKEN)).failed).toBe(true);
  });

  it("reports an unreachable network as a failure", async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error("Network request failed"));
    expect((await fetchPastCollections(TOKEN)).failed).toBe(true);
  });
});

describe("a history request that succeeded", () => {
  it("does not call a genuinely empty history a failure", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ collections: [] }),
    });
    const result = await fetchPastCollections(TOKEN);
    expect(result.failed).toBe(false);
    expect(result.collections).toEqual([]);
  });

  it("returns the rows, and treats a missing key as empty rather than failed", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const result = await fetchPastCollections(TOKEN);
    expect(result.failed).toBe(false);
    expect(result.collections).toEqual([]);
  });

  it("sends the stored token verbatim", async () => {
    // Bearer-prefixing this has caused a silent sign-out twice.
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ collections: [] }),
    });
    await fetchPastCollections(TOKEN);
    const [, init] = mockAuthenticatedFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(TOKEN);
  });
});
