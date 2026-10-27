/**
 * Choosing a security question and answering it.
 *
 * Shared by two callers that need the same two inputs for opposite reasons:
 * the profile screen, where an existing account is adding or replacing its
 * recovery answer, and signing up, where the question is collected BEFORE the
 * account exists so no account is ever created without a way back into it.
 *
 * Presentational on purpose. It holds no fetch, no token and no submit — the
 * two callers post to different endpoints, with and without a session, and
 * folding that in here would mean one component knowing about both.
 *
 * THE LIST IS NOT DUPLICATED. The ids are load-bearing: they are stored
 * against the account and matched on recovery, so a second copy in the client
 * would disagree with the server the first time either changed. Both callers
 * fetch it from GET /api/users/security-question, which serves the prompts to
 * anyone and the current selection only to a caller that proved who it is.
 */
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Constants } from "../utils/constants";

export interface SecurityQuestion {
  id: string;
  prompt: string;
}

interface Props {
  questions: SecurityQuestion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  answer: string;
  onChangeAnswer: (value: string) => void;
  /** Disabled while a submit is in flight, so the choice cannot change under it. */
  disabled?: boolean;
  /** Overrides the default copy where a caller has something better to say. */
  chooseLabel?: string;
}

export function SecurityQuestionFields({
  questions,
  selectedId,
  onSelect,
  answer,
  onChangeAnswer,
  disabled = false,
  chooseLabel = "Choose a question",
}: Props) {
  return (
    <View>
      <Text style={styles.label}>{chooseLabel}</Text>

      {questions.map((q) => {
        const selected = q.id === selectedId;
        return (
          <TouchableOpacity
            key={q.id}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onSelect(q.id)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={selected ? Constants.appThemeColor : "#b5bbbf"}
            />
            <Text
              style={[styles.optionText, selected && styles.optionTextSelected]}
            >
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
          onChangeText={onChangeAnswer}
          editable={!disabled}
          /*
           * No autocapitalise and no autocorrect. The answer is compared after
           * normalising case and spacing, but a keyboard that "helpfully"
           * rewrites a pet's name into a dictionary word changes the letters
           * themselves — and the person would have no way of knowing what they
           * actually saved.
           */
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
    </View>
  );
}

const styles = StyleSheet.create({
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
});

export default SecurityQuestionFields;
