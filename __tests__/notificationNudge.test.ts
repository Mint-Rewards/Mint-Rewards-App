/// <reference types="jest" />

/**
 * Who gets asked to turn notifications back on.
 *
 * A table, not a walk through the component: this decides whether a modal
 * lands on top of someone, and the cost of getting it wrong runs both ways.
 * Too eager and we nag a person whose notifications already work; too shy and
 * a household is never told a van is coming and is out when it arrives.
 */
import { describe, expect, it } from "@jest/globals";
import { needsSettingsFor, shouldNudgeForNotifications } from "@/utils/notificationNudge";
import type { PushPermission } from "@/utils/push";

const BASE = {
  permission: "denied" as PushPermission,
  signedIn: true,
  profileComplete: true,
  onHome: true,
  dismissals: 0,
  maxDismissals: 2,
};

describe("the notification nudge", () => {
  it("asks someone who has turned notifications off", () => {
    expect(shouldNudgeForNotifications(BASE)).toBe(true);
  });

  it("asks someone who has never been prompted", () => {
    /*
     * From the user's side "never asked" and "said no" are the same thing:
     * nothing arrives. The sheet also buys the one chance to explain before
     * the iOS dialog, which is shown once, ever.
     */
    expect(shouldNudgeForNotifications({ ...BASE, permission: "undetermined" })).toBe(true);
  });

  it("leaves alone someone whose notifications work", () => {
    expect(shouldNudgeForNotifications({ ...BASE, permission: "granted" })).toBe(false);
  });

  it("leaves provisional alone", () => {
    // A real iOS state — quiet delivery to Notification Center — that we never
    // request, so its presence means the user chose it.
    expect(shouldNudgeForNotifications({ ...BASE, permission: "provisional" })).toBe(false);
  });

  it("says nothing where there is nothing to turn on", () => {
    // Simulator, or a binary without the native module. The button would lead
    // nowhere.
    expect(shouldNudgeForNotifications({ ...BASE, permission: "unsupported" })).toBe(false);
  });

  it("does not nag a signed-out visitor", () => {
    expect(shouldNudgeForNotifications({ ...BASE, signedIn: false })).toBe(false);
  });

  it("waits until the household can actually be sent to", () => {
    /*
     * No pin means not routable, which means never invited to a collection —
     * so notifications would deliver nothing yet. It also keeps this sheet off
     * Home while the location gate is using it, which is the more urgent ask.
     */
    expect(shouldNudgeForNotifications({ ...BASE, profileComplete: false })).toBe(false);
  });

  it("only appears over Home", () => {
    expect(shouldNudgeForNotifications({ ...BASE, onHome: false })).toBe(false);
  });

  it("stops after the dismissal budget is spent", () => {
    expect(shouldNudgeForNotifications({ ...BASE, dismissals: 1 })).toBe(true);
    expect(shouldNudgeForNotifications({ ...BASE, dismissals: 2 })).toBe(false);
    expect(shouldNudgeForNotifications({ ...BASE, dismissals: 9 })).toBe(false);
  });

  it("a permission that works overrides everything else", () => {
    // Belt and braces: no combination of the other inputs may produce a nudge
    // for someone who is already receiving notifications.
    for (const permission of ["granted", "provisional", "unsupported"] as PushPermission[]) {
      expect(
        shouldNudgeForNotifications({
          ...BASE,
          permission,
          dismissals: 0,
          profileComplete: true,
          onHome: true,
          signedIn: true,
        }),
      ).toBe(false);
    }
  });
});

/*
 * The regression behind ClickUp z8x1tu0vv8: the sheet offered "Allow
 * notifications" again after the app was killed and reopened, because the
 * gate remembered "asking is spent" in React state. Android had already
 * stopped showing the runtime dialog, so the button did nothing and the sheet
 * came back every launch. Deriving it from the permission is what survives a
 * restart, and these pin that it is derived.
 */
describe("needsSettingsFor", () => {
  it("sends a refused user to Settings", () => {
    // The runtime dialog is spent, or the toggle is off. Either way the only
    // way back is Settings.
    expect(needsSettingsFor("denied")).toBe(true);
  });

  it("offers the prompt when nobody has been asked yet", () => {
    expect(needsSettingsFor("undetermined")).toBe(false);
  });

  it("does not send a granted user anywhere", () => {
    expect(needsSettingsFor("granted")).toBe(false);
    expect(needsSettingsFor("provisional")).toBe(false);
  });

  it("does not offer Settings where there is nothing to enable", () => {
    // A simulator or a build with no native module. Settings would lead
    // nowhere, and shouldNudgeForNotifications already declines to show the
    // sheet at all in this state.
    expect(needsSettingsFor("unsupported")).toBe(false);
  });
});
