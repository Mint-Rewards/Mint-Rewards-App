import MapPicker from "@/components/ui/MapPicker";
import Navbar from "@/components/ui/navbar";
import { PAKISTAN_LOCATIONS } from "@/utils/pakistanLocations";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppStore, UserProfile } from "../store/store";

type PickerField = "province" | "city" | "town";

const EditProfile = () => {
  const {
    user,
    updateProfile,
    isProfileLoading,
    profileError,
    setProfileError,
  } = useAppStore();

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
  const [townIsCustom, setTownIsCustom] = useState(false);
  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    field: PickerField | null;
    options: string[];
    label: string;
  }>({ visible: false, field: null, options: [], label: "" });

  useEffect(() => {
    if (user) {
      const existingTown = user.town || "";
      const existingCity = user.city || "";
      const townList = PAKISTAN_LOCATIONS.towns[existingCity] || [];
      const isCustom = existingTown !== "" && !townList.includes(existingTown);

      setFormData({
        userName: user.userName || "",
        email: user.email || "",
        phone: user.phone || "",
        province: user.province || "",
        city: existingCity,
        town: existingTown,
        address: user.address || "",
        latitude: user.latitude || "",
        longitude: user.longitude || "",
      });
      setTownIsCustom(isCustom);
    }
  }, []);

  useEffect(() => {
    return () => { setProfileError(null); };
  }, []);

  // ── Derived options ────────────────────────────────────────────────────────
  const cityOptions = formData.province
    ? (PAKISTAN_LOCATIONS.cities[formData.province] || [])
    : [];

  const baseTownOptions = formData.city
    ? (PAKISTAN_LOCATIONS.towns[formData.city] || [])
    : [];
  const townOptions = [...baseTownOptions, "Other"];

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearError = (field: string) => {
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
  };

  const openPicker = (field: PickerField, options: string[], label: string) => {
    setPickerModal({ visible: true, field, options, label });
  };

  const handlePickerSelect = (value: string) => {
    const field = pickerModal.field!;
    setPickerModal({ visible: false, field: null, options: [], label: "" });

    if (field === "province") {
      setFormData((p) => ({ ...p, province: value, city: "", town: "" }));
      setTownIsCustom(false);
      setErrors((p) => ({ ...p, province: "", city: "", town: "" }));
    } else if (field === "city") {
      setFormData((p) => ({ ...p, city: value, town: "" }));
      setTownIsCustom(false);
      setErrors((p) => ({ ...p, city: "", town: "" }));
    } else if (field === "town") {
      if (value === "Other") {
        setFormData((p) => ({ ...p, town: "" }));
        setTownIsCustom(true);
      } else {
        setFormData((p) => ({ ...p, town: value }));
        setTownIsCustom(false);
      }
      clearError("town");
    }
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.userName?.trim())  newErrors.userName = "Username is required";
    if (!formData.email?.trim())     newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Please enter a valid email";
    if (!formData.phone?.trim())     newErrors.phone = "Phone number is required";
    if (!formData.province?.trim())  newErrors.province = "Province is required";
    if (!formData.city?.trim())      newErrors.city = "City is required";
    if (!formData.town?.trim())      newErrors.town = "Town is required";
    if (!formData.address?.trim())   newErrors.address = "Address is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpdateField = (field: keyof UserProfile, value: string) => {
    setFormData((p) => ({ ...p, [field]: value }));
    clearError(field as string);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    try {
      const result = await updateProfile(formData);
      if (result.Status === "Success") {
        Alert.alert("Success", "Profile updated successfully!", [
          { text: "OK", onPress: () => router.replace("/(tabs)/profile") },
        ]);
      } else {
        Alert.alert("Error", result.ErrorMessage || "Failed to update profile");
      }
    } catch {
      Alert.alert("Error", "An unexpected error occurred");
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
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
        onChangeText={(v) => handleUpdateField(field, v)}
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

  const renderDropdown = (
    field: PickerField,
    label: string,
    options: string[],
    placeholder: string,
    required = false,
    disabled = false,
  ) => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>
        {label}{required && <Text style={styles.asterisk}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[
          styles.input,
          styles.dropdownBtn,
          errors[field] && styles.inputError,
          disabled && styles.dropdownDisabled,
        ]}
        onPress={() => !disabled && openPicker(field, options, label)}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <Text style={[styles.dropdownText, !formData[field] && styles.placeholderText]}>
          {formData[field] || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={disabled ? "#d0d0d0" : "#a0aec0"} />
      </TouchableOpacity>
      {errors[field] && <Text style={styles.errorText}>{errors[field]}</Text>}
    </View>
  );

  // Town field: dropdown or text input depending on townIsCustom
  const renderTownField = () => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>
        Town<Text style={styles.asterisk}> *</Text>
      </Text>

      {townIsCustom ? (
        <View style={styles.customTownRow}>
          <TextInput
            style={[
              styles.input,
              styles.customTownInput,
              errors.town && styles.inputError,
            ]}
            value={formData.town || ""}
            onChangeText={(v) => handleUpdateField("town", v)}
            placeholder="Enter your town"
            placeholderTextColor="#a0aec0"
            autoCapitalize="words"
            autoFocus
          />
          <TouchableOpacity
            style={styles.townBackBtn}
            onPress={() => {
              setTownIsCustom(false);
              setFormData((p) => ({ ...p, town: "" }));
            }}
          >
            <Ionicons name="list" size={20} color="#00528A" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.input,
            styles.dropdownBtn,
            errors.town && styles.inputError,
            !formData.city && styles.dropdownDisabled,
          ]}
          onPress={() => formData.city && openPicker("town", townOptions, "Town")}
          activeOpacity={!formData.city ? 1 : 0.7}
        >
          <Text style={[styles.dropdownText, !formData.town && styles.placeholderText]}>
            {formData.town || "Select town"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={!formData.city ? "#d0d0d0" : "#a0aec0"} />
        </TouchableOpacity>
      )}

      {errors.town && <Text style={styles.errorText}>{errors.town}</Text>}
      <Text style={styles.fieldHint}>
        {townIsCustom
          ? 'Tap the list icon to choose from available towns instead'
          : 'Select "Other" if your town isn\'t listed'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Navbar user={user} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.formContainer}>
          <View style={styles.profileIconContainer}>
            <LinearGradient
              colors={["#f8f9fa", "#e9ecef"]}
              style={styles.profileIconBackground}
            >
              <Ionicons name="person" size={60} color="#00528A" />
            </LinearGradient>
          </View>

          <View style={styles.formSection}>
            {renderInput("userName", "Username", "Enter your username", "default", false, true)}
            {renderInput("email", "Email", "Enter your email", "email-address", false, true)}
            {renderInput("phone", "Phone Number", "Enter your phone number", "phone-pad", false, true)}

            {renderDropdown(
              "province",
              "Province",
              PAKISTAN_LOCATIONS.provinces,
              "Select province",
              true,
            )}

            {renderDropdown(
              "city",
              "City",
              cityOptions,
              formData.province ? "Select city" : "Select province first",
              true,
              !formData.province,
            )}

            {renderTownField()}

            {renderInput("address", "Street Address", "e.g. 12 Main Street, Suburb", "default", true, true)}

            {/* Location Pin */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                Exact Location (Pin)<Text style={styles.asterisk}> *</Text>
              </Text>
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
                    onPress={() => setFormData((p) => ({ ...p, latitude: "", longitude: "" }))}
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
            onConfirm={(lat, lng) => setFormData((p) => ({ ...p, latitude: lat, longitude: lng }))}
            onClose={() => setMapVisible(false)}
          />

          {profileError && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#e53e3e" />
              <Text style={styles.errorMessage}>{profileError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitButton, isProfileLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isProfileLoading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isProfileLoading ? ["#a0aec0", "#718096"] : ["#00528A", "#00528A"]}
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

      {/* ── Picker Modal ── */}
      <Modal
        visible={pickerModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerModal({ visible: false, field: null, options: [], label: "" })}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{pickerModal.label}</Text>
              <TouchableOpacity
                onPress={() => setPickerModal({ visible: false, field: null, options: [], label: "" })}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={pickerModal.options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    formData[pickerModal.field!] === item && styles.pickerItemSelected,
                  ]}
                  onPress={() => handlePickerSelect(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.pickerItemText,
                    formData[pickerModal.field!] === item && styles.pickerItemTextSelected,
                    item === "Other" && styles.pickerItemOther,
                  ]}>
                    {item}
                  </Text>
                  {formData[pickerModal.field!] === item && (
                    <Ionicons name="checkmark" size={18} color="#00528A" />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.pickerSeparator} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { flex: 1 },
  formContainer: { padding: 20 },
  profileIconContainer: { alignItems: "center", marginBottom: 30 },
  profileIconBackground: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  formSection: { marginBottom: 20 },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: "600", color: "#2d3748", marginBottom: 8 },
  asterisk: { color: "#e53e3e", fontWeight: "700" },
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
  inputError: { borderColor: "#e53e3e", backgroundColor: "#fef5f5" },
  inputMultiline: { height: 90, paddingTop: 14 },

  // Dropdown
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: { fontSize: 16, color: "#2d3748", flex: 1 },
  placeholderText: { color: "#a0aec0" },
  dropdownDisabled: { backgroundColor: "#f0f0f0", borderColor: "#e2e8f0" },

  // Custom town row
  customTownRow: { flexDirection: "row", gap: 8 },
  customTownInput: { flex: 1 },
  townBackBtn: {
    width: 50,
    backgroundColor: "#f0f8ff",
    borderWidth: 1,
    borderColor: "#bee3f8",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  fieldHint: { fontSize: 12, color: "#a0aec0", marginTop: 5 },

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
  locationBtnText: { flex: 1, fontSize: 16, color: "#2d3748" },
  errorText: { color: "#e53e3e", fontSize: 14, marginTop: 4 },
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
  errorMessage: { color: "#e53e3e", fontSize: 14, flex: 1 },
  submitButton: {
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: { opacity: 0.6 },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  submitButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
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
  cancelButtonText: { color: "#00528A", fontSize: 16, fontWeight: "600" },

  // Picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "60%",
    paddingTop: 8,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  pickerTitle: { fontSize: 17, fontWeight: "700", color: "#2d3748" },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  pickerItemSelected: { backgroundColor: "#f0f8ff" },
  pickerItemText: { fontSize: 16, color: "#2d3748" },
  pickerItemTextSelected: { color: "#00528A", fontWeight: "600" },
  pickerItemOther: { color: "#718096", fontStyle: "italic" },
  pickerSeparator: { height: 1, backgroundColor: "#f7f7f7", marginHorizontal: 20 },

  // Unused legacy styles kept for Navbar compatibility
  headerSection: { backgroundColor: "#00528A", paddingBottom: 20 },
  header: { paddingTop: 50, paddingHorizontal: 20, paddingBottom: 15, zIndex: 10 },
  headerGradient: { borderRadius: 20, padding: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  headerContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#ffffff" },
  placeholder: { width: 40 },
});

export default EditProfile;
