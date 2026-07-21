import { useAppStore } from "@/store/store";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Constants, Utils } from "../utils/constants";

const ChangePasswordScreen = () => {
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);

  const params = useLocalSearchParams<{ resetToken: string }>();
  const [resetToken, setResetToken] = useState(params.resetToken ?? "");

  const { setPassword } = useAppStore();

  useEffect(() => {
    return () => {
      // resetToken is single-use and must never persist beyond this screen
      setResetToken("");
    };
  }, []);

  const changePasswordPressed = async () => {
    if (!password1 || !password2) {
      Constants.showDialog("Please enter both passwords");
      return;
    }

    if (!Utils.validatePassword(password1)) {
      Constants.showDialog("Password must be at least 8 characters");
      return;
    }

    if (password1 !== password2) {
      Constants.showDialog("Passwords do not match");
      return;
    }

    if (!resetToken) {
      Constants.showDialog("Your session expired. Please request a new code.");
      router.replace("/forgot-password");
      return;
    }

    setLoading(true);
    try {
      const result = await setPassword(resetToken, password1);
      if (result.Status !== "Success") {
        if (result.code === "INVALID_SESSION") {
          setResetToken("");
          Constants.showDialog("Your session expired. Please request a new code.");
          router.replace("/forgot-password");
          return;
        }
        Constants.showDialog(result.ErrorMessage || "Failed to change password");
        return;
      }
      setResetToken("");
      Constants.showDialog("Password successfully updated.");
      router.replace("/login");
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
          <Text style={styles.welcomeTitle}>Set New Password</Text>
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
                style={styles.passwordTextInput}
                value={password1}
                onChangeText={setPassword1}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Min. 8 characters"
                placeholderTextColor="#999999"
                secureTextEntry={hidePassword}
                accessibilityLabel="New password"
              />
              <TouchableOpacity
                style={styles.eyeIconButton}
                onPress={() => setHidePassword(!hidePassword)}
              >
                <Ionicons
                  name={hidePassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#999999"
                />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.passwordTextInput}
                value={password2}
                onChangeText={setPassword2}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Re-enter your new password"
                placeholderTextColor="#999999"
                secureTextEntry={hidePassword}
                accessibilityLabel="Confirm new password"
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.verifyButton}
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
            onPress={() => router.replace("/login")}
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
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 8,
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
  passwordTextInput: {
    flex: 1,
    fontSize: 16,
    color: "#333333",
    height: "100%",
  },
  eyeIconButton: {
    padding: 5,
  },
  verifyButton: {
    height: 52,
    backgroundColor: Constants.appThemeColor,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
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
});

export default ChangePasswordScreen;
