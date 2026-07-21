// import { useAppStore } from "@/store/store";
// import { Ionicons } from "@expo/vector-icons";
// import { router } from "expo-router";
// import React, { useState } from "react";
// import {
//   ActivityIndicator,
//   ScrollView,
//   StyleSheet,
//   Text,
//   TextInput,
//   TouchableOpacity,
//   View,
// } from "react-native";
// import { Constants, Utils } from "../utils/constants";


// const LoginScreen = () => {
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [hidePassword, setHidePassword] = useState(true);
//   const [loading, setLoading] = useState(false);

//   const { signIn } = useAppStore();

//   const loginPressed = async () => {
//     if (email.trim() === "") {
//       Constants.showDialog("Please enter your email address");
//     } else if (!Utils.isEmail(email)) {
//       Constants.showDialog("Please enter valid email address");
//     } else if (password === "") {
//       Constants.showDialog("Please enter password");
//     } else {
//       setLoading(true);
//       try {
//         const result = await signIn(email, password);
//         if (result.Status === "Success") {
//           // Navigate to home screen
//           router.replace("/(tabs)/home");
//         } else {
//           // console.log("Login failed:", result.ErrorMessage);
//           Constants.showDialog(result.ErrorMessage || "Login failed");
//         }
//       } catch (error) {
//         Constants.showDialog("An error occurred. Please try again.");
//       } finally {
//         setLoading(false);
//       }
//     }
//   };

//   return (
//     <View style={styles.container}>
//       {/* Green Header Section */}
//       <View style={styles.headerSection}>
//         {/* Welcome Section */}
//         <View style={styles.welcomeSection}>
//           <Text style={styles.welcomeTitle}>Welcome Back!</Text>
//           <Text style={styles.welcomeSubtitle}>
//             Log in to continue your journey towards{"\n"}a greener planet
//           </Text>
//         </View>
//       </View>

//       {/* White Content Section */}
//       <View style={styles.contentSection}>
//         <ScrollView
//           style={{ flex: 1 }}
//           showsVerticalScrollIndicator={false}
//           keyboardShouldPersistTaps="handled"
//         >
//           {/* Email Input */}
//           <View style={styles.inputGroup}>
//             <Text style={styles.inputLabel}>Email</Text>
//             <View style={styles.inputContainer}>
//               <TextInput
//                 style={styles.textInput}
//                 value={email}
//                 onChangeText={setEmail}
//                 keyboardType="email-address"
//                 autoCapitalize="none"
//                 autoCorrect={false}
//                 placeholder="Enter Your Email"
//                 placeholderTextColor="#999999"
//               />
//             </View>
//           </View>

//           {/* Password Input */}
//           <View style={styles.inputGroup}>
//             <Text style={styles.inputLabel}>Password</Text>
//             <View style={styles.inputContainer}>
//               <TextInput
//                 style={styles.passwordTextInput}
//                 value={password}
//                 onChangeText={setPassword}
//                 secureTextEntry={hidePassword}
//                 placeholder="Password"
//                 placeholderTextColor="#999999"
//               />
//               <TouchableOpacity
//                 style={styles.eyeIconButton}
//                 onPress={() => setHidePassword(!hidePassword)}
//               >
//                 <Ionicons
//                   name={hidePassword ? "eye-off-outline" : "eye-outline"}
//                   size={20}
//                   color="#999999"
//                 />
//               </TouchableOpacity>
//             </View>
//           </View>

//           {/* Forgot Password */}
//           <TouchableOpacity
//             style={styles.forgotPasswordContainer}
//             onPress={() => router.push("/forgot-password")}
//           >
//             <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
//           </TouchableOpacity>

//           {/* Login Button */}
//           <TouchableOpacity
//             style={styles.loginButton}
//             onPress={loginPressed}
//             disabled={loading}
//           >
//             {loading ? (
//               <ActivityIndicator color="#ffffff" size="small" />
//             ) : (
//               <Text style={styles.loginButtonText}>Login</Text>
//             )}
//           </TouchableOpacity>
//         </ScrollView>

//         {/* Bottom Register Link */}
//         <View style={styles.bottomSection}>
//           <View style={styles.registerContainer}>
//             <Text style={styles.registerText}>
//               Don&apos;t Have An Account?{" "}
//             </Text>
//             <TouchableOpacity onPress={() => router.push("/register")}>
//               <Text style={styles.registerLinkText}>Sign up</Text>
//             </TouchableOpacity>
//           </View>
//         </View>
//       </View>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: "#ffffff",
//   },
//   headerSection: {
//     backgroundColor: Constants.appThemeColor,
//     paddingTop: 100, // For status bar
//     paddingBottom: 30,
//     paddingHorizontal: 20,
//     borderBottomLeftRadius: 25,
//     borderBottomRightRadius: 25,
//   },
//   statusBarArea: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     marginBottom: 20,
//   },
//   statusTime: {
//     color: "#ffffff",
//     fontSize: 16,
//     fontWeight: "600",
//   },
//   statusRight: {
//     flexDirection: "row",
//   },
//   statusIcons: {
//     color: "#ffffff",
//     fontSize: 16,
//   },
//   welcomeSection: {
//     marginTop: 10,
//   },
//   welcomeTitle: {
//     color: "#ffffff",
//     fontSize: 28,
//     fontWeight: "bold",
//     marginBottom: 8,
//   },
//   welcomeSubtitle: {
//     color: "#ffffff",
//     fontSize: 16,
//     lineHeight: 22,
//     opacity: 0.9,
//   },
//   contentSection: {
//     flex: 1,
//     backgroundColor: "#ffffff",
//     paddingHorizontal: 20,
//     paddingTop: 30,
//   },
//   inputGroup: {
//     marginBottom: 20,
//   },
//   inputLabel: {
//     fontSize: 16,
//     fontWeight: "500",
//     color: "#333333",
//     marginBottom: 8,
//   },
//   inputContainer: {
//     height: 50,
//     borderWidth: 1,
//     borderColor: "#E0E0E0",
//     borderRadius: 12,
//     paddingHorizontal: 15,
//     backgroundColor: "#FAFAFA",
//     flexDirection: "row",
//     alignItems: "center",
//   },
//   textInput: {
//     flex: 1,
//     fontSize: 16,
//     color: "#333333",
//     height: "100%",
//   },
//   passwordTextInput: {
//     flex: 1,
//     fontSize: 16,
//     color: "#333333",
//     height: "100%",
//   },
//   eyeIconButton: {
//     padding: 5,
//   },
//   forgotPasswordContainer: {
//     alignSelf: "flex-end",
//     marginBottom: 30,
//     marginTop: 10,
//   },
//   forgotPasswordText: {
//     color: Constants.appThemeColor,
//     fontSize: 14,
//     fontWeight: "500",
//   },
//   loginButton: {
//     height: 52,
//     backgroundColor: Constants.appThemeColor,
//     borderRadius: 26,
//     justifyContent: "center",
//     alignItems: "center",
//     marginTop: 10,
//   },
//   loginButtonText: {
//     color: "#ffffff",
//     fontSize: 18,
//     fontWeight: "600",
//   },
//   bottomSection: {
//     paddingBottom: 30,
//     alignItems: "center",
//   },
//   registerContainer: {
//     flexDirection: "row",
//     alignItems: "center",
//     marginBottom: 20,
//   },
//   registerText: {
//     fontSize: 16,
//     color: "#666666",
//   },
//   registerLinkText: {
//     fontSize: 16,
//     color: Constants.appThemeColor,
//     fontWeight: "600",
//   },
// });

// export default LoginScreen;

import { useAppStore } from "@/store/store";
import AppleSignInButton from "@/components/AppleSignInButton";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Constants, Utils, API_BASE_URL } from "../utils/constants";
import * as SecureStore from 'expo-secure-store';
import type { AppleAuthenticationCredential } from 'expo-apple-authentication';

const LoginScreen = () => {
  const { height } = useWindowDimensions();
  const isSmallScreen = height < 700;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const { signIn } = useAppStore();

  const handleAppleSignIn = async (credential: AppleAuthenticationCredential) => {
    setAppleLoading(true);
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
        Constants.showDialog(data.ErrorMessage || 'Apple Sign-In failed.');
      }
    } catch (error: any) {
      console.log('Apple Sign-In error:', error.message, error.stack);
      Constants.showDialog('An error occurred. Please try again.');
    } finally {
      setAppleLoading(false);
    }
  };

  const loginPressed = async () => {
    if (email.trim() === "") {
      Constants.showDialog("Please enter your email address");
    } else if (!Utils.isEmail(email)) {
      Constants.showDialog("Please enter valid email address");
    } else if (password === "") {
      Constants.showDialog("Please enter password");
    } else {
      setLoading(true);
      try {
        const result = await signIn(email, password);
        if (result.Status === "Success") {
          router.replace("/(tabs)/home");
        } else {
          Constants.showDialog(result.ErrorMessage || "Login failed");
        }
      } catch (error) {
        Constants.showDialog("An error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Green Header Section */}
      <View style={[styles.headerSection, isSmallScreen && styles.headerSectionSmall]}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome Back!</Text>
          <Text style={styles.welcomeSubtitle}>
            Log in to continue your journey towards{"\n"}a greener planet
          </Text>
        </View>
      </View>

      {/* White Content Section */}
      <View style={[styles.contentSection, isSmallScreen && styles.contentSectionSmall]}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Email Input */}
          <View style={[styles.inputGroup, isSmallScreen && styles.inputGroupSmall]}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Enter Your Email"
                placeholderTextColor="#999999"
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={[styles.inputGroup, isSmallScreen && styles.inputGroupSmall]}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.passwordTextInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={hidePassword}
                placeholder="Password"
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

          {/* Forgot Password */}
          <TouchableOpacity
            style={[styles.forgotPasswordContainer, isSmallScreen && styles.forgotPasswordContainerSmall]}
            onPress={() => router.push("/forgot-password")}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={styles.loginButton}
            onPress={loginPressed}
            disabled={loading || appleLoading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          {/* Apple Sign-In is iOS-only, so the divider is too */}
          {Platform.OS === "ios" && (
            <>
              {/* Divider */}
              <View style={[styles.dividerContainer, isSmallScreen && styles.dividerContainerSmall]}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Apple Sign-In Button */}
              <View style={styles.appleButtonContainer}>
                <AppleSignInButton
                  onCredential={handleAppleSignIn}
                  onError={(e) => {
                    console.warn('Apple Sign-In error', e);
                    Constants.showDialog('Apple Sign-In failed. Please try again.');
                  }}
                  disabled={loading || appleLoading}
                />
              </View>
            </>
          )}
        </ScrollView>

        {/* Bottom Register Link */}
        <View style={styles.bottomSection}>
          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>
              Don&apos;t Have An Account?{" "}
            </Text>
            <TouchableOpacity onPress={() => router.push("/register")}>
              <Text style={styles.registerLinkText}>Sign up</Text>
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
  headerSectionSmall: {
    paddingTop: 56,
    paddingBottom: 16,
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
  contentSectionSmall: {
    paddingTop: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputGroupSmall: {
    marginBottom: 12,
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
  forgotPasswordContainer: {
    alignSelf: "flex-end",
    marginBottom: 30,
    marginTop: 10,
  },
  forgotPasswordContainerSmall: {
    marginBottom: 16,
    marginTop: 6,
  },
  forgotPasswordText: {
    color: Constants.appThemeColor,
    fontSize: 14,
    fontWeight: "500",
  },
  loginButton: {
    height: 52,
    backgroundColor: Constants.appThemeColor,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerContainerSmall: {
    marginVertical: 12,
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
  appleButtonContainer: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    marginBottom: 10,
  },
  bottomSection: {
    paddingBottom: 30,
    alignItems: "center",
  },
  registerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  registerText: {
    fontSize: 16,
    color: "#666666",
  },
  registerLinkText: {
    fontSize: 16,
    color: Constants.appThemeColor,
    fontWeight: "600",
  },
});

export default LoginScreen;