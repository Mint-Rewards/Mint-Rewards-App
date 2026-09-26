/**
 * Who gets asked to turn notifications back on, and when.
 *
 * Pure, for the same reason `resolveLocationGate` is: this decides whether a
 * modal lands on top of someone, and that decision should be readable in a
 * test table rather than inferred from a component's effects.
 *
 * The stake is not cosmetic. A household is told about a collection by push —
 * that a van is coming, that it has been cancelled, that it is at the gate. A
 * person with notifications off is not a person missing a nicety; they are a
 * person who will be out when we arrive.
 */
import type { PushPermission } from "@/utils/push";

export interface NotificationNudgeInput {
  /** What the device reports. `checkPushPermission`, never the prompting one. */
  permission: PushPermission;
  /** Nobody is nagged before they have an account to be notified about. */
  signedIn: boolean;
  /**
   * Whether the user can actually be sent to.
   *
   * A household with no pin cannot be routed and so is never invited to a
   * collection — turning notifications on would not deliver anything yet. It
   * also keeps this sheet off Home while the location gate is using it, which
   * is the more urgent ask of the two.
   */
  profileComplete: boolean;
  /** Only ever shown over Home, like the location gate. */
  onHome: boolean;
  /** How many times they have said "not now" this run. */
  dismissals: number;
  maxDismissals: number;
}

/**
 * Whether to show the nudge.
 *
 * `undetermined` counts as needing one. It means the iOS prompt has never been
 * shown, which is indistinguishable, from the user's side, from having said
 * no: either way nothing arrives. The sheet explains why before the system
 * dialog appears, which is also the one chance to make the dialog land well —
 * iOS shows it once, ever.
 *
 * `provisional` does NOT. It is a real iOS state in which notifications are
 * delivered quietly to Notification Center, and we never request it, so if it
 * turns up the user chose it deliberately.
 */
export function shouldNudgeForNotifications(
  input: NotificationNudgeInput,
): boolean {
  const { permission } = input;
  // "unsupported" is a simulator or a missing native module. There is nothing
  // for the user to turn on and the button would lead nowhere.
  if (permission !== "denied" && permission !== "undetermined") return false;
  if (!input.signedIn) return false;
  if (!input.profileComplete) return false;
  if (!input.onHome) return false;
  return input.dismissals < input.maxDismissals;
}
