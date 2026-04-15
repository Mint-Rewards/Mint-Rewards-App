import { LocationPicker } from "@/components/ui/LocationPicker";
import { useAppStore } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Formik } from "formik";
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
import * as Yup from "yup";
import { Constants } from "../utils/constants";
import {
  cityHasTowns,
  getCitiesForProvince,
  getTownsForCity,
  PAKISTAN_LOCATIONS,
} from "../utils/pakistanLocations";

const registrationSchema = Yup.object().shape({
  userName: Yup.string().trim().required("Please enter your name"),
  phone: Yup.string()
    .trim()
    .matches(/^3\d{2}\s?\d{7}$/, "Phone must be in the format 3XX XXXXXXX")
    .required("Please enter your phone number"),
  province: Yup.string().trim(),
  city: Yup.string().trim(),
  town: Yup.string().trim(),
  email: Yup.string()
    .trim()
    .email("Please enter a valid email address")
    .required("Please enter your email address"),
  password: Yup.string()
    .min(8, "Password should be at least 8 characters")
    .required("Please enter a password"),
});

const RegisterScreen = () => {
  const [hidePassword, setHidePassword] = useState(true);
  const [manualTown, setManualTown] = useState("");
  const { signUp } = useAppStore();

  const handleRegister = async (values: {
    userName: string;
    email: string;
    password: string;
    phone: string;
    province: string;
    city: string;
    town: string;
  }) => {
    try {
      const result = await signUp(
        values.email.trim(),
        values.password,
        values.userName.trim(),
        `+92${values.phone.trim().replace(/\s/g, "")}`,
        values.province.trim(),
        values.city.trim(),
        values.town.trim(),
      );

      if (result.Status === "Success") {
        Constants.showDialog(
          "Account created successfully! You can now log in.",
        );
        setTimeout(() => router.replace("/login"), 2000);
      } else {
        Constants.showDialog(result.ErrorMessage || "Registration failed");
      }
    } catch (error) {
      Constants.showDialog("An error occurred. Please try again.");
    }
  };

  return (
    <Formik
      initialValues={{
        userName: "",
        email: "",
        password: "",
        phone: "",
        province: "",
        city: "",
        town: "",
      }}
      validationSchema={registrationSchema}
      onSubmit={handleRegister}
    >
      {({
        handleChange,
        handleBlur,
        handleSubmit,
        setFieldValue,
        values,
        errors,
        touched,
        isSubmitting,
      }) => (
        <View style={styles.container}>
          {/* Green Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.welcomeSection}>
              <Text style={styles.welcomeTitle}>Join Mint Rewards!</Text>
              <Text style={styles.welcomeSubtitle}>
                Start recycling and earning rewards{"\n"}today
              </Text>
            </View>
          </View>

          {/* White Content Section */}
          <View style={styles.contentSection}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ flex: 1 }}
              keyboardVerticalOffset={90}
            >
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Name Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Name</Text>
                  <View
                    style={[
                      styles.inputContainer,
                      touched.userName && errors.userName && styles.inputError,
                    ]}
                  >
                    <TextInput
                      style={styles.textInput}
                      value={values.userName}
                      onChangeText={handleChange("userName")}
                      onBlur={handleBlur("userName")}
                      autoCapitalize="words"
                      autoCorrect={false}
                      placeholder="Name"
                      placeholderTextColor="#999999"
                      testID="nameInput"
                    />
                  </View>
                  {touched.userName && errors.userName && (
                    <Text style={styles.errorText}>{errors.userName}</Text>
                  )}
                </View>

                {/* Phone Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Phone</Text>
                  <View
                    style={[
                      styles.inputContainer,
                      touched.phone && errors.phone && styles.inputError,
                    ]}
                  >
                    <Text style={styles.countryCode}>+92</Text>
                    <TextInput
                      style={styles.textInput}
                      value={values.phone}
                      onChangeText={handleChange("phone")}
                      onBlur={handleBlur("phone")}
                      keyboardType="phone-pad"
                      autoCorrect={false}
                      placeholder="3XX XXXXXXX"
                      placeholderTextColor="#999999"
                      maxLength={11}
                      testID="phoneInput"
                    />
                  </View>
                  {touched.phone && errors.phone && (
                    <Text style={styles.errorText}>{errors.phone}</Text>
                  )}
                </View>

                {/* Province Dropdown */}
                <LocationPicker
                  label="Province"
                  placeholder="Select Province"
                  options={PAKISTAN_LOCATIONS.provinces}
                  value={values.province}
                  onChange={(val) => {
                    setFieldValue("province", val);
                    // Reset city and town when province changes
                    setFieldValue("city", "");
                    setFieldValue("town", "");
                  }}
                  hasError={!!(touched.province && errors.province)}
                  testID="provinceInput"
                />

                {/* City Dropdown — disabled until province is selected */}
                <LocationPicker
                  label="City"
                  placeholder={
                    values.province ? "Select City" : "Select a province first"
                  }
                  options={getCitiesForProvince(values.province)}
                  value={values.city}
                  onChange={(val) => {
                    setFieldValue("city", val);
                    // Reset town when city changes
                    setFieldValue("town", "");
                  }}
                  disabled={!values.province}
                  hasError={!!(touched.city && errors.city)}
                  testID="cityInput"
                />
                {values.city && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Town</Text>
                    
                    {/* Show dropdown if city has towns AND user hasn't chosen manual entry */}
                    {cityHasTowns(values.city) && values.town !== "__manual__" ? (
                      <LocationPicker
                        label=""
                        placeholder="Select Town"
                        options={[
                          ...getTownsForCity(values.city),
                          "Type manually...",
                        ]}
                        value={values.town}
                        onChange={(val) => {
                          if (val === "Type manually...") {
                            setFieldValue("town", "__manual__");
                          } else {
                            setFieldValue("town", val);
                          }
                        }}
                        hasError={!!(touched.town && errors.town)}
                        testID="townInput"
                      />
                    ) : (
                      <View
                        style={[
                          styles.inputContainer,
                          touched.town && errors.town && styles.inputError,
                        ]}
                      >
                        <TextInput
                          style={styles.textInput}
                          value={manualTown}
                          onChangeText={(text) => setManualTown(text)}  // local state only
                          onBlur={() => {
                            setFieldValue("town", manualTown);  // commit to Formik on blur
                            handleBlur("town");
                          }}
                          autoCapitalize="words"
                          autoCorrect={false}
                          placeholder="Type your town"
                          placeholderTextColor="#999999"
                          autoFocus
                          testID="townCustomInput"
                        />
                        {/* Back to dropdown option */}
                        {cityHasTowns(values.city) && (
                          <TouchableOpacity onPress={() => setFieldValue("town", "")}>
                            <Ionicons name="chevron-down-outline" size={20} color="#999999" />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {touched.town && errors.town && (
                      <Text style={styles.errorText}>{errors.town}</Text>
                    )}
                  </View>
                )}

                {/* Email Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <View
                    style={[
                      styles.inputContainer,
                      touched.email && errors.email && styles.inputError,
                    ]}
                  >
                    <TextInput
                      style={styles.textInput}
                      value={values.email}
                      onChangeText={handleChange("email")}
                      onBlur={handleBlur("email")}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Email"
                      placeholderTextColor="#999999"
                      testID="emailInput"
                    />
                  </View>
                  {touched.email && errors.email && (
                    <Text style={styles.errorText}>{errors.email}</Text>
                  )}
                </View>

                {/* Password Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View
                    style={[
                      styles.inputContainer,
                      touched.password && errors.password && styles.inputError,
                    ]}
                  >
                    <TextInput
                      style={styles.passwordTextInput}
                      value={values.password}
                      onChangeText={handleChange("password")}
                      onBlur={handleBlur("password")}
                      secureTextEntry={hidePassword}
                      placeholder="Password"
                      placeholderTextColor="#999999"
                      testID="passwordInput"
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
                  {touched.password && errors.password && (
                    <Text style={styles.errorText}>{errors.password}</Text>
                  )}
                </View>

                {/* Sign Up Button */}
                <TouchableOpacity
                  style={[
                    styles.signUpButton,
                    isSubmitting && styles.signUpButtonDisabled,
                  ]}
                  onPress={() => handleSubmit()}
                  disabled={isSubmitting}
                  testID="signUpButton"
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.signUpButtonText}>Sign up</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>

            {/* Bottom Login Link */}
            <View style={styles.bottomSection}>
              <View style={styles.loginContainer}>
                <Text style={styles.loginText}>Already Have an Account? </Text>
                <TouchableOpacity onPress={() => router.replace("/login")}>
                  <Text style={styles.loginLinkText}>Login</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    </Formik>
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
    marginBottom: 16,
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
  inputError: {
    borderColor: "#E53935",
    borderWidth: 1.5,
  },
  countryCode: {
    fontSize: 16,
    color: "#333333",
    fontWeight: "500",
    marginRight: 8,
    paddingRight: 8,
    borderRightWidth: 1,
    borderRightColor: "#E0E0E0",
  },
  errorText: {
    color: "#E53935",
    fontSize: 13,
    marginTop: 4,
    marginLeft: 4,
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
    marginTop: 30,
  },
  signUpButtonDisabled: {
    opacity: 0.7,
  },
  signUpButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
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
