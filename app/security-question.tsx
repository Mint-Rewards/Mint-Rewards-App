/**
 * Choosing the security question that can get you back in.
 *
 * WHO THIS MATTERS TO IS NOT EVERYONE. An account created from an email
 * address can always fall back on a reset link. An account created from a
 * phone number has NO ADDRESS — the column is genuinely null — so this
 * question plus a support ticket is the entire recovery story. The screen
 * says which case the reader is in rather than showing the same copy to both.
 *
 * Deliberately NOT part of the profile-completion predicate. That predicate
 * pays the completion bonus and decides who counts as routable; adding a field
 * to it would make every already-complete profile incomplete again and change
 * who gets paid.
 */
import { useAppStore } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import OtpInput from "@/components/OtpInput";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
import * as SecureStore from "expo-secure-store";
import { Constants, API_BASE_URL } from "../utils/constants";
import { PIN_LENGTH, pinShapeError } from "../utils/phoneNumber";

interface Question {
  id: string;
  prompt: string;
}

const SecurityQuestion = () => {
  const user = useAppStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alreadySet, setAlreadySet] = useState(false);
  const [answer, setAnswer] = useState("");
  const [currentPin, setCurrentPin] = useState("");

  /*
   * An account with no email can only be recovered through this question, so
   * the copy below changes rather than being written for the average case.
   */
  const phoneOnly = !user?.email;

  /*
   * The stored value is already "Bearer <jwt>" — the API requires the scheme
   * and rejects a bare token, so it is passed through verbatim rather than
   * re-prefixed.
   */
  const authHeader = async (): Promise<Record<string, string>> => {
    const token = await SecureStore.getItemAsync("userToken");
    return token ? { Authorization: token } : {};
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/security-question`, {
          headers: { ...(await authHeader()) },
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && Array.isArray(data.questions)) {
          setQuestions(data.questions);
          setSelectedId(data.selectedQuestionId ?? data.questions[0]?.id ?? null);
          setAlreadySet(Boolean(data.selectedQuestionId));
        } else {
          Constants.showDialog(data.error || "Could not load the questions.");
        }
      } catch {
        Constants.showDialog("Could not load the questions. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const savePressed = async () => {
    if (!selectedId) {
      Constants.showDialog("Choose a question.");
      return;
    }
    if (!answer.trim()) {
      Constants.showDialog("Enter an answer.");
      return;
    }

    /*
     * REPLACING an answer needs the PIN; setting the first one does not.
     * Without that, a borrowed unlocked phone could swap the recovery answer
     * and come back later for the account — worse than changing the PIN
     * outright, because a changed PIN is noticed and this is not.
     */
    if (alreadySet) {
      const shape = pinShapeError(currentPin);
      if (shape) {
        Constants.showDialog(shape);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/security-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          questionId: selectedId,
          answer,
          ...(alreadySet ? { currentPin } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        Constants.showDialog(data.message || "Your security question has been saved.");
        router.back();
        return;
      }

      Constants.showDialog(data.error || "Could not save that. Please try again.");
    } catch {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Constants.appThemeColor} />
      </View>
    );
  }

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

        <Text style={styles.title}>Security question</Text>
        <Text style={styles.subtitle}>
          {phoneOnly
            ? "Your account has no email address, so this is how we can confirm it is you if you ever forget your PIN. Without it you would need to contact support."
            : "If you forget your PIN, answering this confirms it is you."}
        </Text>

        <Text style={styles.label}>Choose a question</Text>
        {questions.map((q) => {
          const selected = q.id === selectedId;
          return (
            <TouchableOpacity
              key={q.id}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setSelectedId(q.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Ionicons
                name={selected ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={selected ? Constants.appThemeColor : "#b5bbbf"}
              />
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {q.prompt}
              </Text>
            </TouchableOpacity>
          );
        })}

        <Text style={[styles.label, styles.labelSpaced]}>Your answer</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={answer}
            onChangeText={setAnswer}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Something you will not forget"
            placeholderTextColor="#999999"
            maxLength={100}
          />
        </View>
        <Text style={styles.hint}>
          Capitals and extra spaces do not matter. Pick something that will not
          change.
        </Text>

        {alreadySet && (
          <>
            <Text style={[styles.label, styles.labelSpaced]}>
              Confirm with your PIN
            </Text>
            <OtpInput
              value={currentPin}
              onChange={setCurrentPin}
              secure
              autoComplete="off"
              autoFocus={false}
              disabled={saving}
            />
            <Text style={styles.hint}>
              You already have a question set, so changing it needs your current
              PIN.
            </Text>
          </>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={savePressed}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.buttonText}>
              {alreadySet ? "Update question" : "Save question"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  scroll: { padding: 24, paddingTop: 70, paddingBottom: 48 },
  back: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: "bold", color: "#1f1f1f", marginBottom: 10 },
  subtitle: { fontSize: 15, color: "#5c6368", lineHeight: 22, marginBottom: 26 },
  label: { fontSize: 14, fontWeight: "600", color: "#1f1f1f", marginBottom: 10 },
  labelSpaced: { marginTop: 22 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e3e6e8",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 12,
  },
  optionSelected: {
    borderColor: Constants.appThemeColor,
    backgroundColor: "#f3fbfc",
  },
  optionText: { flex: 1, fontSize: 15, color: "#3c4347", lineHeight: 21 },
  optionTextSelected: { color: "#1f1f1f" },
  inputContainer: {
    borderWidth: 1,
    borderColor: "#e3e6e8",
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  input: { paddingVertical: 14, fontSize: 16, color: "#1f1f1f" },
  hint: { fontSize: 13, color: "#7a8287", marginTop: 8, lineHeight: 19 },
  button: {
    backgroundColor: Constants.appThemeColor,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 30,
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});

export default SecurityQuestion;
