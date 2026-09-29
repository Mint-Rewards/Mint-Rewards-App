/// <reference types="jest" />

/**
 * A round the household has already been through.
 *
 * The collections tab went blank the moment a round finished — no record of
 * what was collected, how much, or who came. For a service whose whole point
 * is that somebody comes to your door, that is a strange thing to withhold.
 */
import { describe, expect, it } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import PastCollectionCard from "@/components/collections/PastCollectionCard";
import type { PastCollection } from "@/hooks/usePastCollections";

const BASE: PastCollection = {
  collectionId: 4,
  name: "North Karachi Drive",
  scheduledDate: "2026-09-20",
  timeSlot: "MORNING",
  collectionStatus: "COMPLETED",
  status: "COLLECTED",
  outcome: "collected",
  weightKg: 4.25,
  noCollectionReason: null,
  resolvedAt: "2026-09-20T09:12:00.000Z",
  captainName: "Abdul Qudoos",
  captainAvatar: null,
};

/**
 * A LOCAL calendar date, not a UTC one.
 *
 * toISOString() gives the UTC date, and Karachi is UTC+5: for five hours
 * either side of midnight, "now minus a day" in UTC is two calendar days ago
 * locally. The card compares local days because that is what "yesterday"
 * means to the person reading it.
 */
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};

const render = (over: Partial<PastCollection> = {}) => {
  // Wrapped in act, or the renderer is torn down before .root is read — the
  // icon font loads asynchronously and settles after the first frame.
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<PastCollectionCard collection={{ ...BASE, ...over }} />);
  });
  return tree;
};

const textOf = (tree: renderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(require("react-native").Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.flat() : [n.props.children]))
    .flat()
    .filter((c) => typeof c === "string")
    .join(" ");

describe("a past collection", () => {
  it("says what was collected and how much", () => {
    expect(textOf(render())).toMatch(/Collected · 4\.3 kg/);
  });

  it("does not claim a weight it does not have", () => {
    // A collected stop with nothing recorded against it should not read
    // "0.0 kg", which looks like an empty bin rather than a missing number.
    const text = textOf(render({ weightKg: 0 }));
    expect(text).toMatch(/Collected/);
    expect(text).not.toMatch(/0\.0 kg/);
  });

  it("names every other ending plainly", () => {
    expect(textOf(render({ outcome: "missed" }))).toMatch(/Nobody was home/);
    expect(textOf(render({ outcome: "declined" }))).toMatch(/You said not this time/);
    expect(textOf(render({ outcome: "cancelled" }))).toMatch(/called off/);
    expect(textOf(render({ outcome: "not_collected" }))).toMatch(/Nothing recorded/);
  });

  it("still leads with who came", () => {
    // A household remembers the person, not the collection id.
    expect(textOf(render())).toMatch(/Abdul Qudoos/);
  });

  it("stands in with initials when there is no photograph", () => {
    expect(textOf(render())).toMatch(/AQ/);
    expect(render().root.findAllByType(require("react-native").Image)).toHaveLength(0);
  });

  it("shows the photograph when there is one", () => {
    const tree = render({ captainAvatar: "https://example.test/abdul.jpg" });
    const images = tree.root.findAllByType(require("react-native").Image);
    expect(images).toHaveLength(1);
    expect(images[0].props.source).toEqual({ uri: "https://example.test/abdul.jpg" });
  });

  it("dates a past round as a date, never as tomorrow", () => {
    // whenLabel is for what is coming. A round last month is not "tomorrow".
    const text = textOf(render({ scheduledDate: daysAgo(40) }));
    expect(text).not.toMatch(/tomorrow|today/);
  });

  it("says yesterday when it was yesterday", () => {
    expect(textOf(render({ scheduledDate: daysAgo(1) }))).toMatch(/yesterday/);
    expect(textOf(render({ scheduledDate: daysAgo(3) }))).toMatch(/3 days ago/);
  });
});
