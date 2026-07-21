import OtpInput from "@/components/OtpInput";
import OtpStatusBanner from "@/components/OtpStatusBanner";
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";
import { useAppStore } from "@/store/store";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Constants } from "../utils/constants";

const RESEND_COOLDOWN_SECONDS = 60;

const VerifyEmailScreen = () => {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyEmailOtp, resendVerificationOtp } = useAppStore();

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);

  const resendCooldown = useCountdown();
  const rateLimitCountdown = useCountdown();

  useEffect(() => {
    resendCooldown.start(RESEND_COOLDOWN_SECONDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRateLimited = rateLimitCountdown.isActive;
  const canSubmit = otp.length === 6 && !locked && !isRateLimited;

  const handleOtpChange = (value: string) => {
    setOtp(value);
    if (hasError) {
      setHasError(false);
      setInlineError(null);
    }
  };

  const verifyPressed = async () => {
    if (otp.length < 6) {
      Constants.showDialog("Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      const result = await verifyEmailOtp(email, otp);

      if (result.Status === "Success") {
        AccessibilityInfo.announceForAccessibility("Email verified successfully.");
        router.replace("/(tabs)/home");
        return;
      }

      if (result.code === "ATTEMPTS_EXHAUSTED") {
        setLocked(true);
        setOtp("");
        AccessibilityInfo.announceForAccessibility(
          "Too many attempts. Request a new code to continue.",
        );
      } else if (result.code === "RATE_LIMITED") {
        setRateLimitMessage(result.ErrorMessage || "Too many requests. Please try again later.");
        rateLimitCountdown.start(result.retryAfterSeconds || 60);
        AccessibilityInfo.announceForAccessibility("Too many requests. Please try again later.");
      } else {
        setHasError(true);
        setOtp("");
        setInlineError(result.ErrorMessage || "That code didn't work. Please try again.");
        AccessibilityInfo.announceForAccessibility(result.ErrorMessage || "Verification failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const resendPressed = async () => {
    setResending(true);
    try {
      const result = await resendVerificationOtp(email);

      if (result.code === "RATE_LIMITED") {
        setRateLimitMessage(result.ErrorMessage || "Too many requests. Please try again later.");
        rateLimitCountdown.start(result.retryAfterSeconds || 60);
        return;
      }

      if (result.Status !== "Success") {
        setHasError(true);
        setInlineError(result.ErrorMessage || "Couldn't send a new code. Please try again.");
        AccessibilityInfo.announceForAccessibility(
          result.ErrorMessage || "Couldn't send a new code.",
        );
        return;
      }

      // Server responds 200 regardless of account state; assume the code was sent.
      setLocked(false);
      setHasError(false);
      setInlineError(null);
      setOtp("");
      resendCooldown.start(RESEND_COOLDOWN_SECONDS);
      AccessibilityInfo.announceForAccessibility("A new code has been sent to your email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Verify Your Email</Text>
          <Text style={styles.welcomeSubtitle}>
            We&apos;ve sent a 6-digit code to{"\n"}
            {email}
          </Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {locked && (
            <OtpStatusBanner
              tone="lockout"
              message="Too many attempts. Request a new code to continue."
            />
          )}
          {isRateLimited && (
            <OtpStatusBanner
              tone="rateLimited"
              message={`${rateLimitMessage} Try again in ${formatCountdown(rateLimitCountdown.secondsLeft)}.`}
            />
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Verification Code</Text>
            <OtpInput
              value={otp}
              onChange={handleOtpChange}
              error={hasError}
              disabled={locked || isRateLimited}
            />
            {inlineError && !locked && (
              <Text style={styles.inlineErrorText} accessibilityRole="alert">
                {inlineError}
              </Text>
            )}
          </View>

          <View style={styles.resendRow}>
            <Text style={styles.resendHelperText}>Didn&apos;t get a code? </Text>
            {resendCooldown.isActive ? (
              <Text style={styles.resendTimerText}>
                Resend in {formatCountdown(resendCooldown.secondsLeft)}
              </Text>
            ) : (
              <TouchableOpacity onPress={resendPressed} disabled={resending || isRateLimited}>
                {resending ? (
                  <ActivityIndicator color={Constants.appThemeColor} size="small" />
                ) : (
                  <Text style={styles.resendLinkText}>Resend code</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {locked ? (
            <TouchableOpacity
              style={[styles.verifyButton, (resending || isRateLimited) && styles.verifyButtonDisabled]}
              onPress={resendPressed}
              disabled={resending || isRateLimited}
            >
              {resending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.verifyButtonText}>Request a New Code</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.verifyButton, !canSubmit && styles.verifyButtonDisabled]}
              onPress={verifyPressed}
              disabled={loading || !canSubmit}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify Email</Text>
              )}
            </TouchableOpacity>
          )}
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
    paddingTop: 100,
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
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 15,
    textAlign: "center",
  },
  inlineErrorText: {
    marginTop: 12,
    fontSize: 13,
    color: "#D32F2F",
    textAlign: "center",
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
    flexWrap: "wrap",
  },
  resendHelperText: {
    fontSize: 14,
    color: "#666666",
  },
  resendTimerText: {
    fontSize: 14,
    color: "#999999",
    fontVariant: ["tabular-nums"],
  },
  resendLinkText: {
    fontSize: 14,
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
});

export default VerifyEmailScreen;
