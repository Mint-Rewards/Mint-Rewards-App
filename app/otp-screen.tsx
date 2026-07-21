import OtpVerificationScreen from "@/components/OtpVerificationScreen";
import { useAppStore } from "@/store/store";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Constants } from "../utils/constants";

const OtpScreen = () => {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { verifyOTP, forgotPassword } = useAppStore();

  return (
    <OtpVerificationScreen
      email={email}
      title="Enter Code"
      subtitle="Please enter the 6-digit verification code sent to your email address."
      verifyButtonLabel="Verify Code"
      verifiedAnnouncement="Code verified."
      verify={verifyOTP}
      resend={(address) => forgotPassword(address, { isResend: true })}
      onVerified={(result) => {
        // verifyOTP stashes the token in the store; a success without one is
        // unusable, so reject it and let the generic failure state show.
        if (!result.resetToken) return false;
        router.push("/change-password");
        return true;
      }}
      onInvalidEmail={() => router.replace("/forgot-password")}
      footer={
        <TouchableOpacity style={styles.backContainer} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back to Forgot Password</Text>
        </TouchableOpacity>
      }
    />
  );
};

const styles = StyleSheet.create({
  backContainer: {
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 30,
    padding: 10,
  },
  backText: {
    color: Constants.appThemeColor,
    fontSize: 14,
    fontWeight: "500",
  },
});

export default OtpScreen;
