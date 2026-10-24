/**
 * Changing the PIN while signed in — the easy half of "I forgot my PIN", and
 * the half most people actually need.
 *
 * Sessions last thirty days, so somebody who has forgotten their PIN is
 * usually still signed in and never reaches the recovery flow at all. This
 * screen is what they want; forgot-pin is the fallback.
 *
 * It also SETS a first PIN, for an account that has none — an email or Google
 * signup that has since added a phone number. The server asks for the current
 * PIN only when there is one to ask about, and this screen mirrors that rather
 * than deciding for itself.
 */
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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
import * as SecureStore from "expo-secure-store";
import { Constants, API_BASE_URL } from "../utils/constants";
import { PIN_LENGTH, pinShapeError } from "../utils/phoneNumber";

const ChangePin = () => {
  /*
   * Whether a PIN already exists is decided by the PROFILE, not this screen —
   * it arrives as a param from the menu row that knew. Guessing here would
   * mean either asking for a current PIN that does not exist or silently
   * skipping a check that does.
   */
  const params = useLocalSearchParams<{ hasPin?: string }>();
  const settingFirst = params.hasPin !== "1";

  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [hidePin, setHidePin] = useState(true);
  const [loading, setLoading] = useState(false);

  const savePressed = async () => {
    if (!settingFirst) {
      const currentShape = pinShapeError(currentPin);
      if (currentShape) {
        Constants.showDialog("Enter your current PIN.");
        return;
      }
    }

    /*
     * Shape only. The server refuses sequences, repeats, dates and a denylist
     * and returns a message worth showing — duplicating that list here would
     * mean two copies disagreeing the first time either changed.
     */
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
      const token = await SecureStore.getItemAsync("userToken");
      const res = await fetch(`${API_BASE_URL}/api/users/change-pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({
          ...(settingFirst ? {} : { currentPin }),
          newPin: pin,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        Constants.showDialog(data.message || "Your PIN has been updated.");
        router.back();
        return;
      }

      /*
       * A lockout is not a wrong PIN and must not read as one — the server
       * says how long is left, and somebody who does not know that will keep
       * trying and keep failing.
       */
      if (data.code === "PIN_LOCKED") {
        Constants.showDialog(data.error);
        setCurrentPin("");
        return;
      }

      Constants.showDialog(data.error || "Could not update your PIN.");
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="#1f1f1f" />
        </TouchableOpacity>

        <Text style={styles.title}>
          {settingFirst ? "Set a PIN" : "Change your PIN"}
        </Text>
        <Text style={styles.subtitle}>
          {settingFirst
            ? `A ${PIN_LENGTH}-digit PIN lets you sign in with your mobile number.`
            : `Choose a new ${PIN_LENGTH}-digit PIN. You will use it to sign in.`}
        </Text>

        {!settingFirst && (
          <>
            <Text style={styles.label}>Current PIN</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={currentPin}
                onChangeText={(t) => setCurrentPin(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={PIN_LENGTH}
                placeholder={`${PIN_LENGTH} digits`}
                placeholderTextColor="#999999"
              />
            </View>
          </>
        )}

        <Text style={[styles.label, !settingFirst && styles.labelSpaced]}>
          {settingFirst ? "PIN" : "New PIN"}
        </Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            secureTextEntry={hidePin}
            maxLength={PIN_LENGTH}
            placeholder={`${PIN_LENGTH} digits`}
            placeholderTextColor="#999999"
          />
          <TouchableOpacity
            style={styles.eye}
            onPress={() => setHidePin(!hidePin)}
            accessibilityLabel={hidePin ? "Show PIN" : "Hide PIN"}
          >
            <Ionicons
              name={hidePin ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#999999"
            />
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>Confirm PIN</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={confirmPin}
            onChangeText={(t) => setConfirmPin(t.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            secureTextEntry={hidePin}
            maxLength={PIN_LENGTH}
            placeholder="Type it again"
            placeholderTextColor="#999999"
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={savePressed} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.buttonText}>
              {settingFirst ? "Set PIN" : "Update PIN"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  scroll: { padding: 24, paddingTop: 70, paddingBottom: 48 },
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
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: "#1f1f1f" },
  eye: { padding: 6 },
  button: {
    backgroundColor: Constants.appThemeColor,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 30,
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});

export default ChangePin;
