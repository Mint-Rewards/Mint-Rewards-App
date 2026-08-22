/**
 * Regression tests for the duplicate-dialog bug: rapid repeated taps stacked
 * one Alert per tap.
 *
 * The calls below are deliberately synchronous and back-to-back — that is the
 * exact shape of the bug. A guard built on useState/store state would pass a
 * test that awaited between taps and still fail in the app.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Alert } from "react-native";
import { __resetAlertGuard, alertOnce, isAlertOpen } from "@/utils/alert";

const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

/** Runs the button at `index` of the most recent Alert.alert call. */
function pressButton(index: number, callIndex = alertSpy.mock.calls.length - 1) {
  const buttons = alertSpy.mock.calls[callIndex][2] as
    | { text?: string; onPress?: () => void }[]
    | undefined;
  buttons?.[index]?.onPress?.();
}

beforeEach(() => {
  alertSpy.mockClear();
  __resetAlertGuard();
});

describe("alertOnce", () => {
  it("shows one dialog for three taps in the same frame", () => {
    alertOnce("Logout", "Are you sure?", [{ text: "Cancel" }, { text: "Logout" }]);
    alertOnce("Logout", "Are you sure?", [{ text: "Cancel" }, { text: "Logout" }]);
    alertOnce("Logout", "Are you sure?", [{ text: "Cancel" }, { text: "Logout" }]);

    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it("reports whether it actually showed the dialog", () => {
    expect(alertOnce("First")).toBe(true);
    expect(alertOnce("Second")).toBe(false);
  });

  it("blocks an alert raised from a different screen while one is up", () => {
    alertOnce("Download & Mark as Used?", "single use");
    alertOnce("Error", "something else entirely");

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe("Download & Mark as Used?");
  });

  it("allows the next dialog once a button is pressed", () => {
    alertOnce("Logout", undefined, [{ text: "Cancel" }, { text: "Logout" }]);
    pressButton(1);
    expect(isAlertOpen()).toBe(false);

    alertOnce("Delete Account");
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });

  it("releases on Cancel too, not just the confirm button", () => {
    alertOnce("Logout", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Logout" }]);
    pressButton(0);

    alertOnce("Logout");
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });

  it("still runs the caller's own onPress", () => {
    const onConfirm = jest.fn();
    alertOnce("Logout", undefined, [{ text: "Cancel" }, { text: "Logout", onPress: onConfirm }]);
    pressButton(1);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("releases via the implicit OK when no buttons are supplied", () => {
    alertOnce("Error", "Network error");
    pressButton(0);

    alertOnce("Error", "Network error");
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });

  it("preserves button text and style", () => {
    alertOnce("Delete Account", "cannot be undone", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive" },
    ]);

    const buttons = alertSpy.mock.calls[0][2] as { text: string; style?: string }[];
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ["Cancel", "cancel"],
      ["Delete", "destructive"],
    ]);
  });
});
