import OtpVerificationScreen from "@/components/OtpVerificationScreen";
import { useAppStore } from "@/store/store";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Constants } from "../utils/constants";

const VerifyEmailScreen = () => {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { verifyEmailOtp, resendVerificationOtp } = useAppStore();

  return (
    <OtpVerificationScreen
      email={email}
      title="Verify Your Email"
      subtitle={`We've sent a 6-digit code to\n${email ?? ""}`}
      verifyButtonLabel="Verify Email"
      verifiedAnnouncement="Email verified successfully."
      verify={verifyEmailOtp}
      resend={resendVerificationOtp}
      onVerified={() => {
        router.replace("/(tabs)/home");
        return true;
      }}
      onInvalidEmail={() => router.replace("/login")}
      footer={
        <TouchableOpacity
          style={styles.escapeContainer}
          onPress={() => router.replace("/register")}
        >
          {/* A mistyped address can never receive a code, and the account is
              already created — without this the screen is a dead end. Signing
              up again under the correct address is the only recovery the
              current backend supports; see issue #23. */}
          <Text style={styles.escapeText}>Wrong email? Sign up again</Text>
        </TouchableOpacity>
      }
    />
  );
};

const styles = StyleSheet.create({
  escapeContainer: {
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 30,
    padding: 10,
  },
  escapeText: {
    color: Constants.appThemeColor,
    fontSize: 14,
    fontWeight: "500",
  },
});

export default VerifyEmailScreen;
