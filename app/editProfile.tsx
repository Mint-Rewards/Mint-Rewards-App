import MapPicker from "@/components/ui/MapPicker";
import Navbar from "@/components/ui/navbar";
import {
  PAKISTAN_LOCATIONS,
  getSubAreasForTown,
  isCanonicalTown,
  matchCanonicalNames,
  requiresSubArea,
} from "@/utils/pakistan_areas";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { needsLocationUpdate } from "@/utils/profile";
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

type PickerField = "province" | "city" | "town" | "subArea";

/**
 * Sentinel appended to the town and sub-area dropdowns. It is never persisted:
 * choosing it clears the canonical field and reveals a free-text input writing
 * to the paired `*Other` field, so `town` and `subArea` only ever hold values
 * from the canonical list.
 */
const OTHER_OPTION = "Other";

/** Matches the server-side cap on `townOther` / `subAreaOther`. */
const OTHER_TEXT_MAX = 100;

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
    townOther: "",
    subArea: "",
    subAreaOther: "",
    address: "",
    latitude: "",
    longitude: "",
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [mapVisible, setMapVisible] = useState(false);
  const [townIsCustom, setTownIsCustom] = useState(false);
  const [subAreaIsOther, setSubAreaIsOther] = useState(false);
  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    field: PickerField | null;
    options: string[];
    label: string;
  }>({ visible: false, field: null, options: [], label: "" });

  useEffect(() => {
    if (user) {
      // Renamed town, or a sub-area that was never collected. Start every
      // location field empty so the user re-picks from the canonical list
      // rather than confirming a stale value. Form state only — the store and
      // the server keep their values until a save succeeds.
      const mustReselect = needsLocationUpdate(user);

      const existingCity = user.city || "";
      const savedTown = user.town || "";

      // A canonical town survives as `town`; `mustReselect` forces both fields
      // blank so the user re-picks rather than confirms a stale value. The
      // `savedTown` fallback below is reachable only when `mustReselect` is
      // false AND the town isn't canonical — i.e. only for cities absent from
      // `PAKISTAN_LOCATIONS.towns`, where `isLegacyTownValue` can't judge the
      // saved value and free text may have been written straight into `town`
      // by an older build.
      const townIsCanonical =
        !mustReselect && isCanonicalTown(existingCity, savedTown);
      const existingTown = townIsCanonical ? savedTown : "";
      const existingTownOther =
        mustReselect || townIsCanonical
          ? ""
          : user.townOther || savedTown || "";
      const isCustom = existingTownOther !== "";

      // Only rehydrate `subArea` if it is still canonical for this city/town.
      // A value can go stale if the data file drops or renames an entry, and we
      // must never seed the form with a non-canonical `subArea`.
      const canonical = getSubAreasForTown(existingCity, existingTown);
      const existingSubArea =
        user.subArea && canonical.includes(user.subArea) ? user.subArea : "";
      const existingSubAreaOther =
        mustReselect || existingSubArea ? "" : user.subAreaOther || "";

      setFormData({
        userName: user.userName || "",
        email: user.email || "",
        phone: user.phone || "",
        province: user.province || "",
        city: existingCity,
        town: existingTown,
        townOther: existingTownOther,
        subArea: existingSubArea,
        subAreaOther: existingSubAreaOther,
        address: user.address || "",
        latitude: user.latitude || "",
        longitude: user.longitude || "",
      });
      setTownIsCustom(isCustom);
      setSubAreaIsOther(existingSubAreaOther !== "");
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
  const townOptions = [...baseTownOptions, OTHER_OPTION];

  // The sub-area step exists only for towns that actually have canonical data.
  // A free-text town never does — its value lives in `townOther`, leaving
  // `town` empty — so the step is skipped and not required for those.
  const showSubArea =
    !townIsCustom && requiresSubArea(formData.city || "", formData.town || "");

  const subAreaOptions = showSubArea
    ? [...getSubAreasForTown(formData.city!, formData.town!), OTHER_OPTION]
    : [];

  // ── "Other" suggestions ────────────────────────────────────────────────────
  // While someone types a free-text town or sub-area, offer canonical entries
  // that look like what they wrote, so a near-miss spelling gets steered back
  // onto the list instead of becoming another `*Other` row to review later.
  // Debounced so the list settles rather than churning mid-word.
  const debouncedTownOther = useDebouncedValue(formData.townOther || "");
  const debouncedSubAreaOther = useDebouncedValue(formData.subAreaOther || "");

  const townSuggestions = townIsCustom
    ? matchCanonicalNames(baseTownOptions, debouncedTownOther)
    : [];

  const subAreaSuggestions =
    showSubArea && subAreaIsOther
      ? matchCanonicalNames(
          getSubAreasForTown(formData.city!, formData.town!),
          debouncedSubAreaOther,
        )
      : [];

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearError = (field: string) => {
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
  };

  const openPicker = (field: PickerField, options: string[], label: string) => {
    setPickerModal({ visible: true, field, options, label });
  };

  /**
   * Clears the sub-area answer state. Called whenever the town changes: the
   * question is about the new town, so a previous "Other" must not carry over
   * and satisfy the required rule by accident.
   */
  const resetSubAreaState = () => {
    setSubAreaIsOther(false);
  };

  /** Commit a canonical town — from the dropdown or from a suggestion tap. */
  const selectCanonicalTown = (value: string) => {
    setFormData((p) => ({
      ...p, town: value, townOther: "", subArea: "", subAreaOther: "",
    }));
    setTownIsCustom(false);
    resetSubAreaState();
    clearError("town");
  };

  /** Commit a canonical sub-area — from the dropdown or from a suggestion tap. */
  const selectCanonicalSubArea = (value: string) => {
    setFormData((p) => ({ ...p, subArea: value, subAreaOther: "" }));
    resetSubAreaState();
    clearError("subArea");
  };

  const handlePickerSelect = (value: string) => {
    const field = pickerModal.field!;
    setPickerModal({ visible: false, field: null, options: [], label: "" });

    // Every level of the cascade clears the sub-area pair: a sub-area is only
    // meaningful for the exact city/town it was chosen under.
    if (field === "province") {
      setFormData((p) => ({
        ...p, province: value, city: "", town: "", townOther: "",
        subArea: "", subAreaOther: "",
      }));
      setTownIsCustom(false);
      resetSubAreaState();
      setErrors((p) => ({ ...p, province: "", city: "", town: "" }));
    } else if (field === "city") {
      setFormData((p) => ({
        ...p, city: value, town: "", townOther: "", subArea: "", subAreaOther: "",
      }));
      setTownIsCustom(false);
      resetSubAreaState();
      setErrors((p) => ({ ...p, city: "", town: "" }));
    } else if (field === "town") {
      // Mutual exclusivity: free text goes to `townOther`, never to `town`.
      if (value === OTHER_OPTION) {
        setFormData((p) => ({
          ...p, town: "", townOther: "", subArea: "", subAreaOther: "",
        }));
        setTownIsCustom(true);
        resetSubAreaState();
        clearError("town");
      } else {
        selectCanonicalTown(value);
      }
    } else if (field === "subArea") {
      // Mutual exclusivity: exactly one of the two fields can ever hold a value.
      if (value === OTHER_OPTION) {
        setFormData((p) => ({ ...p, subArea: "", subAreaOther: "" }));
        setSubAreaIsOther(true);
        clearError("subArea");
      } else {
        selectCanonicalSubArea(value);
      }
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
    // Either a canonical town or free-text "Other" satisfies the requirement.
    if (!formData.town?.trim() && !formData.townOther?.trim())
      newErrors.town = "Town is required";
    if (!formData.address?.trim())   newErrors.address = "Address is required";
    // Required only where there is canonical data to choose from. Free-text
    // towns and towns without sub-areas never render the field, so it must not
    // gate their save.
    if (
      showSubArea &&
      !formData.subArea?.trim() &&
      !formData.subAreaOther?.trim()
    )
      newErrors.subArea = "Sub-area is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpdateField = (field: keyof UserProfile, value: string) => {
    setFormData((p) => ({ ...p, [field]: value }));
    clearError(field as string);
  };

  const trimCapped = (v?: string) => (v || "").trim().slice(0, OTHER_TEXT_MAX);

  /**
   * Normalises both canonical/free-text pairs before they leave the client.
   * `town` and `subArea` are re-checked against the canonical lists here rather
   * than trusted from form state, and at most one of each pair survives. Every
   * field is always sent (as "" when unset) so clearing a previously-saved
   * value actually reaches the server.
   */
  const buildPayload = (): Partial<UserProfile> => {
    const city = formData.city || "";

    // Town: a non-canonical value is never allowed through as `town`; it
    // degrades to `townOther` rather than being dropped, so nothing is lost.
    const townIsCanonical = isCanonicalTown(city, formData.town || "");
    const town = townIsCanonical ? formData.town! : "";
    const townOther = townIsCanonical
      ? ""
      : trimCapped(formData.townOther || formData.town);

    // Sub-area: only meaningful under a canonical town, and only for towns that
    // actually have sub-area data — one with none never offered "Other", so
    // neither field can legitimately hold anything.
    const canonicalSubAreas = town ? getSubAreasForTown(city, town) : [];
    if (canonicalSubAreas.length === 0) {
      return { ...formData, town, townOther, subArea: "", subAreaOther: "" };
    }

    const subArea =
      formData.subArea && canonicalSubAreas.includes(formData.subArea)
        ? formData.subArea
        : "";
    const subAreaOther = subArea ? "" : trimCapped(formData.subAreaOther);

    return { ...formData, town, townOther, subArea, subAreaOther };
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    try {
      const result = await updateProfile(buildPayload());
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

  /**
   * Canonical entries resembling what the user has typed into an "Other" field.
   * Tapping one switches them onto the canonical value and clears the free text.
   */
  const renderSuggestions = (
    suggestions: string[],
    onPick: (value: string) => void,
  ) => {
    if (suggestions.length === 0) return null;

    return (
      <View style={styles.suggestionBox}>
        <Text style={styles.suggestionHeading}>Did you mean</Text>
        {suggestions.map((suggestion) => (
          <TouchableOpacity
            key={suggestion}
            style={styles.suggestionRow}
            onPress={() => onPick(suggestion)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-forward-circle-outline" size={16} color="#449EB2" />
            <Text style={styles.suggestionText}>{suggestion}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

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
            value={formData.townOther || ""}
            // Writes to `townOther` but clears the `town` error — both fields
            // satisfy the same "Town is required" rule.
            onChangeText={(v) => {
              setFormData((p) => ({ ...p, townOther: v }));
              clearError("town");
            }}
            placeholder="Enter your town"
            placeholderTextColor="#a0aec0"
            autoCapitalize="words"
            maxLength={OTHER_TEXT_MAX}
            autoFocus
          />
          <TouchableOpacity
            style={styles.townBackBtn}
            onPress={() => {
              setTownIsCustom(false);
              setFormData((p) => ({
                ...p, town: "", townOther: "", subArea: "", subAreaOther: "",
              }));
              resetSubAreaState();
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

      {renderSuggestions(townSuggestions, selectCanonicalTown)}

      {errors.town && <Text style={styles.errorText}>{errors.town}</Text>}
      <Text style={styles.fieldHint}>
        {townIsCustom
          ? 'Tap the list icon to choose from available towns instead'
          : 'Select "Other" if your town isn\'t listed'}
      </Text>
    </View>
  );

  /**
   * Sub-area (block / sector / phase). Renders only for towns with canonical
   * data — towns without it skip the step entirely rather than showing an empty
   * dropdown, and are not gated by the required rule.
   */
  const renderSubAreaField = () => {
    if (!showSubArea) return null;

    const answered = formData.subArea || subAreaIsOther;
    const displayValue =
      formData.subArea || (subAreaIsOther ? OTHER_OPTION : "Select sub-area");

    return (
      <View style={styles.inputContainer}>
        <Text style={styles.label}>
          Sub-area<Text style={styles.asterisk}> *</Text>
        </Text>

        <TouchableOpacity
          style={[
            styles.input,
            styles.dropdownBtn,
            errors.subArea && styles.inputError,
          ]}
          onPress={() => openPicker("subArea", subAreaOptions, "Sub-area")}
          activeOpacity={0.7}
        >
          <Text style={[styles.dropdownText, !answered && styles.placeholderText]}>
            {displayValue}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#a0aec0" />
        </TouchableOpacity>

        {subAreaIsOther && (
          <TextInput
            style={[styles.input, styles.subAreaOtherInput]}
            value={formData.subAreaOther || ""}
            // Writes to `subAreaOther` but clears the `subArea` error — both
            // fields satisfy the same required rule.
            onChangeText={(v) => {
              setFormData((p) => ({ ...p, subAreaOther: v }));
              clearError("subArea");
            }}
            placeholder="Enter your block, sector or phase"
            placeholderTextColor="#a0aec0"
            autoCapitalize="words"
            maxLength={OTHER_TEXT_MAX}
            autoFocus
          />
        )}

        {renderSuggestions(subAreaSuggestions, selectCanonicalSubArea)}

        {errors.subArea && <Text style={styles.errorText}>{errors.subArea}</Text>}
        <Text style={styles.fieldHint}>
          {subAreaIsOther
            ? "We'll review entries like yours and add common ones to the list"
            : `Select "${OTHER_OPTION}" if yours isn't listed`}
        </Text>
      </View>
    );
  };

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

            {renderSubAreaField()}

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
                    item === OTHER_OPTION && styles.pickerItemOther,
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

  // Free-text sub-area, revealed under the dropdown when "Other" is picked
  subAreaOtherInput: { marginTop: 8 },

  // Canonical near-matches offered under an "Other" free-text input
  suggestionBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#f0f7f9",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d5e8ee",
    gap: 2,
  },
  suggestionHeading: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5b7683",
    marginBottom: 4,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: "#00528A",
    fontWeight: "500",
  },

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
