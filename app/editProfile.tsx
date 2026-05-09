import MapPicker from "@/components/ui/MapPicker";
import Navbar from "@/components/ui/navbar";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppStore, UserProfile } from "../store/store";

const EditProfile = () => {
  const {
    user,
    updateProfile,
    isProfileLoading,
    profileError,
    setProfileError,
  } = useAppStore();

  // Form state
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    userName: "",
    email: "",
    phone: "",
    province: "",
    city: "",
    town: "",
    address: "",
    latitude: "",
    longitude: "",
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [mapVisible, setMapVisible] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setFormData({
        userName: user.userName || "",
        email: user.email || "",
        phone: user.phone || "",
        province: user.province || "",
        city: user.city || "",
        town: user.town || "",
        address: user.address || "",
        latitude: user.latitude || "",
        longitude: user.longitude || "",
      });
    }
  }, []);

  // Clear profile error when component unmounts
  useEffect(() => {
    return () => {
      setProfileError(null);
    };
  }, []);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.userName?.trim()) {
      newErrors.userName = "Username is required";
    }

    if (!formData.email?.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }

    if (!formData.phone?.trim()) {
      newErrors.phone = "Phone number is required";
    }

    if (!formData.province?.trim()) {
      newErrors.province = "Province is required";
    }

    if (!formData.city?.trim()) {
      newErrors.city = "City is required";
    }

    if (!formData.town?.trim()) {
      newErrors.town = "Town is required";
    }

    if (!formData.address?.trim()) {
      newErrors.address = "Address is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpdateField = (field: keyof UserProfile, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const result = await updateProfile(formData);

      if (result.Status === "Success") {
        Alert.alert("Success", "Profile updated successfully!", [
          {
            text: "OK",
            // onPress: () => {},
            onPress: () => router.replace("/(tabs)/profile"),
          },
        ]);
      } else {
        Alert.alert("Error", result.ErrorMessage || "Failed to update profile");
      }
    } catch (err) {
      console.error("Profile update error:", err);
      Alert.alert("Error", "An unexpected error occurred");
    }
  };

  const renderInput = (
    field: keyof UserProfile,
    label: string,
    placeholder: string,
    keyboardType: "default" | "email-address" | "phone-pad" = "default",
    multiline = false,
    required = false,
  ) => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>
        {label}{required && <Text style={styles.asterisk}> *</Text>}
      </Text>
      <TextInput
        style={[
          styles.input,
          errors[field] && styles.inputError,
          { backgroundColor: field === "email" ? "#e2e8f0" : "#f8f9fa" },
          multiline && styles.inputMultiline,
        ]}
        value={formData[field] || ""}
        onChangeText={(value) => handleUpdateField(field, value)}
        placeholder={placeholder}
        placeholderTextColor="#a0aec0"
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        readOnly={field === "email"}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
      {errors[field] && <Text style={styles.errorText}>{errors[field]}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Navbar user={user} />

      {/* Form Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.formContainer}>
          {/* Profile Icon */}
          <View style={styles.profileIconContainer}>
            <LinearGradient
              colors={["#f8f9fa", "#e9ecef"]}
              style={styles.profileIconBackground}
            >
              <Ionicons name="person" size={60} color="#00528A" />
            </LinearGradient>
          </View>

          {/* Form Fields */}
          <View style={styles.formSection}>
            {renderInput("userName", "Username", "Enter your username", "default", false, true)}
            {renderInput("email", "Email", "Enter your email", "email-address", false, true)}
            {renderInput("phone", "Phone Number", "Enter your phone number", "phone-pad", false, true)}
            {renderInput("province", "Province", "Enter your province", "default", false, true)}
            {renderInput("city", "City", "Enter your city", "default", false, true)}
            {renderInput("town", "Town", "Enter your town", "default", false, true)}
            {renderInput("address", "Street Address", "e.g. 12 Main Street, Suburb", "default", true, true)}

            {/* Location Pin */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Exact Location (Pin)<Text style={styles.asterisk}> *</Text></Text>
              <TouchableOpacity
                style={styles.locationBtn}
                onPress={() => setMapVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={formData.latitude ? "location" : "location-outline"}
                  size={20}
                  color="#00528A"
                />
                <Text style={styles.locationBtnText}>
                  {formData.latitude && formData.longitude
                    ? `${parseFloat(formData.latitude).toFixed(5)}, ${parseFloat(formData.longitude).toFixed(5)}`
                    : "Set location on map"}
                </Text>
                {formData.latitude ? (
                  <TouchableOpacity
                    onPress={() =>
                      setFormData((p) => ({ ...p, latitude: "", longitude: "" }))
                    }
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#a0aec0" />
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#a0aec0" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <MapPicker
            visible={mapVisible}
            initialLatitude={formData.latitude}
            initialLongitude={formData.longitude}
            onConfirm={(lat, lng) =>
              setFormData((p) => ({ ...p, latitude: lat, longitude: lng }))
            }
            onClose={() => setMapVisible(false)}
          />

          {/* Error Display */}
          {profileError && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#e53e3e" />
              <Text style={styles.errorMessage}>{profileError}</Text>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              isProfileLoading && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isProfileLoading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={
                isProfileLoading
                  ? ["#a0aec0", "#718096"]
                  : ["#00528A", "#00528A"]
              }
              style={styles.submitGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isProfileLoading ? (
                <Text style={styles.submitButtonText}>Updating...</Text>
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#ffffff" />
                  <Text style={styles.submitButtonText}>Update Profile</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={20} color="#00528A" />
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
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
    backgroundColor: "#00528A",
    paddingBottom: 20,
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
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  formContainer: {
    padding: 20,
  },
  profileIconContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  profileIconBackground: {
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
  formSection: {
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d3748",
    marginBottom: 8,
  },
  asterisk: {
    color: "#e53e3e",
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#2d3748",
  },
  inputError: {
    borderColor: "#e53e3e",
    backgroundColor: "#fef5f5",
  },
  inputMultiline: {
    height: 90,
    paddingTop: 14,
  },
  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  locationBtnText: {
    flex: 1,
    fontSize: 16,
    color: "#2d3748",
  },
  errorText: {
    color: "#e53e3e",
    fontSize: 14,
    marginTop: 4,
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
  submitButton: {
    marginBottom: 12,
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
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#00528A",
    gap: 10,
  },
  cancelButtonText: {
    color: "#00528A",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default EditProfile;
