import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import NotificationBanner, { type BannerMessage } from "@/components/NotificationBanner";

/**
 * The banner for notifications that arrive while the app is open.
 *
 * The behaviours that matter are the ones a user would notice going wrong: a
 * banner that never leaves, one that swallows taps meant for the screen
 * beneath it, and — the fiddly one — a second notification arriving while the
 * first is still up, where the old dismissal timer must not hide the new one.
 */
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 0, left: 0, right: 0 }),
}));

const MESSAGE: BannerMessage = {
  title: "Collection cancelled",
  body: "Tomorrow's collection is off.",
  collectionId: "25",
};

const textOf = (tree: renderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(require("react-native").Text)
    .map((n) => n.props.children)
    .filter((c) => typeof c === "string")
    .join(" ");

const press = (tree: renderer.ReactTestRenderer, label: string) => {
  const node = tree.root.findAll(
    (n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === "function",
  )[0];
  act(() => node.props.onPress());
};

describe("NotificationBanner", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders nothing when there is no message", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <NotificationBanner message={null} onPress={jest.fn() as never} onDismiss={jest.fn() as never} />,
      );
    });
    expect(tree.toJSON()).toBeNull();
  });

  it("shows the title and body it was given", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <NotificationBanner message={MESSAGE} onPress={jest.fn() as never} onDismiss={jest.fn() as never} />,
      );
    });
    expect(textOf(tree)).toMatch(/Collection cancelled/);
    expect(textOf(tree)).toMatch(/Tomorrow's collection is off/);
  });

  it("opens the collection when tapped", () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <NotificationBanner message={MESSAGE} onPress={onPress as never} onDismiss={jest.fn() as never} />,
      );
    });
    press(tree, "Collection cancelled. Tomorrow's collection is off.");
    act(() => { jest.runAllTimers(); });
    expect(onPress).toHaveBeenCalled();
  });

  it("dismisses itself rather than sitting on screen", () => {
    const onDismiss = jest.fn();
    act(() => {
      renderer.create(
        <NotificationBanner message={MESSAGE} onPress={jest.fn() as never} onDismiss={onDismiss as never} />,
      );
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(5000); jest.runAllTimers(); });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("does not let an old timer hide a newly arrived notification", () => {
    // Two notifications in quick succession. The first one's dismissal must be
    // cancelled, or the second vanishes early through no fault of its own.
    const onDismiss = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <NotificationBanner message={MESSAGE} onPress={jest.fn() as never} onDismiss={onDismiss as never} />,
      );
    });

    act(() => { jest.advanceTimersByTime(4000); });
    act(() => {
      tree.update(
        <NotificationBanner
          message={{ ...MESSAGE, title: "Second" }}
          onPress={jest.fn() as never}
          onDismiss={onDismiss as never}
        />,
      );
    });

    // The first banner's 5s would have elapsed here; the second's must not.
    act(() => { jest.advanceTimersByTime(1500); });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(textOf(tree)).toMatch(/Second/);
  });

  it("lets taps through to the screen underneath", () => {
    // A full-width overlay that captures touches would make the header
    // beneath it unusable for as long as the banner is up.
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <NotificationBanner message={MESSAGE} onPress={jest.fn() as never} onDismiss={jest.fn() as never} />,
      );
    });
    const overlay = tree.root.findAll((n) => n.props?.pointerEvents === "box-none")[0];
    expect(overlay).toBeTruthy();
  });
});
