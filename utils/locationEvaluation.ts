/**
 * Turning the server's completion verdict into something a person can act on.
 *
 * `PATCH /api/users/location` answers with an `evaluation` naming exactly which
 * requirements are unmet — and until now nothing read it. That mattered because
 * the client and the server do NOT agree about "complete", and cannot: the
 * server evaluates the structured record (`location.source` must be `map_pin`
 * or `collector_verified`, `structuredAddress.cityId`…) while the client checks
 * the flat form fields. The gap is real and reachable — a user whose coordinate
 * was written by an older build carries `legacy_string`, satisfies every check
 * this app makes, and fails the server's `pin`.
 *
 * Before this module, that user tapped Save, everything succeeded, the modal
 * stayed up and NOTHING was said. Client validation had passed, so no field was
 * marked; the PATCH had succeeded, so no error fired. The answer was sitting in
 * a response body nobody opened.
 */

import { getHouseNoField } from "@/utils/pakistan_areas";

/**
 * The server's `LocationRequirementField` values, which are wire identifiers
 * rather than anything a user has ever seen. `areaId` is the "Town" field on
 * every screen in this app; `cityId` is "City".
 */
const KNOWN_FIELDS = ["cityId", "areaId", "houseNo", "pin"] as const;

export type ServerMissingField = (typeof KNOWN_FIELDS)[number];

export interface MissingLabelContext {
  city?: string;
  town?: string;
  /**
   * Whether the user can SEE a coordinate on the form.
   *
   * Changes what "missing pin" is allowed to say. The server rejects a pin
   * whose `source` is not `map_pin`/`collector_verified`, so a coordinate saved
   * by an older build is simultaneously visible on screen and missing as far as
   * the server is concerned. Telling that user their address "still needs Map
   * pin" while a coordinate sits in front of them reads as a broken app — it is
   * the exact confusion this flag exists to remove.
   */
  hasCoordinate?: boolean;
}

/**
 * Human labels for the fields the server says are missing, in the order it
 * returned them.
 *
 * Untrusted input: this is a response body, and a server that adds a fifth
 * requirement before this client ships support for it must not produce a
 * mystery. Unrecognised values are DROPPED rather than shown raw — telling
 * someone they are missing "deliveryWindowId" helps nobody — and the caller
 * handles the empty result (see `missingSentence`).
 *
 * The house-number label is registry-driven for the same reason it is on the
 * form: a household is asked for a house or flat number, an industrial plot for
 * a unit or building name, and being told to fill in a field under a name it
 * does not have is worse than not being told at all.
 */
export function describeMissingFields(
  missing: readonly unknown[] | null | undefined,
  context: MissingLabelContext = {},
): string[] {
  if (!Array.isArray(missing)) return [];
  const labels: string[] = [];
  for (const field of missing) {
    switch (field) {
      case "cityId":
        labels.push("City");
        break;
      case "areaId":
        labels.push("Town");
        break;
      case "houseNo":
        labels.push(
          getHouseNoField(context.city ?? "", context.town ?? "").label,
        );
        break;
      case "pin":
        labels.push("Map pin");
        break;
      default:
        break; // unrecognised — see the doc comment
    }
  }
  return labels;
}

/** Joins labels the way a person writes a list: "a, b and c". */
function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * One sentence naming what is still outstanding, or null when there is nothing
 * to say.
 *
 * Returns null in three cases, and the third is the important one:
 *
 *  1. No evaluation — the PATCH failed or was never made.
 *  2. `complete: true` — nothing is missing.
 *  3. `complete: false` but nothing RECOGNISABLE is missing. A vague "something
 *     is wrong, we can't say what" is worse than silence: it cannot be acted on
 *     and it undermines a save that genuinely succeeded. Whatever the server
 *     wants in that case, this build cannot collect it anyway.
 */
export function missingSentence(
  evaluation:
    | { complete?: boolean; missing?: readonly unknown[] }
    | null
    | undefined,
  context: MissingLabelContext = {},
): string | null {
  if (!evaluation || evaluation.complete !== false) return null;
  const labels = describeMissingFields(evaluation.missing, context);
  if (labels.length === 0) return null;

  // A coordinate is on screen and the server still will not count it: it was
  // not placed through the map this session, so it carries a source the server
  // rejects. Naming the field is useless here — what the user needs is the
  // action that fixes it.
  const needsReconfirm =
    context.hasCoordinate === true &&
    Array.isArray(evaluation.missing) &&
    evaluation.missing.includes("pin");

  if (needsReconfirm) {
    const others = labels.filter((label) => label !== "Map pin");
    const rest = others.length
      ? ` It also needs ${joinLabels(others)}.`
      : "";
    return (
      "Please confirm your location on the map — tap “Adjust pin”, then Confirm." +
      ` Your saved pin was placed by an older version of the app, so it needs re-confirming.${rest}`
    );
  }

  return `Your address still needs ${joinLabels(labels)} before you can book a pickup.`;
}
