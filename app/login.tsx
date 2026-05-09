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
import { useGoogleAuth } from "@/utils/googleAuth";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { Constants, Utils, API_BASE_URL } from "../utils/constants";

const LoginScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { signIn } = useAppStore();
  const { request, response, promptAsync } = useGoogleAuth();

  // Handle Google Sign-In response
  useEffect(() => {
    if (response?.type === "success") {
      const { code } = response.params;
      handleGoogleBackendAuth(code);
    } else if (response?.type === "error") {
      Constants.showDialog("Google Sign-In failed. Please try again.");
      setGoogleLoading(false);
    } else if (response?.type === "cancel") {
      setGoogleLoading(false);
    }
  }, [response]);

  const handleGoogleBackendAuth = async (code: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/auth/google`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }
      );
      const data = await res.json();

      if (data.Status === "Success") {
        router.replace("/(tabs)/home");
      } else {
        Constants.showDialog(data.ErrorMessage || "Google Sign-In failed.");
      }
    } catch (error) {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    await promptAsync();
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
      <View style={styles.headerSection}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome Back!</Text>
          <Text style={styles.welcomeSubtitle}>
            Log in to continue your journey towards{"\n"}a greener planet
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
          {/* Email Input */}
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
                placeholder="Enter Your Email"
                placeholderTextColor="#999999"
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
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
            style={styles.forgotPasswordContainer}
            onPress={() => router.push("/forgot-password")}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={styles.loginButton}
            onPress={loginPressed}
            disabled={loading || googleLoading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign-In Button */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            disabled={!request || loading || googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color="#333333" size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#DB4437" />
                <Text style={styles.googleButtonText}>
                  Sign in with Google
                </Text>
              </>
            )}
          </TouchableOpacity>
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
  forgotPasswordContainer: {
    alignSelf: "flex-end",
    marginBottom: 30,
    marginTop: 10,
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
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 26,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    marginBottom: 10,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333333",
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