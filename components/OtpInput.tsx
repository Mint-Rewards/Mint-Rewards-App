import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Constants } from "@/utils/constants";

/**
 * A row of code boxes: ONE REAL FIELD, and boxes that only draw it.
 *
 * It used to be one `TextInput` per box, each `maxLength={length}` so a pasted
 * or autofilled code arrived whole and could be spread across them. The cost
 * was a box able to hold six characters, and letters pasted into one stayed
 * visible there: the handler stripped non-digits, which left the code
 * unchanged, so React had no prop change to push and the native field kept
 * what had been pasted.
 *
 * React Native does try to undo exactly this — `TextInput` keeps the last
 * native text in state and a layout effect re-sends `props.value` whenever the
 * two disagree (Libraries/Components/TextInput/TextInput.js). But that command
 * carries `mostRecentEventCount`, and native drops it when the count is stale,
 * which is why stuck text was intermittent rather than impossible.
 *
 * So the boxes are no longer inputs. A single field holds the code, sanitised
 * on every change, and each box draws one character of `value`. One digit per
 * box is then not a rule being enforced — there is nowhere else for a
 * character to be, whether it arrives by keystroke, paste or autofill, and
 * whether or not native honours a correction.
 *
 * Two bugs went with the old shape:
 *   - letters pasted into a box stayed on screen (above);
 *   - a digit typed into a box with empty boxes before it jumped to the front,
 *     because the code was `digits.join("")` and the gaps simply collapsed.
 */
interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  /**
   * Masks each digit. Off by default, because the original caller is an
   * emailed verification code — something the user is reading off a screen
   * and wants to see. A PIN is a secret they already know, so it is masked.
   *
   * Masking is now drawing a bullet instead of the character, rather than
   * `secureTextEntry` on the field. The field's text is transparent either
   * way, so nothing is revealed; and leaving `secureTextEntry` off keeps the
   * number pad from being replaced by iOS's password UI. Digits typed on a
   * number pad with autocorrect off are not learned, so the
   * keyboard-dictionary argument for it does not apply.
   */
  secure?: boolean;
  /**
   * `oneTimeCode` lets iOS autofill a code from Messages. Harmless for an
   * OTP and wrong for a PIN, which will never arrive by SMS — offering to
   * autofill one invites the wrong value into the field.
   */
  autoComplete?: "one-time-code" | "off";
  /**
   * Fired when the field takes focus.
   *
   * Android's KeyboardAvoidingView does nothing without a `behavior`, and
   * `padding` misbehaves there, so screens that sit low in a long form scroll
   * themselves into view instead. The boxes are the only control on the
   * sign-up form with no TextInput of its own for the screen to measure, so it
   * has to be told.
   */
  onFocus?: () => void;
}

/** Digits only, never longer than the row. The one place input is narrowed. */
const sanitize = (text: string, length: number): string =>
  text.replace(/\D/g, "").slice(0, length);

const OtpInput = ({
  length = 6,
  value,
  onChange,
  disabled = false,
  error = false,
  autoFocus = true,
  secure = false,
  autoComplete = "one-time-code",
  onFocus,
}: OtpInputProps) => {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  /*
   * Sanitised on the way out as well as on the way in.
   *
   * The field can only ever hand up digits, so this is for the parent: a
   * screen that restores a draft or prefills from a route param should not be
   * able to put a letter in a box either.
   */
  const code = sanitize(value ?? "", length);
  const characters = Array.from({ length }, (_, i) => code[i] ?? "");

  // The box the next character lands in, drawn with the focus ring so it reads
  // as a caret. Clamped, so a full code highlights its last box.
  const cursor = Math.min(code.length, length - 1);

  return (
    <View style={styles.container}>
      <View style={styles.row} pointerEvents="none">
        {characters.map((character, index) => {
          const filled = character !== "";
          const atCursor = focused && !disabled && index === cursor;

          return (
            <View
              key={index}
              style={[
                styles.box,
                filled && !error && styles.boxFilled,
                atCursor && !error && styles.boxFocused,
                error && styles.boxError,
                disabled && styles.boxDisabled,
              ]}
            >
              <Text
                style={[
                  styles.character,
                  !filled && styles.placeholder,
                  filled && error && styles.characterError,
                  filled && disabled && styles.characterDisabled,
                ]}
              >
                {filled ? (secure ? "•" : character) : "•"}
              </Text>
            </View>
          );
        })}
      </View>

      {/*
       * Last in the tree, so it sits above the boxes and takes the taps.
       *
       * HIDDEN TWO WAYS, and the first version was hidden only one.
       *
       * It shipped with `color: "transparent"` alone, on the reasoning that an
       * invisible-by-opacity input has a history of not raising the keyboard on
       * some Android versions. That risk was folklore; the one I took instead
       * was real. On Android 16 the field drew its text anyway — QA saw a full
       * PIN in plain text across the middle of the row, on top of the masked
       * dots, which is worse than the paste bug the rewrite was for
       * (z8x1tu46mg, and z8x1tu46me and z8x1tu46bf are the same cause).
       *
       * `opacity: 0` is the one that actually holds: it is the view's alpha, so
       * there is no text to draw whatever the platform does with a colour.
       * Alpha does not affect hit testing or focus, so the taps and the
       * keyboard are unchanged. The transparent colour stays as a second
       * mechanism rather than the only one.
       */}
      <TextInput
        ref={inputRef}
        style={styles.field}
        value={code}
        onChangeText={(text) => onChange(sanitize(text, length))}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        /*
         * Caps the FIELD, not a box, so a longer paste is truncated rather
         * than refused — somebody pasting a code with a trailing space or a
         * stray character still gets their six digits.
         */
        maxLength={length}
        textContentType={
          autoComplete === "one-time-code" ? "oneTimeCode" : "none"
        }
        /*
         * Always "off", which is an Android-only prop. The only value Android
         * offers for a code is "sms-otp", and ours arrive by EMAIL — claiming
         * otherwise sends the platform looking for a text message that is
         * never sent. iOS autofill is unaffected: `textContentType` above is
         * what drives it there, and it reads Mail as well as Messages.
         */
        autoComplete="off"
        autoCorrect={false}
        spellCheck={false}
        caretHidden
        selectionColor="transparent"
        editable={!disabled}
        autoFocus={autoFocus}
        accessibilityLabel={`Enter the ${length}-digit code`}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { position: "relative" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  box: {
    width: 46,
    height: 56,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    justifyContent: "center",
  },
  character: {
    fontSize: 22,
    fontWeight: "600",
    color: "#333333",
    textAlign: "center",
  },
  placeholder: { color: "#C6C6C6" },
  characterError: { color: "#B3261E" },
  characterDisabled: { color: "#999999" },
  boxFilled: {
    borderColor: "rgba(68, 158, 178, 0.5)",
    backgroundColor: "#ffffff",
  },
  boxFocused: {
    borderColor: Constants.appThemeColor,
    borderWidth: 2,
    backgroundColor: "#ffffff",
  },
  boxError: {
    borderColor: "#D32F2F",
    backgroundColor: "#FDECEA",
  },
  boxDisabled: {
    borderColor: "#E0E0E0",
    backgroundColor: "#F0F0F0",
    opacity: 0.7,
  },
  /*
   * Covers the whole row. The text is invisible and the caret is hidden, so
   * what the user sees is the boxes behind it; what they touch is this.
   */
  field: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // The one that holds: alpha, so nothing is drawn whatever the platform
    // makes of a transparent text colour. Both are kept deliberately — see
    // the comment at the field.
    opacity: 0,
    color: "transparent",
    backgroundColor: "transparent",
    // Keeps the invisible text from being laid out taller than the row on
    // Android, which would make the touch target drift.
    fontSize: 22,
    textAlign: "center",
  },
});

export default OtpInput;
