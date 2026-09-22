/// <reference types="jest" />

/**
 * How the invitations hook sends its token.
 *
 * Both login endpoints issue `token` already reading "Bearer <jwt>", so a
 * caller that writes `Bearer ${token}` sends "Bearer Bearer <jwt>". The server
 * 401s it, authenticatedFetch treats any 401 as a session expiry and signs the
 * person out, and the screen they were sent to renders empty on the way past.
 * Nothing throws and nothing logs a defect.
 *
 * It has now happened twice — once in registerDeviceToken, once here — which
 * is the argument for asserting the header rather than the behaviour.
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";

// The network layer is stubbed rather than configured: `utils/api` drags in
// `config/env`, which validates the real app configuration at import time and
// throws in a test process. Same reasoning as locationApi.test.ts.
type FetchLike = (url: string, options: RequestInit) => Promise<unknown>;
const mockAuthenticatedFetch = jest.fn<FetchLike>();
jest.mock("@/utils/api", () => ({
  apiUrl: (path: string) => `https://api.test.invalid${path}`,
  authenticatedFetch: mockAuthenticatedFetch,
}));

// The hook reads the store at module level; these two functions take their
// token as an argument and never touch it.
jest.mock("@/store/store", () => ({ useAppStore: () => undefined }));

const { fetchInvitations, sendInvitationResponse } = require("@/hooks/useInvitations");

const STORED_TOKEN = "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature";

function stub(body: unknown = { invitations: [] }) {
  mockAuthenticatedFetch.mockReset();
  mockAuthenticatedFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function sentHeader(): string {
  const [, init] = mockAuthenticatedFetch.mock.calls[0] as [string, RequestInit];
  return (init.headers as Record<string, string>).Authorization;
}

describe("the token the invitations hook sends", () => {
  afterEach(() => {
    // A block body: an arrow returning jest's value is not a valid test hook
    // return, and tsc says so.
    jest.restoreAllMocks();
  });

  it("sends the stored token verbatim when listing", async () => {
    stub();
    await fetchInvitations(STORED_TOKEN);
    expect(sentHeader()).toBe(STORED_TOKEN);
  });

  it("does not prefix a second Bearer when listing", async () => {
    // The specific failure: "Bearer Bearer eyJ..."
    stub();
    await fetchInvitations(STORED_TOKEN);
    expect(sentHeader()).not.toMatch(/Bearer\s+Bearer/);
  });

  it("sends the stored token verbatim when answering", async () => {
    stub({ Status: "Success" });
    await sendInvitationResponse(STORED_TOKEN, 1, "ACCEPTED");
    expect(sentHeader()).toBe(STORED_TOKEN);
  });

  it("does not prefix a second Bearer when answering", async () => {
    stub({ Status: "Success" });
    await sendInvitationResponse(STORED_TOKEN, 1, "ACCEPTED");
    expect(sentHeader()).not.toMatch(/Bearer\s+Bearer/);
  });
});
