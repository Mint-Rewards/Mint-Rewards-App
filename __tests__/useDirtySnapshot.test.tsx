/**
 * The Save button that was always enabled.
 *
 * Edit Profile offered Update Profile on a form nobody had touched. The fix
 * looks trivial — compare the form against how it opened — and has one trap
 * that makes a plausible version of it do nothing at all: hold the baseline in
 * a ref, set it in an effect, and no re-render follows, so the button stays
 * enabled until the first keystroke. These tests are about WHEN the answer
 * settles, not just what it is, which is why they drive a real render.
 */
import { describe, expect, it } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { useDirtySnapshot } from "@/hooks/useDirtySnapshot";

/** A host that reports the hook's answer on every committed render. */
function mount(initial: { snapshot: unknown; ready: boolean }) {
  const answers: boolean[] = [];
  const Host = ({ snapshot, ready }: { snapshot: unknown; ready: boolean }) => {
    answers.push(useDirtySnapshot(snapshot, ready));
    return null;
  };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Host {...initial} />);
  });
  return {
    answers,
    /** What the last committed render decided. */
    get dirty() {
      return answers[answers.length - 1];
    },
    update(next: { snapshot: unknown; ready: boolean }) {
      act(() => {
        tree.update(<Host {...next} />);
      });
    },
  };
}

describe("useDirtySnapshot", () => {
  it("settles on clean without waiting for an edit", () => {
    /*
     * The trap. A ref-based baseline leaves this true, because setting a ref
     * in an effect commits no new render — and the button the person is
     * looking at is drawn from the render they are looking at.
     */
    const host = mount({ snapshot: { name: "Sahar" }, ready: true });
    expect(host.dirty).toBe(false);
  });

  it("goes dirty when a value changes", () => {
    const host = mount({ snapshot: { name: "Sahar" }, ready: true });
    host.update({ snapshot: { name: "Sahar Habib" }, ready: true });
    expect(host.dirty).toBe(true);
  });

  it("goes clean again when the change is undone", () => {
    // Typing a letter and deleting it is not an edit, and leaving the button
    // live afterwards would be the old behaviour with extra steps.
    const host = mount({ snapshot: { name: "Sahar" }, ready: true });
    host.update({ snapshot: { name: "Sahar " }, ready: true });
    expect(host.dirty).toBe(true);
    host.update({ snapshot: { name: "Sahar" }, ready: true });
    expect(host.dirty).toBe(false);
  });

  it("does not block while the stored values have not arrived", () => {
    /*
     * The seeding effect does nothing if the user record is absent, so `ready`
     * can stay false for the life of the screen. Reading that as "nothing
     * changed" would leave the button permanently dead, with nothing on screen
     * to explain it — worse than the bug being fixed.
     */
    const host = mount({ snapshot: { name: "" }, ready: false });
    expect(host.dirty).toBe(true);
  });

  it("takes its baseline from the seeded values, not the first ones", () => {
    /*
     * Why `ready` exists. The form normalises what it is handed — the location
     * form prefers the registry's spelling of a city it recognises — so the
     * values a frame after seeding are not the ones that went in. Baselining
     * the pre-seed form would mark an untouched profile dirty.
     */
    const host = mount({ snapshot: { city: "" }, ready: false });
    host.update({ snapshot: { city: "Karachi" }, ready: true });
    expect(host.dirty).toBe(false);
    host.update({ snapshot: { city: "Lahore" }, ready: true });
    expect(host.dirty).toBe(true);
  });

  it("compares by value, not by identity", () => {
    /*
     * The screen builds its snapshot as a fresh object literal on every
     * render, so a comparison on object identity would read as dirty forever
     * and disable nothing. Equal contents in a new object must be clean.
     */
    const host = mount({ snapshot: { name: "Sahar", pin: [24.86, 67.0] }, ready: true });
    host.update({ snapshot: { name: "Sahar", pin: [24.86, 67.0] }, ready: true });
    expect(host.dirty).toBe(false);
  });

  it("notices a change nested inside the snapshot", () => {
    // The location half is an object of its own, and moving the pin is the
    // edit most likely to be the only one somebody makes.
    const host = mount({
      snapshot: { identity: { name: "Sahar" }, values: { latitude: "24.86" } },
      ready: true,
    });
    host.update({
      snapshot: { identity: { name: "Sahar" }, values: { latitude: "24.91" } },
      ready: true,
    });
    expect(host.dirty).toBe(true);
  });
});
