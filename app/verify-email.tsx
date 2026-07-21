import OtpVerificationScreen from "@/components/OtpVerificationScreen";
import { useAppStore } from "@/store/store";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";

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
    />
  );
};

export default VerifyEmailScreen;
