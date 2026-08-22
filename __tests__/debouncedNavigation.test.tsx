/**
 * Rapid taps on a card used to push N copies of the destination screen, so the
 * user had to press back N times to get out.
 */
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { useDebouncedNavigation } from "@/hooks/useDebouncedNavigation";

function mountHook(windowMs?: number) {
  const box: { current: ((navigate: () => void) => void) | null } = { current: null };
  function Probe() {
    box.current = useDebouncedNavigation(windowMs);
    return null;
  }
  act(() => {
    renderer.create(<Probe />);
  });
  return box;
}

describe("useDebouncedNavigation", () => {
  it("navigates once for three taps in the same frame", () => {
    const push = jest.fn();
    const box = mountHook();

    act(() => {
      box.current!(push);
      box.current!(push);
      box.current!(push);
    });

    expect(push).toHaveBeenCalledTimes(1);
  });

  it("fires on the leading edge, so the first tap is never delayed", () => {
    const push = jest.fn();
    const box = mountHook();

    act(() => {
      box.current!(push);
    });

    // No timers advanced — it already ran.
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("allows a new navigation once the window has passed", () => {
    const now = jest.spyOn(Date, "now");
    const push = jest.fn();
    const box = mountHook(600);

    now.mockReturnValue(1_000);
    act(() => {
      box.current!(push);
    });

    now.mockReturnValue(1_400); // inside the window
    act(() => {
      box.current!(push);
    });
    expect(push).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_700); // past it
    act(() => {
      box.current!(push);
    });
    expect(push).toHaveBeenCalledTimes(2);

    now.mockRestore();
  });

  it("drops the extra taps rather than queueing them", () => {
    const now = jest.spyOn(Date, "now");
    const push = jest.fn();
    const box = mountHook(600);

    now.mockReturnValue(1_000);
    act(() => {
      box.current!(push);
      box.current!(push);
      box.current!(push);
    });

    now.mockReturnValue(5_000);
    expect(push).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });
});
