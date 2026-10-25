/**
 * Recovering a forgotten PIN.
 *
 * Three steps, matching the three endpoints: the number identifies the
 * account and returns its security question, the answer buys a ten-minute
 * token, and the token authorises one new PIN.
 *
 * WHY THREE SCREENS AND NOT ONE FORM: a wrong answer must not make somebody
 * retype a new PIN they had already chosen, because each wrong answer also
 * spends from the same lockout counter the PIN itself uses. Asking for the
 * new PIN only after the answer is accepted keeps a typo cheap.
 *
 * An account with no security question cannot be recovered here at all — that
 * is the 409, and the only honest thing to do is send them to a human.
 */
import { Ionicons } from "@expo/vector-icons";
import OtpInput from "@/components/OtpInput";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Constants, API_BASE_URL } from "../utils/constants";
import { normalizePhone, pinShapeError, PIN_LENGTH } from "../utils/phoneNumber";

type Step = "phone" | "answer" | "newPin" | "code";

const ForgotPin = () => {
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);

  const [phone, setPhone] = useState("");
  const [e164, setE164] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [supportCode, setSupportCode] = useState("");

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => ({})) };
  };

  const startPressed = async () => {
    const parsed = normalizePhone(phone);
    if (!parsed.ok) {
      Constants.showDialog(parsed.message);
      return;
    }

    setLoading(true);
    try {
      const { res, data } = await post("/api/users/pin-recovery/start", {
        phone: parsed.e164,
      });

      if (res.ok && data.questionPrompt) {
        setE164(parsed.e164);
        setQuestion(data.questionPrompt);
        setStep("answer");
        return;
      }

      /*
       * No question set. Nothing on this screen can help, so say so plainly
       * and offer the only route that exists rather than leaving them to
       * guess at an answer they never chose.
       */
      if (data.code === "NO_SECURITY_QUESTION") {
        Constants.showDialog(data.error);
        // Nothing on this screen can help them, so hand them straight to the
        // one route that can, with the number already filled in.
        router.push({
          pathname: "/contact-support",
          params: { phone: parsed.national },
        });
        return;
      }

      Constants.showDialog(data.error || "We could not look up that number.");
    } catch {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const answerPressed = async () => {
    if (!answer.trim()) {
      Constants.showDialog("Enter an answer.");
      return;
    }

    setLoading(true);
    try {
      const { res, data } = await post("/api/users/pin-recovery/verify", {
        phone: e164,
        answer,
      });

      if (res.ok && data.recoveryToken) {
        setRecoveryToken(data.recoveryToken);
        setStep("newPin");
        return;
      }

      // A lockout is not a wrong answer and must not read as one — the server
      // says how long is left, and somebody who does not know that will keep
      // trying.
      Constants.showDialog(data.error || "That answer is not correct.");
    } catch {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const redeemPressed = async () => {
    if (supportCode.length !== 6) {
      Constants.showDialog("Enter the 6-digit code from support.");
      return;
    }
    const shape = pinShapeError(pin);
    if (shape) {
      Constants.showDialog(shape);
      return;
    }
    if (pin !== confirmPin) {
      Constants.showDialog("The PINs do not match.");
      return;
    }

    setLoading(true);
    try {
      const { res, data } = await post("/api/users/pin-recovery/redeem", {
        phone: e164,
        code: supportCode,
        newPin: pin,
      });

      if (res.ok && data.success) {
        Constants.showDialog(data.message || "Your PIN has been reset.");
        router.replace("/login");
        return;
      }

      /*
       * A burnt code cannot be retried, so say so rather than leaving someone
       * typing the same six digits into a field that will never accept them
       * again.
       */
      if (data.code === "ATTEMPTS_EXHAUSTED") {
        Constants.showDialog(data.error);
        setSupportCode("");
        return;
      }

      Constants.showDialog(data.error || "That code is not valid.");
    } catch {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const setPinPressed = async () => {
    const shape = pinShapeError(pin);
    if (shape) {
      Constants.showDialog(shape);
      return;
    }
    if (pin !== confirmPin) {
      Constants.showDialog("The PINs do not match.");
      return;
    }

    setLoading(true);
    try {
      const { res, data } = await post("/api/users/pin-recovery/set-pin", {
        recoveryToken,
        newPin: pin,
      });

      if (res.ok && data.success) {
        Constants.showDialog(data.message || "Your PIN has been reset.");
        router.replace("/login");
        return;
      }

      /*
       * The token lives ten minutes. If it has expired the only way forward
       * is to answer the question again, so send them back rather than
       * leaving them on a screen whose button can no longer work.
       */
      if (data.code === "SESSION_INVALID") {
        Constants.showDialog(
          "That took too long and the session expired. Please answer the question again.",
        );
        setRecoveryToken("");
        setPin("");
        setConfirmPin("");
        setStep("answer");
        return;
      }

      Constants.showDialog(data.error || "We could not set that PIN.");
    } catch {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="#1f1f1f" />
        </TouchableOpacity>

        <Text style={styles.title}>Forgot your PIN?</Text>

        {step === "phone" && (
          <>
            <Text style={styles.subtitle}>
              Enter the mobile number on your account and we will ask you the
              security question you chose.
            </Text>
            <Text style={styles.label}>Mobile number</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCorrect={false}
                placeholder="03XX XXXXXXX"
                placeholderTextColor="#999999"
                maxLength={20}
              />
            </View>
            <TouchableOpacity
              style={styles.button}
              onPress={startPressed}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>

            {/*
              * For somebody already on the phone to support. They have a code
              * in hand and no reason to be asked a security question they have
              * by definition failed — this skips straight to spending it.
              */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                const parsed = normalizePhone(phone);
                if (!parsed.ok) {
                  Constants.showDialog(parsed.message);
                  return;
                }
                setE164(parsed.e164);
                setStep("code");
              }}
            >
              <Text style={styles.secondaryButtonText}>
                I have a code from support
              </Text>
            </TouchableOpacity>
          </>
        )}

        {step === "code" && (
          <>
            <Text style={styles.subtitle}>
              Enter the code the support agent read out, then choose a new
              {" "}{PIN_LENGTH}-digit PIN. The code expires 30 minutes after it
              was issued.
            </Text>

            <Text style={styles.label}>Code from support</Text>
            <OtpInput
              value={supportCode}
              onChange={setSupportCode}
              autoComplete="off"
              autoFocus={false}
              disabled={loading}
            />

            <Text style={styles.label}>New PIN</Text>
            <OtpInput
              value={pin}
              onChange={(t) => setPin(t)}
              secure
              autoComplete="off"
              autoFocus={false}
              disabled={loading}
            />

            <Text style={styles.label}>Confirm PIN</Text>
            <OtpInput
              value={confirmPin}
              onChange={setConfirmPin}
              secure
              autoComplete="off"
              autoFocus={false}
              disabled={loading}
            />

            <TouchableOpacity
              style={styles.button}
              onPress={redeemPressed}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Set new PIN</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === "answer" && (
          <>
            <Text style={styles.subtitle}>{question}</Text>
            <Text style={styles.label}>Your answer</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={answer}
                onChangeText={setAnswer}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Type your answer"
                placeholderTextColor="#999999"
                maxLength={100}
              />
            </View>
            <Text style={styles.hint}>
              Capitals and extra spaces do not matter.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={answerPressed}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === "newPin" && (
          <>
            <Text style={styles.subtitle}>
              Choose a new {PIN_LENGTH}-digit PIN.
            </Text>

            <Text style={styles.label}>New PIN</Text>
            <OtpInput
              value={pin}
              onChange={setPin}
              secure
              autoComplete="off"
              autoFocus={false}
              disabled={loading}
            />

            <Text style={[styles.label, styles.labelSpaced]}>Confirm PIN</Text>
            <OtpInput
              value={confirmPin}
              onChange={setConfirmPin}
              secure
              autoComplete="off"
              autoFocus={false}
              error={confirmPin.length === PIN_LENGTH && confirmPin !== pin}
              disabled={loading}
            />

            <TouchableOpacity
              style={styles.button}
              onPress={setPinPressed}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Set new PIN</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  scroll: { padding: 24, paddingTop: 70, flexGrow: 1 },
  back: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: "bold", color: "#1f1f1f", marginBottom: 10 },
  subtitle: { fontSize: 15, color: "#5c6368", lineHeight: 22, marginBottom: 26 },
  label: { fontSize: 14, fontWeight: "600", color: "#1f1f1f", marginBottom: 8 },
  labelSpaced: { marginTop: 20 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e3e6e8",
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: "#1f1f1f" },
  hint: { fontSize: 13, color: "#7a8287", marginTop: -8, marginBottom: 20 },
  button: {
    backgroundColor: Constants.appThemeColor,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 6,
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  secondaryButton: { paddingVertical: 16, alignItems: "center", marginTop: 4 },
  secondaryButtonText: {
    color: Constants.appThemeColor,
    fontSize: 15,
    fontWeight: "600",
  },
});

export default ForgotPin;
