import Navbar from "@/components/ui/navbar";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  Alert,
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

const ShareScreen = () => {
  const { sendRefferal, isLoading, error, user } = useAppStore();

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
      const result = await sendRefferal(emails);

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
    <View key={field.id} style={styles.emailFieldContainer}>
      <View style={styles.emailInputContainer}>
        <View style={styles.emailIconContainer}>
          <Ionicons name="mail" size={20} color="#00528A" />
        </View>
        <TextInput
          style={[styles.emailInput, field.error && styles.emailInputError]}
          value={field.email}
          onChangeText={(text) => updateEmailField(field.id, text)}
          placeholder={`Email ${index + 1}`}
          placeholderTextColor="#a0aec0"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {emailFields.length > 1 && (
          <TouchableOpacity
            onPress={() => removeEmailField(field.id)}
            style={styles.removeButton}
          >
            <Ionicons name="close-circle" size={24} color="#e53e3e" />
          </TouchableOpacity>
        )}
      </View>
      {field.error && <Text style={styles.errorText}>{field.error}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Navbar user={user} />

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.mainContainer}>
          {/* Illustration */}
          <View style={styles.illustrationContainer}>
            <LinearGradient
              colors={["#f8f9fa", "#e9ecef"]}
              style={styles.illustrationBackground}
            >
              <Ionicons name="share-social" size={60} color="#00528A" />
            </LinearGradient>

            {/* Decorative elements */}
            <View style={styles.sparkleContainer}>
              <Ionicons
                name="star"
                size={16}
                color="#FFD700"
                style={styles.sparkle1}
              />
              <Ionicons
                name="heart"
                size={12}
                color="#FF69B4"
                style={styles.sparkle2}
              />
              <Ionicons
                name="diamond"
                size={14}
                color="#00CED1"
                style={styles.sparkle3}
              />
            </View>
          </View>

          {/* Title and Description */}
          <View style={styles.textContainer}>
            <Text style={styles.title}>Invite Friends & Earn!</Text>
            <Text style={styles.subtitle}>
              Share Mint Rewards with your friends and earn points for every
              successful referral.
            </Text>
          </View>

          {/* Email Form */}
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>📧 Enter Email Addresses</Text>

            {/* Email Fields */}
            <View style={styles.emailFieldsContainer}>
              {emailFields.map((field, index) =>
                renderEmailField(field, index),
              )}
            </View>

            {/* Add Email Button */}
            <TouchableOpacity
              style={styles.addEmailButton}
              onPress={addEmailField}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={24} color="#00528A" />
              <Text style={styles.addEmailButtonText}>Add Another Email</Text>
            </TouchableOpacity>

            {/* Global Error */}
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color="#e53e3e" />
                <Text style={styles.errorMessage}>{error}</Text>
              </View>
            )}

            {/* Send Button */}
            <TouchableOpacity
              style={[styles.sendButton, isLoading && styles.buttonDisabled]}
              onPress={handleSendReferrals}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={
                  isLoading ? ["#a0aec0", "#00528A"] : ["#00528A", "#00528A"]
                }
                style={styles.sendGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLoading ? (
                  <Text style={styles.sendButtonText}>Sending...</Text>
                ) : (
                  <>
                    <Ionicons name="send" size={20} color="#ffffff" />
                    <Text style={styles.sendButtonText}>
                      Send Invitations (
                      {emailFields.filter((f) => f.email.trim()).length})
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  headerSection: {
    backgroundColor: "#ffffff",
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    zIndex: 10,
  },
  headerGradient: {
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 14,
    opacity: 0.9,
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    marginLeft: 15,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  mainContainer: {
    padding: 20,
  },
  illustrationContainer: {
    alignItems: "center",
    marginBottom: 30,
    position: "relative",
  },
  illustrationBackground: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  sparkleContainer: {
    position: "absolute",
    width: 160,
    height: 160,
    top: -20,
    left: -20,
  },
  sparkle1: {
    position: "absolute",
    top: 20,
    right: 30,
  },
  sparkle2: {
    position: "absolute",
    bottom: 40,
    left: 20,
  },
  sparkle3: {
    position: "absolute",
    top: 60,
    left: 30,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2d3748",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#4a5568",
    textAlign: "center",
    lineHeight: 24,
  },
  formContainer: {
    marginBottom: 30,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2d3748",
    marginBottom: 20,
    textAlign: "center",
  },
  emailFieldsContainer: {
    marginBottom: 15,
  },
  emailFieldContainer: {
    marginBottom: 15,
  },
  emailInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  emailIconContainer: {
    marginRight: 12,
  },
  emailInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#2d3748",
  },
  emailInputError: {
    borderColor: "#e53e3e",
    backgroundColor: "#fef5f5",
  },
  removeButton: {
    marginLeft: 8,
  },
  errorText: {
    color: "#e53e3e",
    fontSize: 14,
    marginTop: 4,
    marginLeft: 44,
  },
  addEmailButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#00528A",
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 20,
    gap: 8,
  },
  addEmailButtonText: {
    color: "#00528A",
    fontSize: 16,
    fontWeight: "500",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef5f5",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#feb2b2",
    marginBottom: 20,
    gap: 8,
  },
  errorMessage: {
    color: "#e53e3e",
    fontSize: 14,
    flex: 1,
  },
  sendButton: {
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sendGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  rewardsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rewardsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d3748",
    marginBottom: 16,
    textAlign: "center",
  },
  rewardsList: {
    gap: 12,
  },
  rewardItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rewardText: {
    fontSize: 14,
    color: "#4a5568",
    flex: 1,
  },
});

export default ShareScreen;
