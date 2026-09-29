/// <reference types="jest" />

/**
 * The spinner always stops.
 *
 * A reload that throws and leaves the control turning looks like a screen
 * still trying when it has already given up — the same class of lie as an
 * empty history that was really a failed request. The release lives in a
 * `finally` for that reason, and this is what holds it there.
 */
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";

const { usePullToRefresh } = require("@/hooks/usePullToRefresh");

type State = { refreshing: boolean; onRefresh: () => void };

/**
 * Renders the hook and hands its value back out.
 *
 * react-test-renderer rather than @testing-library/react-native, which this
 * repo does not depend on. A probe component is the whole of what renderHook
 * would have done here.
 */
function mount(refresh: () => unknown): { current: State } {
  const box = { current: null as unknown as State };
  const Probe = () => {
    box.current = usePullToRefresh(refresh) as State;
    return null;
  };
  act(() => {
    renderer.create(React.createElement(Probe));
  });
  return box;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("pull to refresh", () => {
  it("stops spinning when the refresh succeeds", async () => {
    const refresh = jest.fn(async () => {});
    const box = mount(refresh);
    await act(async () => {
      box.current.onRefresh();
      await settle();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(box.current.refreshing).toBe(false);
  });

  it("stops spinning when the refresh throws", async () => {
    const refresh = jest.fn(async () => {
      throw new Error("network");
    });
    const box = mount(refresh);
    await act(async () => {
      box.current.onRefresh();
      await settle();
    });
    expect(box.current.refreshing).toBe(false);
  });

  it("does not let a failed refresh escape and crash the tab", async () => {
    const refresh = jest.fn(async () => {
      throw new Error("network");
    });
    const box = mount(refresh);
    // An unhandled rejection here would take the screen down on a pull.
    await expect(
      act(async () => {
        box.current.onRefresh();
        await settle();
      }),
    ).resolves.not.toThrow();
  });
});
