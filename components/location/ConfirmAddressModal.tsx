/**
 * "Just your house no." — the gate a user meets when they HAVE a saved pin.
 *
 * The pin is the discriminator: someone with a coordinate is asked to confirm
 * the address derived from it (reverse-geocoded where the geocoder resolves,
 * their own saved values where it does not) and to add the one field no
 * geocoder can know — the house number. Everything is editable: the mockup's
 * locked rows and FROM PIN chip were rejected against the standing project
 * constraint and the owner's own "all fields editable".
 *
 * Copy carries no points. The mockup's "Save & earn 50" promises an award that
 * does not exist anywhere in either repo; the CTA is "Save" until it does
 * (owner decision, 2026-08-25).
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapPicker from "@/components/ui/MapPicker";
import { LocationFields } from "@/components/location/LocationFields";
import { useLocationForm } from "@/hooks/useLocationForm";
import { useAppStore } from "@/store/store";
import { trackAreaOverridden } from "@/utils/locationAnalytics";
import {
  buildPrefill,
  reverseGeocode,
} from "@/utils/locationPrefill";
import {
  buildLocationPayload,
  validateLocationValues,
} from "@/utils/locationSave";
import { requiresSubArea } from "@/utils/pakistan_areas";

interface Props {
  visible: boolean;
  /** Whether a "Not now" is offered. False under a "hard" gate. */
  dismissible: boolean;
  onDismiss: () => void;
  /**
   * Called with the normalized payload once the user confirms. The HOST owns
   * the save (update-profile + structured PATCH + evaluation): this modal owns
   * only the questions, so the save flow exists in exactly one place.
   */
  onConfirm: (payload: ReturnType<typeof buildLocationPayload>) => Promise<void>;
}

export function ConfirmAddressModal({
  visible,
  dismissible,
  onDismiss,
  onConfirm,
}: Props) {
  const { user, token } = useAppStore();
  const form = useLocationForm();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mapVisible, setMapVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefillReady, setPrefillReady] = useState(false);

  /**
   * What the geocoder suggested, kept so an edit can be told apart from an
   * acceptance. `area_overridden` has shipped inert since b05efa2 — this is its
   * first call site, and it must only fire when a geocoded suggestion existed
   * and the user chose differently.
   */
  const suggestedAreaRef = useRef<string | null>(null);

  // Mutating a render-scoped local after render is a compiler error; a ref is
  // the sanctioned escape for "was this effect torn down".
  const cancelledRef = useRef(false);

  // Runs once per MOUNT, not per `visible` flip: the gate host renders this
  // modal only when its decision says so, so mounting is opening. That is what
  // lets the initial state (`prefillReady: false`, empty suggestion) BE the
  // reset — no synchronous setState in the effect body.
  useEffect(() => {
    if (!user) return;
    cancelledRef.current = false;

    (async () => {
      const lat = parseFloat(user.latitude || "");
      const lng = parseFloat(user.longitude || "");
      const geo =
        Number.isFinite(lat) && Number.isFinite(lng)
          ? await reverseGeocode(lat, lng, token || user.token)
          : null;
      if (cancelledRef.current) return;

      const prefill = buildPrefill(geo, user);
      if (geo?.resolved && geo.areaName && prefill.town === geo.areaName) {
        suggestedAreaRef.current = geo.areaName;
      }

      form.reset(
        {
          city: prefill.city,
          town: prefill.town,
          subArea: prefill.subArea,
          address: prefill.street,
          // The house number is rehydrated, never derived — it is the one
          // field a geocoder cannot know, which is why it is this modal's
          // headline.
          houseNo: user.structuredAddress?.houseNo || "",
          latitude: user.latitude || "",
          longitude: user.longitude || "",
        },
        // The redisplayed pin is a previously saved coordinate, not a fresh
        // deliberate placement — same ruling as MapPicker's open_with_saved.
        "derived",
      );
      setPrefillReady(true);
    })();

    return () => {
      cancelledRef.current = true;
    };
    // Mount-only by design (see above); form.reset is a stable useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    const result = validateLocationValues(form.values, {
      requireSubArea:
        !form.townIsCustom &&
        requiresSubArea(form.values.city, form.values.town),
      houseNoLabel: form.houseNoField.label,
    });
    setErrors(result.errors);
    if (!result.valid) return;

    // A suggestion existed and the user picked a different area: the exact
    // condition the override dashboard measures prefill accuracy with.
    if (
      suggestedAreaRef.current &&
      form.values.town &&
      form.values.town !== suggestedAreaRef.current
    ) {
      trackAreaOverridden({
        geocodedAreaName: suggestedAreaRef.current,
        selectedAreaName: form.values.town,
      });
    }

    setSaving(true);
    try {
      await onConfirm(buildLocationPayload(form.values));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android back routes through the same dismissal path as "Not now"; a
      // hard gate offers neither.
      onRequestClose={dismissible ? onDismiss : () => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Map strip: shows where the pin is, opens the full picker. */}
            <TouchableOpacity
              style={styles.mapStrip}
              onPress={() => setMapVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="location" size={22} color="#00528A" />
              <Text style={styles.mapStripText}>
                {form.values.latitude
                  ? `${parseFloat(form.values.latitude).toFixed(5)}, ${parseFloat(form.values.longitude).toFixed(5)}`
                  : "Set your pin"}
              </Text>
              <View style={styles.adjustChip}>
                <Text style={styles.adjustChipText}>Adjust pin</Text>
              </View>
            </TouchableOpacity>
            {errors.location ? (
              <Text style={styles.errorText}>{errors.location}</Text>
            ) : null}

            <Text style={styles.title}>Just your house no.</Text>
            <Text style={styles.subtitle}>
              We&apos;ve filled in your address from your pin — check it, fix
              anything that&apos;s off, and add your{" "}
              {form.houseNoField.label.toLowerCase()}.
            </Text>

            {prefillReady ? (
              <LocationFields
                form={form}
                errors={errors}
                clearError={(field) =>
                  setErrors((p) => ({ ...p, [field]: "" }))
                }
                // The map strip above is this modal's pin surface.
                showPinRow={false}
              />
            ) : (
              <Text style={styles.loading}>Checking your pin…</Text>
            )}

            <TouchableOpacity
              style={[styles.cta, (saving || !prefillReady) && styles.ctaDisabled]}
              onPress={handleSave}
              disabled={saving || !prefillReady}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{saving ? "Saving…" : "Save"}</Text>
            </TouchableOpacity>

            {dismissible ? (
              <TouchableOpacity
                onPress={onDismiss}
                style={styles.skip}
                accessibilityRole="button"
              >
                <Text style={styles.skipText}>Not now</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </View>

      <MapPicker
        visible={mapVisible}
        initialLatitude={form.values.latitude}
        initialLongitude={form.values.longitude}
        city={form.values.city}
        town={form.values.town}
        onConfirm={(lat, lng, placement) => {
          form.confirmPin(lat, lng, placement);
          setErrors((p) => ({ ...p, location: "" }));
        }}
        onClose={() => setMapVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 30,
    maxHeight: "88%",
  },
  mapStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E7F3EE",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 18,
  },
  mapStripText: { flex: 1, fontSize: 15, color: "#2d3748" },
  adjustChip: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  adjustChipText: { fontSize: 13, fontWeight: "600", color: "#00528A" },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1a202c",
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  subtitle: { fontSize: 15, color: "#4a5568", lineHeight: 22, marginBottom: 18 },
  loading: { fontSize: 15, color: "#718096", paddingVertical: 24 },
  errorText: { color: "#e53e3e", fontSize: 14, marginTop: -10, marginBottom: 12 },
  cta: {
    backgroundColor: "#00528A",
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: "center",
    marginTop: 6,
  },
  ctaDisabled: { backgroundColor: "#a0aec0" },
  ctaText: { fontSize: 17, fontWeight: "700", color: "#FFFFFF" },
  skip: { alignItems: "center", paddingTop: 14 },
  skipText: { fontSize: 15, color: "#718096" },
});
