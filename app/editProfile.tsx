import { LocationFields } from "@/components/location/LocationFields";
import MapPicker from "@/components/ui/MapPicker";
import Navbar from "@/components/ui/navbar";
import { useLocationForm } from "@/hooks/useLocationForm";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { alertOnce } from "@/utils/alert";
import {
  trackLocationPatchFailed,
  trackLocationSaved,
} from "@/utils/locationAnalytics";
import {
  buildLocationPatchPayload,
  patchUserLocation,
} from "@/utils/locationApi";
import {
  buildLocationPayload,
  validateLocationValues,
} from "@/utils/locationSave";
import { logError } from "@/utils/logger";
import { getSubAreasForTown, isCanonicalTown } from "@/utils/pakistan_areas";
import { needsLocationUpdate } from "@/utils/profile";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppStore, UserProfile } from "../store/store";
import { isPhone, sanitizePhone } from "../utils/phone";

/** The fields this screen still owns. Everything below the phone number belongs
 *  to `useLocationForm` / `LocationFields`. */
interface IdentityFields {
  userName: string;
  email: string;
  phone: string;
}

const EditProfile = () => {
  const {
    user,
    token,
    updateProfile,
    setLocationEvaluation,
    isProfileLoading,
    profileError,
    setProfileError,
  } = useAppStore();

  const [identity, setIdentity] = useState<IdentityFields>({
    userName: "",
    email: "",
    phone: "",
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [mapVisible, setMapVisible] = useState(false);

  const form = useLocationForm();

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

      // Only rehydrate `subArea` if it is still canonical for this city/town.
      // A value can go stale if the data file drops or renames an entry, and we
      // must never seed the form with a non-canonical `subArea`.
      const canonical = getSubAreasForTown(existingCity, existingTown);
      const existingSubArea =
        user.subArea && canonical.includes(user.subArea) ? user.subArea : "";
      const existingSubAreaOther =
        mustReselect || existingSubArea ? "" : user.subAreaOther || "";

      setIdentity({
        userName: user.userName || "",
        email: user.email || "",
        phone: user.phone || "",
      });

      form.reset({
        city: existingCity,
        town: existingTown,
        townOther: existingTownOther,
        subArea: existingSubArea,
        subAreaOther: existingSubAreaOther,
        // Lives nested on the server; flat in the form. `my-profile` returns the
        // whole document, so a previously-saved value comes back and the user is
        // not made to retype it on every edit.
        houseNo: user.structuredAddress?.houseNo || "",
        address: user.address || "",
        latitude: user.latitude || "",
        longitude: user.longitude || "",
      });
    }
  }, []);

  useEffect(() => {
    return () => { setProfileError(null); };
  }, []);

  const clearError = (field: string) => {
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  // Identity is this screen's; everything about the place is `locationSave`'s,
  // so the confirm-address modal cannot end up enforcing a different rule.
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!identity.userName.trim())  newErrors.userName = "Username is required";
    if (!identity.email.trim())     newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(identity.email)) newErrors.email = "Please enter a valid email";
    if (!identity.phone.trim())     newErrors.phone = "Phone number is required";
    else if (!isPhone(identity.phone))
      newErrors.phone = "Please enter a valid phone number (10-15 digits)";

    const location = validateLocationValues(form.values, {
      // Required only where there is canonical data to choose from. Free-text
      // towns and towns without sub-areas never render the field, so it must
      // not gate their save.
      requireSubArea: form.showSubArea,
      houseNoLabel: form.houseNoField.label,
    });

    const merged = { ...newErrors, ...location.errors };
    setErrors(merged);
    return Object.keys(merged).length === 0;
  };

  const handleUpdateField = (field: keyof IdentityFields, value: string) => {
    // `phone-pad` still offers *, #, + and ; and pasting bypasses the keyboard
    // entirely, so strip anything that is not a digit (or a leading +) here.
    const next = field === "phone" ? sanitizePhone(value) : value;
    setIdentity((p) => ({ ...p, [field]: next }));
    clearError(field);
  };

  /** Identity plus the normalized location — the shape `update-profile` wants. */
  const buildPayload = (): Partial<UserProfile> => ({
    ...identity,
    ...buildLocationPayload(form.values),
  });

  /**
   * Sends the STRUCTURED location after the legacy save has already landed.
   *
   * Non-blocking by design: `update-profile` has persisted the strings by the
   * time this runs, so a failure here costs routing precision, not the user's
   * save. It is logged and swallowed — never surfaced as an alert, and never
   * allowed to turn a successful save into an error the user sees.
   */
  /** Returns true when the session died mid-save (see the 401 note below). */
  const persistStructuredLocation = async (
    payload: Partial<UserProfile>,
  ): Promise<boolean> => {
    try {
      // `null` here means the map was never opened this session, which makes
      // `buildLocationPatchPayload` omit `location` entirely rather than
      // downgrade a precise stored pin to `legacy_string`/`unknown`.
      const patch = buildLocationPatchPayload(payload, form.placementRef.current);

      // Reported on the SAVE, not on this request's outcome. By the time we get
      // here update-profile has already persisted the coordinate, so the user
      // has saved a location whatever the PATCH below does; gating the event on
      // it would under-count the funnel for a failure nobody experienced. The
      // failure itself is logged separately.
      if (patch.location) {
        trackLocationSaved(patch.location.source, patch.location.precision);
      }

      const result = await patchUserLocation(patch, token || user?.token);

      if (result.Status === "Success") {
        // The server's verdict on whether this location is finished — the only
        // authority on that, since it knows about fields this form does not yet
        // collect.
        setLocationEvaluation(result.evaluation ?? null);
        return false;
      }

      await logError("patchUserLocation failed", {
        userId: user?.mintId,
        route: "editProfile",
        error: result.ErrorMessage,
      });
      // The user never sees this failure, so this event is the only place it
      // becomes a number worth putting next to `location_saved`.
      trackLocationPatchFailed(result.ErrorMessage);
      return result.unauthorized === true;
    } catch (error) {
      await logError("patchUserLocation exception", {
        userId: user?.mintId,
        route: "editProfile",
        error,
      });
      trackLocationPatchFailed(
        error instanceof Error ? error.message : "unknown",
      );
    }
    return false;
  };

  const submitProfile = async () => {
    if (!validateForm()) return;
    try {
      const payload = buildPayload();
      const result = await updateProfile(payload);
      if (result.Status === "Success") {
        const signedOut = await persistStructuredLocation(payload);
        // A 401 on that request means `authenticatedFetch` has already signed
        // the user out and sent them to the login screen. Congratulating them
        // on a save while they are being bounced is worse than saying nothing —
        // the save itself did land, and their profile will show it next login.
        if (signedOut) return;
        alertOnce("Success", "Profile updated successfully!", [
          { text: "OK", onPress: () => router.replace("/(tabs)/profile") },
        ]);
      } else {
        alertOnce("Error", result.ErrorMessage || "Failed to update profile");
      }
    } catch {
      alertOnce("Error", "An unexpected error occurred");
    }
  };

  // isProfileLoading is store state and lands a frame late, so it cannot stop
  // two taps in the same frame from firing two updateProfile calls.
  const { run: handleSubmit, inFlight: submitting } = useSingleFlight(submitProfile);

  const renderInput = (
    field: keyof IdentityFields,
    label: string,
    placeholder: string,
    keyboardType: "default" | "email-address" | "phone-pad" = "default",
  ) => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>
        {label}<Text style={styles.asterisk}> *</Text>
      </Text>
      <TextInput
        style={[
          styles.input,
          errors[field] && styles.inputError,
          { backgroundColor: field === "email" ? "#e2e8f0" : "#f8f9fa" },
        ]}
        value={identity[field]}
        onChangeText={(v) => handleUpdateField(field, v)}
        placeholder={placeholder}
        placeholderTextColor="#a0aec0"
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        readOnly={field === "email"}
        maxLength={field === "phone" ? 16 : undefined}
        textAlignVertical="center"
      />
      {errors[field] && <Text style={styles.errorText}>{errors[field]}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Navbar user={user} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
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
            {renderInput("userName", "Username", "Enter your username")}
            {renderInput("email", "Email", "Enter your email", "email-address")}
            {renderInput("phone", "Phone Number", "Enter your phone number", "phone-pad")}

            <LocationFields
              form={form}
              errors={errors}
              clearError={clearError}
              onOpenMap={() => setMapVisible(true)}
            />
          </View>

          <MapPicker
            visible={mapVisible}
            initialLatitude={form.values.latitude}
            initialLongitude={form.values.longitude}
            city={form.values.city}
            town={form.values.town}
            onConfirm={(lat, lng, placement) => {
              form.confirmPin(lat, lng, placement);
              clearError("location");
            }}
            onClose={() => setMapVisible(false)}
          />

          {profileError && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#e53e3e" />
              <Text style={styles.errorMessage}>{profileError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitButton, (isProfileLoading || submitting) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isProfileLoading || submitting}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={(isProfileLoading || submitting) ? ["#a0aec0", "#718096"] : ["#00528A", "#00528A"]}
              style={styles.submitGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {(isProfileLoading || submitting) ? (
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
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { flex: 1 },
  // Room to scroll the last fields clear of the keyboard.
  contentContainer: { paddingBottom: 120 },
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
