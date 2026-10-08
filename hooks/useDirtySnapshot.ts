/**
 * Whether a form has actually been edited since it opened.
 *
 * A Save button that is always enabled offers to save a form nobody touched:
 * a request that rewrites the same values, and — on a screen that gives no
 * feedback when nothing changed — no way for the person to tell a successful
 * save from a pointless one. Edit Profile behaved exactly that way.
 *
 * Why a hook rather than a few lines in the screen: the answer depends on
 * render timing, not just on values. A baseline kept in a ref would be set in
 * an effect and never re-render, so an untouched form would keep its enabled
 * button until the first keystroke — which is the whole bug, unfixed. Keeping
 * the baseline in state is what makes the button settle. That is a property
 * worth a test, and a screen that needs a dozen mocks to mount is not where it
 * can be tested.
 */
import { useEffect, useState } from "react";

/**
 * @param snapshot Everything that counts as an edit. Serialised whole rather
 *   than compared field by field: a form's shape grows, and a check that has
 *   to be extended for each new field is one that silently stops noticing.
 * @param ready Whether `snapshot` is the stored values yet. The baseline has to
 *   be taken AFTER seeding — forms normalise what they are given, so comparing
 *   against the raw record would show a form as dirty the moment it opened.
 */
export function useDirtySnapshot(snapshot: unknown, ready: boolean): boolean {
  const serialised = JSON.stringify(snapshot ?? null);
  const [baseline, setBaseline] = useState<string | null>(null);

  useEffect(() => {
    if (ready && baseline === null) setBaseline(serialised);
  }, [ready, baseline, serialised]);

  /*
   * Before there is a baseline, say dirty only while the values are not the
   * stored ones.
   *
   * The two cases differ. Not ready means the record never arrived, and
   * treating "I cannot tell" as "nothing changed" would leave the button
   * permanently dead for exactly those people — a silent failure, worse than
   * the always-enabled behaviour this replaces. Ready with no baseline is the
   * single frame before the effect runs, and there the honest answer is that
   * nothing has been edited.
   */
  if (baseline === null) return !ready;
  return serialised !== baseline;
}
