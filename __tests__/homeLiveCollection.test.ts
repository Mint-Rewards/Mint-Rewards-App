/// <reference types="jest" />

/**
 * Which collection the home card speaks for.
 *
 * The card fell straight from "you have a booking" to "collections are going
 * live soon" — a reasonable thing to tell somebody with nothing happening,
 * and the wrong thing to tell somebody whose van is on its way.
 *
 * The choosing is what is worth testing; the rendering is three ternaries
 * over the result. This is that choice, as home.tsx makes it.
 */
import { describe, expect, it } from "@jest/globals";
import type { Invitation } from "@/hooks/useInvitations";

/** The rule from home.tsx: most pressing first, then soonest. */
function pick(invitations: Invitation[]): Invitation | undefined {
  const rank = (i: Invitation) =>
    i.collectionStatus === "IN_PROGRESS" ? 0 : i.state === "answerable" ? 1 : 2;
  return [...invitations]
    .filter((i) => i.state !== "declined")
    .sort((a, b) => rank(a) - rank(b) || a.scheduledDate.localeCompare(b.scheduledDate))[0];
}

const make = (over: Partial<Invitation>): Invitation => ({
  collectionId: 1,
  name: "A round",
  scheduledDate: "2026-09-25",
  timeSlot: "MORNING",
  responseDeadlineAt: null,
  status: "INVITED",
  collectionStatus: "CONFIRMING",
  state: "answerable",
  startedAt: null,
  captainName: "Abdul Qudoos",
  captainAvatar: null,
  ...over,
});

describe("what the home card speaks for", () => {
  it("says nothing when the household has no invitation", () => {
    // The card keeps saying what it always said, which is correct for
    // somebody with nothing happening.
    expect(pick([])).toBeUndefined();
  });

  it("puts a van already driving above everything else", () => {
    const driving = make({ collectionId: 2, collectionStatus: "IN_PROGRESS", state: "confirmed" });
    const asking = make({ collectionId: 3, scheduledDate: "2026-09-24" });
    expect(pick([asking, driving])?.collectionId).toBe(2);
  });

  it("puts a question waiting for an answer above a settled round", () => {
    const settled = make({ collectionId: 4, state: "confirmed", status: "ACCEPTED" });
    const asking = make({ collectionId: 5 });
    expect(pick([settled, asking])?.collectionId).toBe(5);
  });

  it("breaks a tie by the soonest date", () => {
    const later = make({ collectionId: 6, scheduledDate: "2026-10-02" });
    const sooner = make({ collectionId: 7, scheduledDate: "2026-09-24" });
    expect(pick([later, sooner])?.collectionId).toBe(7);
  });

  it("ignores one the household has declined", () => {
    // They said no. Telling them about it on the home screen is nagging.
    const declined = make({ collectionId: 8, state: "declined", status: "DECLINED" });
    expect(pick([declined])).toBeUndefined();
  });

  it("still speaks for a declined household's other round", () => {
    const declined = make({ collectionId: 9, state: "declined", status: "DECLINED" });
    const other = make({ collectionId: 10 });
    expect(pick([declined, other])?.collectionId).toBe(10);
  });
});
