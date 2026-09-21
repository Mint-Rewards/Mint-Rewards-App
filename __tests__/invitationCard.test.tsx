import { describe, expect, it, jest } from "@jest/globals";
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
  captainName: "Imran Baig",
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
    const { tree } = render({ status: "ACCEPTED" });
    expect(textOf(tree)).toMatch(/You are on the round/);
    expect(textOf(tree)).not.toMatch(/Yes, collect from me/);
  });

  it("lets someone who declined change their mind", () => {
    const { tree, onRespond } = render({ status: "DECLINED", collectionId: 7 });
    const node = tree.root.findAll(
      (n) =>
        typeof n.props?.onPress === "function" &&
        !n.props?.accessibilityLabel &&
        n.props?.accessibilityRole === "button",
    )[0];
    act(() => node.props.onPress());
    expect(onRespond).toHaveBeenCalledWith(7, "ACCEPTED");
  });

  it("says tomorrow rather than a date nobody has to decode", () => {
    expect(textOf(render({ scheduledDate: iso(1) }).tree)).toMatch(/tomorrow/);
    expect(textOf(render({ scheduledDate: iso(0) }).tree)).toMatch(/today/);
    // Far enough out that "tomorrow" would be wrong, so it names the day.
    expect(textOf(render({ scheduledDate: iso(5) }).tree)).not.toMatch(/tomorrow|today/);
  });

  it("urges a reply only while the deadline is the pressing fact", () => {
    const soon = new Date(Date.now() + 3 * 3_600_000).toISOString();
    expect(textOf(render({ responseDeadlineAt: soon }).tree)).toMatch(/within 3 hours/);

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
