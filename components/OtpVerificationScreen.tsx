import OtpInput from "@/components/OtpInput";
import OtpStatusBanner from "@/components/OtpStatusBanner";
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";
import type { OtpResult } from "@/store/store";
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
import { Constants, Utils } from "../utils/constants";

const RESEND_COOLDOWN_SECONDS = 60;
const FALLBACK_RETRY_AFTER_SECONDS = 60;

interface OtpVerificationScreenProps {
  /** Route param; may be absent or malformed on a deep link. */
  email: string | undefined;
  title: string;
  subtitle: React.ReactNode;
  verifyButtonLabel: string;
  verifiedAnnouncement: string;
  verify: (email: string, otp: string) => Promise<OtpResult>;
  resend: (email: string) => Promise<OtpResult>;
  /**
   * Called on a successful verify. Return false to reject the result and show
   * the generic failure state (e.g. a success response missing its resetToken).
   */
  onVerified: (result: OtpResult) => boolean;
  /** Invoked when `email` is missing or malformed — should navigate away. */
  onInvalidEmail: () => void;
  footer?: React.ReactNode;
}

const OtpVerificationScreen = ({
  email,
  title,
  subtitle,
  verifyButtonLabel,
  verifiedAnnouncement,
  verify,
  resend,
  onVerified,
  onInvalidEmail,
  footer,
}: OtpVerificationScreenProps) => {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);

  const resendCooldown = useCountdown();
  const rateLimitCountdown = useCountdown();

  // useLocalSearchParams types the param as string, but it is undefined when
  // absent. Without this guard the email key drops out of the request body
  // entirely (JSON.stringify omits undefined) and the user just sees
  // "invalid code" with no hint at the real problem.
  const hasValidEmail = !!email && Utils.isEmail(email);

  useEffect(() => {
    if (!hasValidEmail) {
      Constants.showDialog("Something went wrong. Please start over.");
      onInvalidEmail();
      return;
    }
    resendCooldown.start(RESEND_COOLDOWN_SECONDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidEmail]);

  const isRateLimited = rateLimitCountdown.isActive;
  const canSubmit = otp.length === 6 && !locked && !isRateLimited;

  const handleOtpChange = (value: string) => {
    setOtp(value);
    if (hasError) {
      setHasError(false);
      setInlineError(null);
    }
  };

  const applyRateLimit = (result: OtpResult) => {
    const message = result.ErrorMessage || "Too many requests. Please try again later.";
    // ?? not || — a legitimate retryAfterSeconds of 0 must not become 60.
    const seconds = result.retryAfterSeconds ?? FALLBACK_RETRY_AFTER_SECONDS;

    if (seconds <= 0) {
      // Window already elapsed (e.g. a Retry-After date in the past): no
      // countdown to render, so surface it inline or the tap looks like a no-op.
      showFailure(message);
      return;
    }

    setRateLimitMessage(message);
    rateLimitCountdown.start(seconds);
    AccessibilityInfo.announceForAccessibility(message);
  };

  const showFailure = (message: string) => {
    setHasError(true);
    setInlineError(message);
    AccessibilityInfo.announceForAccessibility(message);
  };

  const verifyPressed = async () => {
    if (!hasValidEmail) return;

    if (otp.length < 6) {
      Constants.showDialog("Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      const result = await verify(email, otp);

      if (result.Status === "Success" && onVerified(result)) {
        AccessibilityInfo.announceForAccessibility(verifiedAnnouncement);
        return;
      }

      if (result.code === "ATTEMPTS_EXHAUSTED") {
        setLocked(true);
        setOtp("");
        AccessibilityInfo.announceForAccessibility(
          "Too many attempts. Request a new code to continue.",
        );
      } else if (result.code === "RATE_LIMITED") {
        applyRateLimit(result);
      } else {
        setOtp("");
        showFailure(result.ErrorMessage || "That code didn't work. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const resendPressed = async () => {
    if (!hasValidEmail) return;

    setResending(true);
    try {
      const result = await resend(email);

      if (result.code === "RATE_LIMITED") {
        applyRateLimit(result);
        return;
      }

      // Anything other than an explicit success is a failure — reporting
      // "code sent" on a 500 leaves the user waiting for an email that is
      // never coming, and starts a cooldown that blocks the retry.
      if (result.Status !== "Success") {
        showFailure(result.ErrorMessage || "Couldn't send a new code. Please try again.");
        return;
      }

      setLocked(false);
      setHasError(false);
      setInlineError(null);
      setOtp("");
      resendCooldown.start(RESEND_COOLDOWN_SECONDS);
      // A 200 does not mean an email went out. The backend answers 200 for a
      // silently-throttled resend and for an address with no account, so that
      // the response can't be used to enumerate registered emails. Announce
      // the server's own hedged wording rather than asserting a send.
      AccessibilityInfo.announceForAccessibility(
        result.Message || "If an account exists for that email, a new code has been sent.",
      );
    } finally {
      setResending(false);
    }
  };

  // onInvalidEmail has already been asked to navigate away; render nothing
  // rather than a screen wired to an unusable email.
  if (!hasValidEmail) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      {/* Green Header Section */}
      <View style={styles.headerSection}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>{title}</Text>
          <Text style={styles.welcomeSubtitle}>{subtitle}</Text>
        </View>
      </View>

      {/* White Content Section */}
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
              style={[
                styles.verifyButton,
                (resending || isRateLimited) && styles.verifyButtonDisabled,
              ]}
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
                <Text style={styles.verifyButtonText}>{verifyButtonLabel}</Text>
              )}
            </TouchableOpacity>
          )}

          {footer}
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

export default OtpVerificationScreen;
export { RESEND_COOLDOWN_SECONDS };
