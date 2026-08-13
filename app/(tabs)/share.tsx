import Navbar from "@/components/ui/navbar";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppStore } from "../../store/store";

interface EmailField {
  id: string;
  email: string;
  error?: string;
}

// 4-base spacing scale. Tight values group, generous values separate; nothing
// on this screen should reach for a number that isn't here.
const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Row padding + ordinal chip + gap. Error text hangs off the input's left edge,
// not the row's, so it reads as belonging to the field it describes.
const FIELD_TEXT_INSET = space.md + 28 + space.md;

const ShareScreen = () => {
  const { sendReferral, isLoading, error, user } = useAppStore();
  // 0 on Android, where the tab bar sits in the layout flow; on iOS the bar is
  // absolutely positioned, so the scroll has to clear it by its full height.
  const tabBarOverflow = useBottomTabOverflow();

  const [emailFields, setEmailFields] = useState<EmailField[]>([
    { id: "1", email: "" },
  ]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const addEmailField = () => {
    const newId = Date.now().toString();
    setEmailFields((prev) => [...prev, { id: newId, email: "" }]);
  };

  const removeEmailField = (id: string) => {
    if (emailFields.length > 1) {
      setEmailFields((prev) => prev.filter((field) => field.id !== id));
    }
  };

  const updateEmailField = (id: string, email: string) => {
    setEmailFields((prev) =>
      prev.map((field) =>
        field.id === id ? { ...field, email, error: undefined } : field,
      ),
    );
  };

  const validateAllEmails = (): boolean => {
    let hasErrors = false;

    setEmailFields((prev) =>
      prev.map((field) => {
        let error;
        if (!field.email.trim()) {
          error = "Email is required";
          hasErrors = true;
        } else if (!validateEmail(field.email)) {
          error = "Please enter a valid email";
          hasErrors = true;
        }
        return { ...field, error };
      }),
    );

    // Check for duplicate emails
    const emails = emailFields.map((field) => field.email.trim().toLowerCase());
    const duplicates = emails.filter(
      (email, index) => email && emails.indexOf(email) !== index,
    );

    if (duplicates.length > 0) {
      setEmailFields((prev) =>
        prev.map((field) =>
          duplicates.includes(field.email.trim().toLowerCase())
            ? { ...field, error: "Duplicate email found" }
            : field,
        ),
      );
      hasErrors = true;
    }

    return !hasErrors;
  };

  const handleSendReferrals = async () => {
    if (!validateAllEmails()) {
      return;
    }

    const emails = emailFields
      .map((field) => field.email.trim())
      .filter((email) => email);

    if (emails.length === 0) {
      Alert.alert("Error", "Please add at least one email address");
      return;
    }

    try {
      const result = await sendReferral(emails);

      if (result.Status === "Success") {
        Alert.alert(
          "Success",
          `Referral invitations sent to ${emails.length} email${
            emails.length > 1 ? "s" : ""
          }!`,
          [
            {
              text: "OK",
              onPress: () => {
                // Reset form
                setEmailFields([{ id: "1", email: "" }]);
              },
            },
          ],
        );
      } else {
        Alert.alert("Error", result.ErrorMessage || "Failed to send referrals");
      }
    } catch (err) {
      console.error("Referral error:", err);
      Alert.alert("Error", "An unexpected error occurred");
    }
  };

  const renderEmailField = (field: EmailField, index: number) => (
    <View key={field.id}>
      <View style={[styles.emailRow, field.error && styles.emailRowError]}>
        <View style={styles.ordinal}>
          <Text style={styles.ordinalText}>{index + 1}</Text>
        </View>
        <TextInput
          style={styles.emailInput}
          value={field.email}
          onChangeText={(text) => updateEmailField(field.id, text)}
          placeholder="name@example.com"
          placeholderTextColor="#718096"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={`Email address ${index + 1}`}
        />
        {emailFields.length > 1 && (
          <TouchableOpacity
            onPress={() => removeEmailField(field.id)}
            style={styles.removeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Remove email address ${index + 1}`}
          >
            <Ionicons name="close" size={18} color="#4a5568" />
          </TouchableOpacity>
        )}
      </View>
      {field.error && <Text style={styles.errorText}>{field.error}</Text>}
    </View>
  );

  const readyCount = emailFields.filter((f) => f.email.trim()).length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />

      <Navbar user={user} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* The one peak on this screen. Flat navy panel, display type at full
            strength — home.tsx's card radius and shadow, none of its gradients. */}
        <View style={styles.introPanel}>
          <Text style={styles.title} allowFontScaling>
            Invite friends
          </Text>
          <Text style={styles.subtitle}>
            Send an invitation and they can start collecting points for
            recycling too.
          </Text>
        </View>

        <View style={styles.fieldList}>
          {emailFields.map((field, index) => renderEmailField(field, index))}
        </View>

        <TouchableOpacity
          style={styles.addEmailButton}
          onPress={addEmailField}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add another email address"
        >
          <Ionicons name="add" size={20} color="#00528A" />
          <Text style={styles.addEmailButtonText}>Add another email</Text>
        </TouchableOpacity>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#e53e3e" />
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.homeLink}
          onPress={() => router.push("/(tabs)/home")}
          activeOpacity={0.6}
          accessibilityRole="button"
        >
          <Text style={styles.homeLinkText}>Back to home</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* The one primary action stays reachable however long the list grows. */}
      <View style={[styles.footer, { paddingBottom: tabBarOverflow + space.lg }]}>
        <TouchableOpacity
          style={[styles.sendButton, isLoading && styles.buttonDisabled]}
          onPress={handleSendReferrals}
          disabled={isLoading}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          {isLoading ? (
            <Text style={styles.sendButtonText}>Sending…</Text>
          ) : (
            <>
              <Ionicons name="send" size={18} color="#ffffff" />
              <Text style={styles.sendButtonText}>
                {readyCount > 1
                  ? `Send ${readyCount} invitations`
                  : "Send invitation"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
  },

  // Intro leads, then falls away hard so the field list reads as the work.
  // A tint, not a fill. The panel still anchors the screen, but it sits under
  // the content rather than shouting over it — no shadow, no saturated slab.
  introPanel: {
    backgroundColor: "#F0F8FF",
    borderRadius: 16,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    marginBottom: space.xxl,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    // Matches the system's own display tracking rather than exaggerating it.
    letterSpacing: -0.4,
    color: "#00528A",
    marginBottom: space.sm,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    // The accent at reduced opacity — a darker shade of the surface's own hue,
    // never gray on a colored ground.
    color: "rgba(0, 82, 138, 0.75)",
    maxWidth: 280,
  },

  fieldList: {
    gap: space.md,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: space.md,
    minHeight: 52,
  },
  emailRowError: {
    borderColor: "#e53e3e",
    backgroundColor: "#fef5f5",
  },
  ordinal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  ordinalText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#00528A",
  },
  emailInput: {
    flex: 1,
    paddingVertical: space.md,
    fontSize: 16,
    color: "#2d3748",
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#c53030",
    fontSize: 13,
    marginTop: space.xs,
    paddingLeft: FIELD_TEXT_INSET,
  },

  // Sits close to the list it extends, far from what follows.
  addEmailButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: space.md,
    marginTop: space.md,
    minHeight: 48,
  },
  addEmailButtonText: {
    color: "#00528A",
    fontSize: 15,
    fontWeight: "600",
  },

  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: "#fef5f5",
    borderWidth: 1,
    borderColor: "#feb2b2",
    borderRadius: 12,
    padding: space.md,
    marginTop: space.xl,
  },
  errorMessage: {
    color: "#c53030",
    fontSize: 14,
    flex: 1,
  },

  homeLink: {
    alignSelf: "center",
    marginTop: space.xxl,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  homeLinkText: {
    color: "#4a5568",
    fontSize: 15,
    fontWeight: "500",
  },

  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    backgroundColor: "#ffffff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    backgroundColor: "#00528A",
    borderRadius: 16,
    paddingVertical: space.lg,
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default ShareScreen;
