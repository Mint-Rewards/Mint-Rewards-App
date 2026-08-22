/**
 * Regression tests for the second half of the duplicate-action bug: the
 * confirm button *inside* a dialog, and submit buttons gated only on async
 * store state (isLoading / isProfileLoading), were both double-fireable.
 */
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { useSingleFlight } from "@/hooks/useSingleFlight";

/** Renders the hook and exposes its return value for direct driving. */
function mountHook<A extends unknown[]>(handler: (...args: A) => void | Promise<void>) {
  const box: { current: ReturnType<typeof useSingleFlight<A>> | null } = { current: null };
  function Probe() {
    box.current = useSingleFlight(handler);
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  return { box, unmount: () => act(() => tree.unmount()) };
}

/** A promise whose resolution we control, standing in for a network call. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("useSingleFlight", () => {
  it("runs an in-flight async handler once for three taps in the same frame", async () => {
    const { promise, resolve } = deferred();
    const handler = jest.fn(() => promise);
    const { box } = mountHook(handler);

    act(() => {
      box.current!.run();
      box.current!.run();
      box.current!.run();
    });

    expect(handler).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve();
      await promise;
    });
  });

  it("reports inFlight so the button can disable itself", async () => {
    const { promise, resolve } = deferred();
    const { box } = mountHook(() => promise);

    expect(box.current!.inFlight).toBe(false);
    act(() => {
      box.current!.run();
    });
    expect(box.current!.inFlight).toBe(true);

    await act(async () => {
      resolve();
      await promise;
    });
    expect(box.current!.inFlight).toBe(false);
  });

  it("accepts a new call once the previous one settles", async () => {
    const handler = jest.fn(async () => {});
    const { box } = mountHook(handler);

    await act(async () => {
      box.current!.run();
    });
    await act(async () => {
      box.current!.run();
    });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("releases the latch when the handler rejects, so the user can retry", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const failing = jest.fn(async () => {
      throw new Error("network");
    });
    const { box } = mountHook(failing);

    await act(async () => {
      box.current!.run();
    });
    await act(async () => {
      box.current!.run();
    });

    expect(failing).toHaveBeenCalledTimes(2);
    // Reported, not rethrown — a rethrow here would be an unhandled rejection.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("forwards arguments to the handler", async () => {
    const handler = jest.fn(async (_id: string) => {});
    const { box } = mountHook(handler);

    await act(async () => {
      box.current!.run("deal-123");
    });

    expect(handler).toHaveBeenCalledWith("deal-123");
  });

  it("does not set state after unmount", async () => {
    // The real handlers navigate away or sign out, so the component is
    // routinely gone before the promise settles.
    const warn = jest.spyOn(console, "error").mockImplementation(() => {});
    const { promise, resolve } = deferred();
    const { box, unmount } = mountHook(() => promise);

    act(() => {
      box.current!.run();
    });
    unmount();
    await act(async () => {
      resolve();
      await promise;
    });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
