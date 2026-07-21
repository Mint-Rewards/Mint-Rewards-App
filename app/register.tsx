import { useAppStore } from "@/store/store";
import { configureGoogleSignIn, signInWithGoogle } from "@/utils/googleAuth";
import AppleSignInButton from "@/components/AppleSignInButton";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import Svg, { Path } from "react-native-svg";
import * as SecureStore from "expo-secure-store";
import { Constants, Utils, API_BASE_URL } from "../utils/constants";
import { AppleAuthenticationButtonType } from 'expo-apple-authentication';
import type { AppleAuthenticationCredential } from 'expo-apple-authentication';

const GoogleIcon = ({ size = 20, opacity = 1 }: { size?: number; opacity?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill={`rgba(234,67,53,${opacity})`} d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill={`rgba(66,133,244,${opacity})`} d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill={`rgba(251,188,5,${opacity})`} d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill={`rgba(52,168,83,${opacity})`} d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

const RegisterScreen = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { signUp } = useAppStore();

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    try {
      configureGoogleSignIn();
      const result = await signInWithGoogle();

      if (result.success && result.data) {
        const { idToken } = result.data;

        const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });

        const data = await res.json();

        if (data.Status === "Success") {
          const userData = data.data;
          const user = {
            _id: userData._id,
            token: userData.token || "",
            email: userData.email,
            userName: userData.userName,
            phone: userData.phone || "",
            isAdmin: userData.isAdmin || false,
            avatar: userData.avatar || userData.picture || "",
            address: userData.address || "",
            province: userData.province || "",
            city: userData.city || "",
            town: userData.town || "",
            mintId: userData.mintId,
            latitude: userData.latitude || "",
            longitude: userData.longitude || "",
            deviceToken: userData.deviceToken || "",
            points: userData.points || 0,
            totalCollections: userData.totalCollections || "",
            totalWasteCollected: userData.totalWasteCollected || "",
            referrals: userData.referrals || [],
            firstTimeLogin: userData.firstTimeLogin || false,
            emailVerified: userData.emailVerified || false,
            pickupHistory: userData.pickupHistory || [],
          };

          useAppStore.setState({ user, token: userData.token || null });
          await SecureStore.setItemAsync("userToken", userData.token || "");
          await SecureStore.setItemAsync("userEmail", userData.email);
          await SecureStore.setItemAsync("userName", userData.userName);
          await SecureStore.setItemAsync("userPoints", String(userData.points || 0));

          router.replace("/(tabs)/home");
        } else {
          Constants.showDialog(data.ErrorMessage || "Google sign-up failed.");
        }
      } else if (result.error !== "cancelled") {
        Constants.showDialog(result.error || "Google sign-up failed.");
      }
    } catch {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignUp = async (credential: AppleAuthenticationCredential) => {
    setGoogleLoading(true);
    try {
      // Apple only sends fullName on the very first sign-in; cache it for future logins.
      const cacheKey = `appleFullName_${credential.user}`;
      if (credential.fullName?.givenName || credential.fullName?.familyName) {
        await SecureStore.setItemAsync(cacheKey, JSON.stringify(credential.fullName));
      }
      let fullName = credential.fullName;
      if (!fullName?.givenName && !fullName?.familyName) {
        const cached = await SecureStore.getItemAsync(cacheKey);
        if (cached) fullName = JSON.parse(cached);
      }

      const res = await fetch(`${API_BASE_URL}/api/auth/apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityToken: credential.identityToken,
          fullName,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text}`);
      }

      const data = await res.json();

      if (data.Status === 'Success') {
        const userData = data.data;

        const user = {
          _id: userData._id,
          token: userData.token || '',
          email: userData.email,
          userName: userData.userName,
          phone: userData.phone || '',
          isAdmin: userData.isAdmin || false,
          avatar: userData.avatar || '',
          address: userData.address || '',
          province: userData.province || '',
          city: userData.city || '',
          town: userData.town || '',
          mintId: userData.mintId,
          latitude: userData.latitude || '',
          longitude: userData.longitude || '',
          deviceToken: userData.deviceToken || '',
          points: userData.points || 0,
          totalCollections: userData.totalCollections || '',
          totalWasteCollected: userData.totalWasteCollected || '',
          referrals: userData.referrals || [],
          firstTimeLogin: userData.firstTimeLogin || false,
          emailVerified: userData.emailVerified || false,
          pickupHistory: userData.pickupHistory || [],
        };

        useAppStore.setState({ user, token: userData.token || null });

        await SecureStore.setItemAsync('userToken', userData.token || '');
        await SecureStore.setItemAsync('userEmail', userData.email);
        await SecureStore.setItemAsync('userName', userData.userName);
        await SecureStore.setItemAsync('userPoints', String(userData.points || 0));

        router.replace('/(tabs)/home');
      } else {
        Constants.showDialog(data.ErrorMessage || 'Apple Sign-Up failed.');
      }
    } catch (error: any) {
      console.log('Apple Sign-Up error:', error.message, error.stack);
      Constants.showDialog('An error occurred. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (name.trim() === "") {
      Constants.showDialog("Please enter your name");
    } else if (email.trim() === "") {
      Constants.showDialog("Please enter your email address");
    } else if (!Utils.isEmail(email)) {
      Constants.showDialog("Please enter a valid email address");
    } else if (password.length < 8) {
      Constants.showDialog("Password must be at least 8 characters");
    } else {
      setLoading(true);
      try {
        const result = await signUp(email.trim(), password, name.trim(), "", "", "", "");
        if (result.Status === "Success") {
          router.push({ pathname: "/verify-email", params: { email: email.trim() } });
        } else {
          Constants.showDialog(result.ErrorMessage || "Registration failed");
        }
      } catch {
        Constants.showDialog("An error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Join Mint Rewards!</Text>
          <Text style={styles.welcomeSubtitle}>
            Start recycling and earning rewards{"\n"}today
          </Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Name</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Your name"
                placeholderTextColor="#999999"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="your@email.com"
                placeholderTextColor="#999999"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.passwordTextInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={hidePassword}
                placeholder="Min. 8 characters"
                placeholderTextColor="#999999"
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

          <TouchableOpacity
            style={styles.signUpButton}
            onPress={handleSignUp}
            disabled={loading || googleLoading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.signUpButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[
              styles.googleButton,
              (loading || googleLoading) && styles.googleButtonDisabled,
            ]}
            onPress={handleGoogleSignUp}
            disabled={loading || googleLoading}
            activeOpacity={0.9}
          >
            {googleLoading ? (
              <ActivityIndicator color="#1f1f1f" size="small" />
            ) : (
              <View style={styles.googleButtonContent}>
                <GoogleIcon size={20} opacity={loading ? 0.38 : 1} />
                <Text
                  style={[
                    styles.googleButtonText,
                    loading && styles.googleButtonTextDisabled,
                  ]}
                  numberOfLines={1}
                >
                  Sign up with Google
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={{ marginBottom: 8 }}>
            <AppleSignInButton
              onCredential={handleAppleSignUp}
              onError={(e: unknown) => {
                console.warn('Apple Sign-Up error', e);
                Constants.showDialog('Apple Sign-Up failed. Please try again.');
              }}
              disabled={loading || googleLoading}
              buttonType={AppleAuthenticationButtonType.SIGN_UP}
            />
          </View>
        </ScrollView>

        <View style={styles.bottomSection}>
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace("/login")}>
              <Text style={styles.loginLinkText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    paddingTop: 100,
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
  textInput: {
    flex: 1,
    fontSize: 16,
    color: "#333333",
    height: "100%",
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
  signUpButton: {
    height: 52,
    backgroundColor: Constants.appThemeColor,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  signUpButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E0E0E0",
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: "#999999",
  },
  googleButton: {
    height: 52,
    backgroundColor: "#f2f2f2",
    borderRadius: 20,
    paddingHorizontal: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  googleButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.38)",
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 10,
  },
  googleButtonText: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: "#1f1f1f",
    letterSpacing: 0.25,
    textAlign: "center",
  },
  googleButtonTextDisabled: {
    opacity: 0.38,
  },
  bottomSection: {
    paddingBottom: 30,
    alignItems: "center",
  },
  loginContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  loginText: {
    fontSize: 16,
    color: "#666666",
  },
  loginLinkText: {
    fontSize: 16,
    color: Constants.appThemeColor,
    fontWeight: "600",
  },
});

export default RegisterScreen;
