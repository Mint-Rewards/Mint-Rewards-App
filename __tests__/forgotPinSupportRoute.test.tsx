/**
 * The way out of the security question, which for a long time did not exist.
 *
 * `app/contact-support.tsx` had exactly ONE entry point in the whole app: the
 * NO_SECURITY_QUESTION 409, reached only by an account that never set a
 * question. Somebody who set one and could not remember the answer got five
 * wrong-answer alerts, a fifteen-minute lockout, and no route anywhere — there
 * is no help row, no phone number and no email anywhere else in the app, and
 * this screen was meanwhile offering "I have a code from support" while hiding
 * the only thing that produces a code.
 *
 * That defect was a MISSING LINK, which is the class that reappears silently in
 * a refactor and shows up as nothing at all on screen. Hence these tests: the
 * route exists, it carries the number, and the lockout does not read as an
 * instruction to wait.
 */
import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text, TextInput, TouchableOpacity } from "react-native";

import { router } from "expo-router";
import { Constants } from "@/utils/constants";
import ForgotPin from "@/app/forgot-pin";

/*
 * The spies are created INSIDE the factories and read back out afterwards.
 *
 * Capturing an outer `const` does not work, whichever order these are written
 * in: babel hoists `jest.mock` above the imports, so a factory that closes
 * over a `const` runs while the variable is still uninitialised and the mock
 * ends up holding `undefined`. That surfaces as "showDialog is not a function"
 * from inside the component, which looks like a bug in the screen rather than
 * a mistake in the setup.
 */
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock("@/utils/constants", () => ({
  API_BASE_URL: "https://test.invalid",
  Constants: { appThemeColor: "#449EB2", showDialog: jest.fn() },
}));

const mockPush = jest.mocked(router.push);
const mockShowDialog = jest.mocked(Constants.showDialog);

const NUMBER = "03001234567";
const QUESTION = "What was the name of your first pet?";

/** One queued reply per fetch call, in order. */
function replyWith(...replies: { ok: boolean; data: unknown }[]) {
  const queue = [...replies];
  global.fetch = jest.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("fetch called more times than the test queued");
    return { ok: next.ok, json: async () => next.data };
  }) as unknown as typeof global.fetch;
}

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ForgotPin />);
  });
  return tree;
}

const rendered = (tree: renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON());

/** Buttons by the words on them, which is how a person finds them. */
function buttonsSaying(tree: renderer.ReactTestRenderer, text: string) {
  return tree.root
    .findAllByType(TouchableOpacity)
    .filter((node) =>
      node
        .findAllByType(Text)
        .some((t) => String(t.props.children).includes(text)),
    );
}

async function press(node: renderer.ReactTestInstance) {
  await act(async () => {
    node.props.onPress();
  });
}

async function type(tree: renderer.ReactTestRenderer, value: string) {
  await act(async () => {
    tree.root.findAllByType(TextInput)[0].props.onChangeText(value);
  });
}

/** Type the number, submit it, and let the question come back. */
async function reachAnswerStep(tree: renderer.ReactTestRenderer) {
  await type(tree, NUMBER);
  await press(buttonsSaying(tree, "Continue")[0]);
}

describe("forgot PIN — reaching support when the answer is gone", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockShowDialog.mockClear();
  });

  it("offers support once the question has been asked", async () => {
    replyWith({ ok: true, data: { success: true, questionPrompt: QUESTION } });
    const tree = render();
    await reachAnswerStep(tree);

    expect(rendered(tree)).toContain(QUESTION);
    expect(buttonsSaying(tree, "I cannot remember my answer")).toHaveLength(1);
  });

  it("carries the number across, so a locked-out person does not retype it", async () => {
    replyWith({ ok: true, data: { success: true, questionPrompt: QUESTION } });
    const tree = render();
    await reachAnswerStep(tree);

    await press(buttonsSaying(tree, "I cannot remember my answer")[0]);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const { pathname, params } = mockPush.mock.calls[0][0] as {
      pathname: string;
      params: { phone: string };
    };
    expect(pathname).toBe("/contact-support");
    // The national form, as the 409 branch has always carried it — and not
    // blank, which is what a missing capture would quietly produce.
    expect(params.phone.replace(/\D/g, "")).toBe(NUMBER);
  });

  /*
   * THE WAIT IS OPTIONAL AND THE SCREEN HAS TO SAY SO.
   *
   * `pin-recovery/redeem` never consults the PIN lock and `setUserPin` clears
   * `pinLockedUntil`, so an agent's code works during the fifteen minutes. The
   * server's own message only suggests waiting, so if this note goes missing
   * the screen is back to telling people to sit out a lockout they could skip.
   */
  it("says the lockout can be skipped, rather than leaving 'try again later' as the last word", async () => {
    replyWith(
      { ok: true, data: { success: true, questionPrompt: QUESTION } },
      {
        ok: false,
        data: {
          error: "Too many incorrect attempts. Try again in 15 minutes.",
          code: "PIN_LOCKED",
        },
      },
    );
    const tree = render();
    await reachAnswerStep(tree);

    expect(rendered(tree)).not.toContain("You do not have to wait");

    await type(tree, "Rusty");
    await press(buttonsSaying(tree, "Continue")[0]);

    expect(mockShowDialog).toHaveBeenCalled();
    expect(rendered(tree)).toContain("You do not have to wait");
    // And the route out is still there beside it.
    expect(buttonsSaying(tree, "I cannot remember my answer")).toHaveLength(1);
  });

  /*
   * The deliberate half of the decision, asserted so it is not "fixed" later by
   * somebody adding a link to every step. Nobody has failed anything on the
   * phone step, and a support link beside a number field invites a ticket
   * instead of an answer — every one of those costs an agent a phone call.
   */
  it("does not offer support before anybody has failed anything", () => {
    replyWith();
    const tree = render();

    expect(buttonsSaying(tree, "I cannot remember my answer")).toHaveLength(0);
    expect(rendered(tree)).not.toContain("You do not have to wait");
  });
});
