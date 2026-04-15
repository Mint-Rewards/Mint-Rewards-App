import { useAppStore } from "@/store/store";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Constants } from "../utils/constants";

const OtpScreen = () => {
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);

  const { email } = useLocalSearchParams();

  const { setPassword } = useAppStore();

  const changePasswordPressed = async () => {
    if (!password1 || !password2) {
      Constants.showDialog("Please enter both passwords");
      return;
    }

    if (password1 !== password2) {
      Constants.showDialog("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const password = password1;
      console.log(email);

      const result = await setPassword(email as string, password);
      if (result.Status !== "Success") {
        Constants.showDialog(
          result.ErrorMessage || "Failed to change password",
        );
        return;
      }
      Constants.showDialog("Password changed successfully!");
      router.push("/login"); // Navigate to appropriate screen
    } catch {
      Constants.showDialog("Failed to change password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Green Header Section */}
      <View style={styles.headerSection}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Enter New Password</Text>
          <Text style={styles.welcomeSubtitle}>
            Please enter the new password you want to set.
          </Text>
        </View>
      </View>

      {/* White Content Section */}
      <View style={styles.contentSection}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>New Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={password1}
                onChangeText={setPassword1}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Enter Your New Password"
                placeholderTextColor="#999999"
                secureTextEntry
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={password2}
                onChangeText={setPassword2}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Enter Your New Password"
                placeholderTextColor="#999999"
                secureTextEntry
              />
            </View>
          </View>

          {/* Verify Button */}
          <TouchableOpacity
            style={[styles.verifyButton]}
            onPress={changePasswordPressed}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.verifyButtonText}>Change Password</Text>
            )}
          </TouchableOpacity>

          {/* Back to Login */}
          <TouchableOpacity
            style={styles.backToLoginContainer}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.backToLoginText}>← Back to Login</Text>
          </TouchableOpacity>
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
    marginBottom: 30,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 15,
    textAlign: "center",
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  otpInputContainer: {
    width: 60,
    height: 60,
  },
  otpInput: {
    width: "100%",
    height: "100%",
    borderWidth: 2,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    fontSize: 24,
    fontWeight: "600",
    color: "#333333",
    backgroundColor: "#FAFAFA",
  },
  otpInputFilled: {
    borderColor: Constants.appThemeColor,
    backgroundColor: "#ffffff",
  },
  resendSection: {
    alignItems: "center",
    marginBottom: 30,
  },
  resendText: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 10,
  },
  resendButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
  },
  resendButtonText: {
    fontSize: 16,
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
  backToLoginContainer: {
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 30,
    padding: 10,
  },
  backToLoginText: {
    color: Constants.appThemeColor,
    fontSize: 14,
    fontWeight: "500",
  },
  inputContainer: {
    height: 50,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 15,
    backgroundColor: "#FAFAFA",
    flexDirection: "row",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: "#333333",
    height: "100%",
  },
});

export default OtpScreen;
