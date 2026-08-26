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
import { missingSentence } from "@/utils/locationEvaluation";
import { buildPrefill, reverseGeocode } from "@/utils/locationPrefill";
import { needsLocationUpdate } from "@/utils/profile";
import { parseProfileFocus } from "@/utils/profileFocus";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
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

/** Breathing room above a focused field, so it is not flush against the navbar. */
const FOCUS_SCROLL_MARGIN = 24;

/**
 * How long to wait before measuring. One frame is enough for the anchors to
 * have been laid out; measuring in the same tick as mount returns zeroes.
 */
const FOCUS_SETTLE_MS = 350;

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

  // ── Deep-focus from the gate's checklist ─────────────────────────────────
  // The "Finish your profile" modal names a gap and routes here with it. Its
  // value is untrusted route input — see `parseProfileFocus`, which degrades
  // anything unrecognised to null so a stale link just opens the form normally.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const focusTarget = parseProfileFocus(focus);

  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const userNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const addressRef = useRef<View>(null);
  const pinRef = useRef<View>(null);

  /**
   * Brings a target into view, and puts the cursor in it where there is one.
   *
   * Two different jobs, because the checklist's rows are not all the same kind
   * of thing. Name and phone are text inputs, so focusing them is literal and
   * also raises the keyboard ready to type. "Pickup address" is a stack of
   * pickers and "Map pin" is a button — neither can hold a cursor, so the most
   * that can be done is to scroll them under the user's eyes. Scrolling happens
   * for all four either way: on a form this long, a focused field the user
   * cannot see is no better than no focus at all.
   *
   * Runs once, after layout. Everything is optional-chained and the failure
   * callback is a no-op: a measurement that cannot be taken must leave the user
   * on a perfectly usable form, never break the screen.
   */
  useEffect(() => {
    if (!focusTarget) return;
    const inputs: Partial<Record<string, React.RefObject<TextInput | null>>> = {
      userName: userNameRef,
      phone: phoneRef,
    };
    const anchors: Record<string, React.RefObject<View | TextInput | null>> = {
      userName: userNameRef,
      phone: phoneRef,
      address: addressRef,
      pin: pinRef,
    };
    // One frame's delay so the anchors have been laid out and can be measured.
    const timer = setTimeout(() => {
      const anchor = anchors[focusTarget]?.current;
      const content = contentRef.current;
      if (anchor && content) {
        anchor.measureLayout(
          content,
          (_x, y) =>
            scrollRef.current?.scrollTo({
              y: Math.max(0, y - FOCUS_SCROLL_MARGIN),
              animated: true,
            }),
          () => {},
        );
      }
      inputs[focusTarget]?.current?.focus();
    }, FOCUS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [focusTarget]);

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
        // Carried in so an off-registry city still lands with a province
        // (Issue 8). `reset` prefers the registry whenever it recognises the
        // city, so this only shows through when derivation finds nothing.
        province: user.province || "",
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
  // Visual top-to-bottom order, used to jump to the first invalid field after a
  // failed save. The location half reuses the same anchors the checklist's
  // deep-focus uses: city / town / sub-area / house number are one block on
  // screen, so the top of that block is the honest target for any of them.
  const ERROR_FIELD_ORDER = [
    "userName", "email", "phone",
    "province", "city", "location", "town", "subArea", "houseNo",
  ];

  /** Scrolls the first field with an error into view. */
  const scrollToFirstError = (fieldErrors: { [key: string]: string }) => {
    const field = ERROR_FIELD_ORDER.find((f) => fieldErrors[f]);
    if (!field) return;
    const anchors: Partial<Record<string, React.RefObject<View | TextInput | null>>> = {
      userName: userNameRef,
      email: emailRef,
      phone: phoneRef,
      location: pinRef,
    };
    const anchor = (anchors[field] ?? addressRef).current;
    const content = contentRef.current;
    // A measurement that cannot be taken must leave the user on a perfectly
    // usable form, so every failure path here is a no-op.
    if (!anchor || !content) return;
    anchor.measureLayout(
      content,
      (_x, y) =>
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - FOCUS_SCROLL_MARGIN),
          animated: true,
        }),
      () => {},
    );
  };

  // Identity is this screen's; everything about the place is `locationSave`'s,
  // so the confirm-address modal cannot end up enforcing a different rule.
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!identity.userName.trim())  newErrors.userName = "Username is required";
    if (!identity.email.trim())     newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(identity.email)) newErrors.email = "Please enter a valid email";
    if (!identity.phone.trim())     newErrors.phone = "Phone number is required";
    else if (!isPhone(identity.phone))
      newErrors.phone = "Please enter a valid phone number in the format 03XXXXXXXXX";

    const location = validateLocationValues(form.values, {
      // Required only where there is canonical data to choose from. Free-text
      // towns and towns without sub-areas never render the field, so it must
      // not gate their save.
      requireSubArea: form.showSubArea,
      houseNoLabel: form.houseNoField.label,
    });

    const merged = { ...newErrors, ...location.errors };
    setErrors(merged);
    scrollToFirstError(merged);
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
  /**
   * Fills the town, sub-area and street from a freshly placed pin.
   *
   * Fire-and-forget, and silent on failure. The geocoder is an ENHANCEMENT here
   * exactly as it is in the confirm modal: the server answers `resolved: false`
   * to every request while it has no `LOCATIONIQ_API_KEY`, which is the
   * expected production state today, so "nothing happens" is the common path
   * and the form has to remain completable by hand. Nothing is disabled and no
   * spinner blocks anything.
   *
   * A NEW pin replaces the town and sub-area its predecessor produced — the
   * address moved, so answers derived from the old position no longer describe
   * it. A slow reply cannot cause that by accident: `seq` names the pin the
   * answer is about, and one about a superseded pin is dropped.
   */
  const prefillFromPin = async (
    latitude: string,
    longitude: string,
    seq: number,
  ) => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    try {
      const geo = await reverseGeocode(lat, lng, token || user?.token);
      const prefill = buildPrefill(geo, {
        // The user's chosen city scopes the lookup. It is passed as the SAVED
        // value so `buildPrefill` keeps it when the geocoder resolves nothing,
        // and `applyPinPrefill` ignores the city it returns either way — see
        // its comment for why a picked city is never overwritten by a pin.
        city: form.values.city,
        town: "",
        subArea: "",
        address: "",
      });
      form.applyPinPrefill(
        {
          town: prefill.town,
          subArea: prefill.subArea,
          street: prefill.street,
        },
        // Identifies the pin this answer is about. A reply that arrives after
        // the user has moved the pin again is discarded rather than applied to
        // a coordinate it never described.
        seq,
      );
    } catch {
      // reverseGeocode already swallows its own failures; this is belt and
      // braces so a prefill can never break a pin the user did place.
    }
  };

  /**
   * What the server said was still outstanding on the last successful PATCH,
   * or null. A ref rather than state: nothing renders from it, and it is read
   * once, immediately, by the alert that follows the save that set it.
   */
  const incompleteRef = useRef<string | null>(null);

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
        // Carried back to the caller so the success alert can say it. NOT
        // raised here: the save genuinely succeeded, and a second alert stacked
        // on the success one would read as a failure.
        incompleteRef.current = missingSentence(result.evaluation, {
          city: payload.city,
          town: payload.town,
          hasCoordinate: !!payload.latitude?.trim(),
        });
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
    incompleteRef.current = null;
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
        // The server can accept the save and still not consider the address
        // finished — it judges the structured record, this form judges its own
        // fields. Saying so beats a bare "success" the user later discovers was
        // not enough to book a pickup.
        alertOnce(
          "Success",
          incompleteRef.current
            ? `Profile updated. ${incompleteRef.current}`
            : "Profile updated successfully!",
          [{ text: "OK", onPress: () => router.replace("/(tabs)/profile") }],
        );
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
    // Present only for the fields the gate's checklist can route to.
    inputRef?: React.RefObject<TextInput | null>,
  ) => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>
        {label}<Text style={styles.asterisk}> *</Text>
      </Text>
      <TextInput
        ref={inputRef}
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
        maxLength={field === "phone" ? 11 : undefined}
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
          ref={scrollRef}
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
        <View style={styles.formContainer} ref={contentRef}>
          <View style={styles.profileIconContainer}>
            <LinearGradient
              colors={["#f8f9fa", "#e9ecef"]}
              style={styles.profileIconBackground}
            >
              <Ionicons name="person" size={60} color="#00528A" />
            </LinearGradient>
          </View>

          <View style={styles.formSection}>
            {renderInput(
              "userName",
              "Username",
              "Enter your username",
              "default",
              userNameRef,
            )}
            {renderInput(
              "email",
              "Email",
              "Enter your email",
              "email-address",
              emailRef,
            )}
            {renderInput(
              "phone",
              "Phone Number",
              "Enter your phone number",
              "phone-pad",
              phoneRef,
            )}

            {/* Anchor for the checklist's "Pickup address" row: the whole
                city/town/sub-area/house-number block is one question to a
                user, so the scroll target is its top, not any one input. */}
            <View ref={addressRef}>
              <LocationFields
                form={form}
                errors={errors}
                clearError={clearError}
                onOpenMap={() => setMapVisible(true)}
                pinRef={pinRef}
              />
            </View>
          </View>

          <MapPicker
            visible={mapVisible}
            initialLatitude={form.values.latitude}
            initialLongitude={form.values.longitude}
            city={form.values.city}
            town={form.values.town}
            province={form.values.province}
            onConfirm={(lat, lng, placement) => {
              const seq = form.confirmPin(lat, lng, placement);
              clearError("location");
              clearError("town");
              clearError("subArea");
              prefillFromPin(lat, lng, seq);
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
