import { describe, expect, it, jest } from "@jest/globals";
import assert from "node:assert";
import React from "react";
import renderer, { act } from "react-test-renderer";
import InvitationCard from "@/components/collections/InvitationCard";
import type { Invitation } from "@/hooks/useInvitations";

/**
 * The card a household answers a collection from.
 *
 * What matters is that it never tells them something untrue: that an answer
 * they gave is recorded when it is not, that a window is open when it has
 * closed, or that a date is "tomorrow" when it is not.
 */
const BASE: Invitation = {
  collectionId: 25,
  name: "Saturday run",
  scheduledDate: "2026-09-23",
  timeSlot: "MORNING",
  responseDeadlineAt: null,
  status: "INVITED",
  collectionStatus: "CONFIRMING" as const,
  state: "answerable" as const,
  startedAt: null,
  captainName: "Imran Baig",
  captainAvatar: null,
};

/**
 * A LOCAL calendar date, not a UTC one.
 *
 * toISOString() would give the UTC date, and Karachi is UTC+5: for five hours
 * either side of midnight "UTC now + 1 day" is still today locally. The card
 * compares local calendar days, because that is what "tomorrow" means to the
 * person reading it, and a scheduledDate from the API is a date with no time
 * attached.
 */
const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};

function render(invitation: Partial<Invitation>, onRespond = jest.fn()) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <InvitationCard
        invitation={{ ...BASE, ...invitation }}
        answering={{}}
        onRespond={onRespond as never}
      />,
    );
  });
  return { tree, onRespond };
}

const textOf = (tree: renderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(require("react-native").Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.flat() : [n.props.children]))
    .flat()
    .filter((c) => typeof c === "string")
    .join(" ");

const pressByLabel = (tree: renderer.ReactTestRenderer, label: string) => {
  const node = tree.root.findAll(
    (n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === "function",
  )[0];
  act(() => node.props.onPress());
};

describe("InvitationCard", () => {
  it("offers both answers while the household has not replied", () => {
    const { tree } = render({ status: "INVITED" });
    expect(textOf(tree)).toMatch(/Yes, collect from me/);
    expect(textOf(tree)).toMatch(/Not this time/);
  });

  it("sends the household's answer with the collection it belongs to", () => {
    const { tree, onRespond } = render({ collectionId: 41, status: "INVITED" });
    pressByLabel(tree, "Accept this collection");
    expect(onRespond).toHaveBeenCalledWith(41, "ACCEPTED");

    pressByLabel(tree, "Decline this collection");
    expect(onRespond).toHaveBeenCalledWith(41, "DECLINED");
  });

  it("stops offering answers once one has been given", () => {
    // Showing the buttons again after an answer invites a second tap and makes
    // the first look unrecorded.
    const { tree } = render({ status: "ACCEPTED", state: "confirmed" });
    expect(textOf(tree)).toMatch(/You are on the round/);
    expect(textOf(tree)).not.toMatch(/Yes, collect from me/);
  });

  it("lets someone who declined change their mind", () => {
    const { tree, onRespond } = render({
      status: "DECLINED",
      state: "declined",
      collectionId: 7,
    });
    const node = tree.root.findAll(
      (n) =>
        typeof n.props?.onPress === "function" &&
        !n.props?.accessibilityLabel &&
        n.props?.accessibilityRole === "button",
    )[0];
    act(() => node.props.onPress());
    expect(onRespond).toHaveBeenCalledWith(7, "ACCEPTED");
  });

  /**
   * The day itself, which this card could not describe at all until the
   * household endpoint started returning accepted stops on live collections.
   * A household that said yes then watched the invitation vanish had no way
   * to tell whether anyone was coming.
   */
  describe("once the household has accepted", () => {
    const accepted = {
      status: "ACCEPTED" as const,
      state: "confirmed" as const,
      // A deadline that has passed. Nothing should raise it: the answer it
      // was pressing for has been given.
      responseDeadlineAt: "2020-01-01T00:00:00.000Z",
    };

    it("says the captain is on the way once the round is rolling", () => {
      const { tree } = render({
        ...accepted,
        collectionStatus: "IN_PROGRESS",
        captainName: "Imran Baig",
      });
      expect(textOf(tree)).toMatch(/Imran Baig is on the way/);
    });

    it("asks for the bags without claiming anyone has set off yet", () => {
      const { tree } = render({ ...accepted, collectionStatus: "READY" });
      expect(textOf(tree)).toMatch(/You are on the round/);
      expect(textOf(tree)).not.toMatch(/on the way/);
    });

    it("stops pressing for a reply that has been given", () => {
      expect(textOf(render(accepted).tree)).not.toMatch(/reply|respond/i);
    });
  });

  it("withdraws the change of mind once the window has closed", () => {
    // The server refuses a late answer, so offering one is a button that
    // cannot work.
    const declined = { status: "DECLINED" as const, state: "declined" as const };
    expect(textOf(render({ ...declined, collectionStatus: "CONFIRMING" }).tree)).toMatch(
      /Actually, collect from me/,
    );
    expect(textOf(render({ ...declined, collectionStatus: "READY" }).tree)).not.toMatch(
      /Actually, collect from me/,
    );
  });

  describe("who is coming", () => {
    it("shows the captain's face once there is one", async () => {
      const { tree } = render({
        captainName: "Abdul Qudoos",
        captainAvatar: "https://example.test/abdul.jpg",
      });
      const images = tree.root.findAllByType(require("react-native").Image);
      assert(images.length > 0);
      expect(images[0].props.source).toEqual({ uri: "https://example.test/abdul.jpg" });
      expect(textOf(tree)).toMatch(/Your collector/);
    });

    it("says they are on the way once the van has set off", () => {
      const { tree } = render({
        captainName: "Abdul Qudoos",
        captainAvatar: "https://example.test/abdul.jpg",
        status: "ACCEPTED",
        state: "confirmed",
        collectionStatus: "IN_PROGRESS",
      });
      expect(textOf(tree)).toMatch(/On the way to you/);
    });

    it("stands in with initials when there is no photograph", () => {
      // The space is held either way, so the card does not rearrange itself
      // the day a photo is added — and two letters say more than a grey disc.
      const { tree } = render({ captainName: "Abdul Qudoos", captainAvatar: null });
      expect(tree.root.findAllByType(require("react-native").Image)).toHaveLength(0);
      expect(textOf(tree)).toMatch(/AQ/);
      expect(textOf(tree)).toMatch(/Abdul Qudoos/);
      expect(textOf(tree)).toMatch(/Your collector/);
    });

    it("still says who is coming when there is no name either", () => {
      const { tree } = render({ captainName: null, captainAvatar: null });
      expect(textOf(tree)).toMatch(/Your collector/);
      expect(textOf(tree)).toMatch(/\?/);
    });

    it("colour-codes the two answers rather than only wording them", () => {
      // "Yes" and "Not this time" read as equally weighted in plain text.
      const { tree } = render({ state: "answerable" });
      const byLabel = (label: string) =>
        tree.root.findAll((n) => n.props?.accessibilityLabel === label)[0];

      const accept = byLabel("Accept this collection");
      const decline = byLabel("Decline this collection");
      const flat = (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s);

      expect(flat(accept.props.style).backgroundColor).toBe("#0E9F6E");
      expect(flat(decline.props.style).borderColor).toBe("#F0C4C4");
      // Both are a thumb-sized target and share the row equally.
      expect(flat(accept.props.style).minHeight).toBe(48);
      expect(flat(accept.props.style).flex).toBe(1);
      expect(flat(decline.props.style).flex).toBe(1);
    });
  });

  it("says tomorrow rather than a date nobody has to decode", () => {
    expect(textOf(render({ scheduledDate: iso(1) }).tree)).toMatch(/tomorrow/);
    expect(textOf(render({ scheduledDate: iso(0) }).tree)).toMatch(/today/);
    // Far enough out that "tomorrow" would be wrong, so it names the day.
    expect(textOf(render({ scheduledDate: iso(5) }).tree)).not.toMatch(/tomorrow|today/);
  });

  it("urges a reply only while the deadline is the pressing fact", () => {
    // Three hours away is 2.999 by the time it renders, and the household has
    // three hours, not two — so this asserts the rounding direction too.
    const soon = new Date(Date.now() + 3 * 3_600_000).toISOString();
    expect(textOf(render({ responseDeadlineAt: soon }).tree)).toMatch(/within 3 hours/);

    // Under an hour reads as "the hour", never "within 1 hour".
    const minutes = new Date(Date.now() + 25 * 60_000).toISOString();
    expect(textOf(render({ responseDeadlineAt: minutes }).tree)).toMatch(/within the hour/);

    // Days away: saying "reply within 52 hours" is noise.
    const later = new Date(Date.now() + 52 * 3_600_000).toISOString();
    expect(textOf(render({ responseDeadlineAt: later }).tree)).not.toMatch(/Please reply/);

    // Already passed: urging a reply to a closed window is worse than silence.
    const past = new Date(Date.now() - 3_600_000).toISOString();
    expect(textOf(render({ responseDeadlineAt: past }).tree)).not.toMatch(/Please reply/);
  });

  it("tells the household when their answer did not reach us", () => {
    // They tapped. Silence here means they believe it was recorded.
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <InvitationCard
          invitation={BASE}
          answering={{ 25: "failed" }}
          onRespond={jest.fn() as never}
        />,
      );
    });
    expect(textOf(tree)).toMatch(/did not reach us/);
  });

  it("does not accept a second tap while one is in flight", () => {
    const onRespond = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <InvitationCard
          invitation={BASE}
          answering={{ 25: "sending" }}
          onRespond={onRespond as never}
        />,
      );
    });
    const accept = tree.root.findAll(
      (n) => n.props?.accessibilityLabel === "Accept this collection",
    )[0];
    expect(accept.props.disabled).toBe(true);
  });
});
