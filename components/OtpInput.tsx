import React, { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Constants } from "@/utils/constants";

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
   */
  secure?: boolean;
  /**
   * `oneTimeCode` lets iOS autofill a code from Messages. Harmless for an
   * OTP and wrong for a PIN, which will never arrive by SMS — offering to
   * autofill one invites the wrong value into the field.
   */
  autoComplete?: "one-time-code" | "off";
  /**
   * Fired when any box takes focus.
   *
   * Android's KeyboardAvoidingView does nothing without a `behavior`, and
   * `padding` misbehaves there, so screens that sit low in a long form scroll
   * themselves into view instead. The boxes are the only control on the sign-up
   * form with no TextInput of its own for the screen to measure, so it has to
   * be told.
   */
  onFocus?: () => void;
}

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
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const setCode = (next: string) => {
    onChange(next.slice(0, length));
  };

  const handleChangeText = (text: string, index: number) => {
    const cleaned = text.replace(/\D/g, "");

    if (cleaned.length > 1) {
      // Pasted or autofilled full code
      const merged = (value.slice(0, index) + cleaned).slice(0, length);
      setCode(merged);
      const nextIndex = Math.min(merged.length, length - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const nextDigits = [...digits];
    nextDigits[index] = cleaned;
    setCode(nextDigits.join(""));

    if (cleaned && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const nextDigits = [...digits];
      nextDigits[index - 1] = "";
      setCode(nextDigits.join(""));
    }
  };

  return (
    <View style={styles.container} accessibilityRole="none">
      {digits.map((digit, index) => {
        const isFocused = focusedIndex === index;
        return (
          <TextInput
            key={index}
            ref={(ref) => {
              inputRefs.current[index] = ref;
            }}
            style={[
              styles.box,
              digit && !error && styles.boxFilled,
              isFocused && !error && !disabled && styles.boxFocused,
              error && styles.boxError,
              disabled && styles.boxDisabled,
            ]}
            value={digit}
            onChangeText={(text) => handleChangeText(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            onFocus={() => {
              setFocusedIndex(index);
              onFocus?.();
            }}
            onBlur={() => setFocusedIndex((prev) => (prev === index ? null : prev))}
            keyboardType="number-pad"
            secureTextEntry={secure}
            textContentType={autoComplete === "one-time-code" ? "oneTimeCode" : "none"}
            maxLength={length}
            textAlign="center"
            selectTextOnFocus
            editable={!disabled}
            autoFocus={autoFocus && index === 0}
            accessibilityLabel={`Digit ${index + 1} of ${length}`}
            placeholder="•"
            placeholderTextColor="#C6C6C6"
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
    fontSize: 22,
    fontWeight: "600",
    color: "#333333",
  },
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
    color: "#B3261E",
  },
  boxDisabled: {
    borderColor: "#E0E0E0",
    backgroundColor: "#F0F0F0",
    color: "#999999",
    opacity: 0.7,
  },
});

export default OtpInput;
