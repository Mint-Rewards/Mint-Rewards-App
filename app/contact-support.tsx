/**
 * The last way back in: PIN forgotten AND security answer forgotten.
 *
 * Unauthenticated, necessarily — anybody who could sign in would not be here.
 * It files a ticket a human works, and the account stays locked until they do,
 * so the copy is careful not to imply anything faster than that.
 *
 * ONE OPEN REQUEST PER ACCOUNT. The server enforces it with a unique index and
 * answers 409; this screen says so plainly rather than letting somebody submit
 * repeatedly into silence.
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
import { Constants, API_BASE_URL } from "../utils/constants";
import { normalizePhone } from "../utils/phoneNumber";

const MAX_MESSAGE = 1000;

const ContactSupport = () => {
  const params = useLocalSearchParams<{ phone?: string }>();

  const [phone, setPhone] = useState(
    typeof params.phone === "string" ? params.phone : "",
  );
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submitPressed = async () => {
    const parsed = normalizePhone(phone);
    if (!parsed.ok) {
      Constants.showDialog(parsed.message);
      return;
    }
    if (!name.trim() || !address.trim()) {
      Constants.showDialog("Enter the name and address on your account.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/support-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: parsed.e164,
          name: name.trim(),
          address: address.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setSent(true);
        return;
      }

      /*
       * Already open. Saying so is the point — somebody who has asked once and
       * heard nothing will otherwise submit again and again, and every attempt
       * is refused by the same index.
       */
      if (data.code === "TICKET_ALREADY_OPEN") {
        Constants.showDialog(data.error);
        return;
      }

      Constants.showDialog(data.error || "We could not send that request.");
    } catch {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.sentContainer}>
        <Ionicons name="checkmark-circle" size={64} color={Constants.appThemeColor} />
        <Text style={styles.sentTitle}>Request sent</Text>
        <Text style={styles.sentBody}>
          We will call you on this number to confirm it is you, then help you
          set a new PIN. Please keep your phone to hand.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace("/login")}>
          <Text style={styles.buttonText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

        <Text style={styles.title}>Contact support</Text>
        <Text style={styles.subtitle}>
          Tell us who you are and we will call you to confirm it, then help you
          set a new PIN. This is handled by a person, so it is not instant.
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

        <Text style={[styles.label, styles.labelSpaced]}>Name on the account</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Your name"
            placeholderTextColor="#999999"
            maxLength={200}
          />
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>Pickup address</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="The address we collect from"
            placeholderTextColor="#999999"
            maxLength={200}
          />
        </View>

        <Text style={[styles.label, styles.labelSpaced]}>
          Anything else (optional)
        </Text>
        <View style={[styles.inputContainer, styles.multilineContainer]}>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={message}
            onChangeText={setMessage}
            placeholder="Anything that might help us find your account"
            placeholderTextColor="#999999"
            multiline
            maxLength={MAX_MESSAGE}
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={submitPressed} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Send request</Text>
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
    borderWidth: 1,
    borderColor: "#e3e6e8",
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  multilineContainer: { paddingVertical: 4 },
  input: { paddingVertical: 14, fontSize: 16, color: "#1f1f1f" },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  button: {
    backgroundColor: Constants.appThemeColor,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 30,
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  sentContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  sentTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f1f1f",
    marginTop: 20,
    marginBottom: 12,
  },
  sentBody: {
    fontSize: 15,
    color: "#5c6368",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 32,
  },
});

export default ContactSupport;
