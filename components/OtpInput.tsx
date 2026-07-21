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
}

const OtpInput = ({
  length = 6,
  value,
  onChange,
  disabled = false,
  error = false,
  autoFocus = true,
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
      // Pasted or autofilled. A full-length paste replaces the whole code —
      // iOS oneTimeCode autofill can land on a non-zero box, and splicing it
      // in would drop the digits already sitting after that box.
      const merged =
        cleaned.length >= length
          ? cleaned.slice(0, length)
          : (
              value.slice(0, index) +
              cleaned +
              value.slice(index + cleaned.length)
            ).slice(0, length);
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
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex((prev) => (prev === index ? null : prev))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
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
