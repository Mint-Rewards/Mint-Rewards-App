import { useAppStore } from "@/store/store";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Constants } from "../utils/constants";

const OtpScreen = () => {
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);

  const { email } = useLocalSearchParams();

  const { verifyOTP } = useAppStore();

  // References for TextInputs to manage focus
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleOtpChange = (value: string, index: number) => {
    // Only allow digits
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];

    if (value.length <= 1) {
      newOtp[index] = value;
      setOtp(newOtp);

      // Auto-focus next input if value is entered
      if (value && index < 3) {
        inputRefs.current[index + 1]?.focus();
      }
    } else if (value.length > 1) {
      // Handle paste or multiple digits
      const digits = value.slice(0, 4).split("");
      for (let i = 0; i < 4; i++) {
        newOtp[i] = digits[i] || "";
      }
      setOtp(newOtp);

      // Focus the appropriate input
      const nextIndex = Math.min(digits.length, 3);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace") {
      if (otp[index] === "" && index > 0) {
        // Move to previous input if current is empty
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const verifyOtpPressed = async () => {
    const otpString = otp.join("");

    if (otpString.length < 4) {
      Constants.showDialog("Please enter complete OTP");
      return;
    }

    if (!/^\d{4}$/.test(otpString)) {
      Constants.showDialog("Please enter valid 4-digit OTP");
      return;
    }

    setLoading(true);
    try {
      // Simulate OTP verification API call
      await verifyOTP(email as string, otpString);
      // For demo purposes, accept any 4-digit OTP
      // In production, you would call your OTP verification API
      Constants.showDialog("OTP verified successfully!");
      router.push(`/change-password?email=${email}`); // Navigate to appropriate screen
    } catch {
      Constants.showDialog("Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isOtpComplete = otp.every((digit) => digit !== "");

  return (
    <View style={styles.container}>
      {/* Green Header Section */}
      <View style={styles.headerSection}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Enter OTP</Text>
          <Text style={styles.welcomeSubtitle}>
            Please enter the 4-digit verification code sent to your email
            address.
          </Text>
        </View>
      </View>

      {/* White Content Section */}
      <View style={styles.contentSection}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* OTP Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Verification Code</Text>
            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <View key={index} style={styles.otpInputContainer}>
                  <TextInput
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    style={[styles.otpInput, digit && styles.otpInputFilled]}
                    value={digit}
                    onChangeText={(value) => handleOtpChange(value, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    keyboardType="number-pad"
                    maxLength={1}
                    textAlign="center"
                    selectTextOnFocus
                    placeholder="0"
                    placeholderTextColor="#999999"
                  />
                </View>
              ))}
            </View>
          </View>

          {/* Verify Button */}
          <TouchableOpacity
            style={[
              styles.verifyButton,
              !isOtpComplete && styles.verifyButtonDisabled,
            ]}
            onPress={verifyOtpPressed}
            disabled={loading || !isOtpComplete}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.verifyButtonText}>Verify OTP</Text>
            )}
          </TouchableOpacity>

          {/* Back to Login */}
          <TouchableOpacity
            style={styles.backToLoginContainer}
            onPress={() => router.back()}
          >
            <Text style={styles.backToLoginText}>
              ← Back to Forgot Password
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  headerSection: {
    backgroundColor: Constants.appThemeColor,
    paddingTop: 100, // For status bar
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  welcomeSection: {
    marginTop: 10,
  },
  welcomeTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },
  welcomeSubtitle: {
    color: "#ffffff",
    fontSize: 16,
    lineHeight: 22,
    opacity: 0.9,
  },
  contentSection: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  inputGroup: {
    marginBottom: 30,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 15,
    textAlign: "center",
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  otpInputContainer: {
    width: 60,
    height: 60,
  },
  otpInput: {
    width: "100%",
    height: "100%",
    borderWidth: 2,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    fontSize: 24,
    fontWeight: "600",
    color: "#333333",
    backgroundColor: "#FAFAFA",
  },
  otpInputFilled: {
    borderColor: Constants.appThemeColor,
    backgroundColor: "#ffffff",
  },
  resendSection: {
    alignItems: "center",
    marginBottom: 30,
  },
  resendText: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 10,
  },
  resendButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
  },
  resendButtonText: {
    fontSize: 16,
    color: Constants.appThemeColor,
    fontWeight: "600",
  },
  verifyButton: {
    height: 52,
    backgroundColor: Constants.appThemeColor,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  verifyButtonDisabled: {
    backgroundColor: "#CCCCCC",
  },
  verifyButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  backToLoginContainer: {
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 30,
    padding: 10,
  },
  backToLoginText: {
    color: Constants.appThemeColor,
    fontSize: 14,
    fontWeight: "500",
  },
});

export default OtpScreen;
