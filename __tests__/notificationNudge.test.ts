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
import { shouldNudgeForNotifications } from "@/utils/notificationNudge";
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
