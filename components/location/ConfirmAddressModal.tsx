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
import type { PinPlacement } from "@/utils/pinState";

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
  onConfirm: (
    payload: ReturnType<typeof buildLocationPayload>,
    /**
     * How the pin being saved was set, or null when this session did not
     * produce one. The HOST builds the structured patch and cannot know this —
     * it lives in the form — so it has to travel with the payload.
     */
    placement: PinPlacement | null,
  ) => Promise<void>;
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
      // The same condition twice, deliberately: this is both the suggestion
      // `area_overridden` is measured against AND the provenance `reset` needs
      // — a town the geocoder produced from the pin, not one the user chose.
      // Without it every correction of a geocoder mistake here would trip the
      // Issue 9 prompt, in the one screen that exists to collect them.
      const townIsGeocoded = !!(
        geo?.resolved &&
        geo.areaName &&
        prefill.town === geo.areaName
      );
      if (townIsGeocoded) {
        suggestedAreaRef.current = geo.areaName;
      }

      form.reset(
        {
          // Same fallback as Edit Profile (Issue 8). `buildPrefill` only
          // accepts a geocoded city the registry knows, so a prefill that
          // falls back to the SAVED city can be off-registry — and this modal
          // is exactly where a legacy user meets the mandatory province.
          province: user.province || "",
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
        // NULL, not "derived": nothing this session produced this coordinate,
        // it was rehydrated. `derived` maps to `legacy_string`/`unknown`, so
        // sending it would DOWNGRADE a pin the user had deliberately placed —
        // the P0-1 defect, restated in `buildLocationPatchPayload`'s own
        // comment about an absent key meaning "don't touch". A user who opens
        // this sheet to add a house number must not lose their pin's precision
        // as a side effect.
        null,
        { town: townIsGeocoded },
      );
      setPrefillReady(true);
    })();

    return () => {
      cancelledRef.current = true;
    };
    // Mount-only by design (see above); form.reset is a stable useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Re-derives the town and sub-area after "Adjust pin".
   *
   * The mount effect above prefills from the SAVED coordinate; this is the same
   * question asked again about a coordinate the user has just moved. Without it
   * the modal keeps describing the old pin — which is the more misleading half
   * of the two, since this modal's entire claim is "here is where we think you
   * are, confirm it".
   *
   * `suggestedAreaRef` is updated in step, and only when the prefill actually
   * applied. It is what `area_overridden` measures prefill accuracy against, so
   * leaving it pointing at a suggestion made for a superseded pin would report
   * overrides nobody performed. A new pin that resolves to nothing clears it:
   * no suggestion was made, so no override is possible.
   */
  const prefillFromAdjustedPin = async (
    latitude: string,
    longitude: string,
    seq: number,
  ) => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    try {
      const geo = await reverseGeocode(lat, lng, token || user?.token);
      if (cancelledRef.current) return;
      const prefill = buildPrefill(geo, {
        // Scoped to the city on the form — the user's own answer, and the one
        // thing that makes a bare block name unambiguous. Saved town/sub-area
        // are deliberately not passed: this asks what the NEW pin says, and
        // `applyPinPrefill` decides what may be replaced.
        city: form.values.city,
        town: "",
        subArea: "",
        address: "",
      });
      const applied = form.applyPinPrefill(
        {
          town: prefill.town,
          subArea: prefill.subArea,
          street: prefill.street,
        },
        seq,
      );
      if (applied) suggestedAreaRef.current = prefill.town || null;
    } catch {
      // reverseGeocode swallows its own failures; this guarantees an adjusted
      // pin is never lost to a prefill that went wrong.
    }
  };

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
      await onConfirm(buildLocationPayload(form.values), form.placementRef.current);
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
                // Reachable here, contrary to first appearances (Issue 9). The
                // prompt is suppressed in this modal only when the geocoder
                // PRODUCED the town — `reset` is told so via `derived.town`.
                // When the lookup fails or returns a town that is not canonical
                // for the user's city, `buildPrefill` falls back to their SAVED
                // town, nothing derived it, the pin is rehydrated, and the edit
                // is genuinely ambiguous again. Without this the "I've moved"
                // answer would clear the pin and open nothing.
                onOpenMap={() => setMapVisible(true)}
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
        province={form.values.province}
        onConfirm={(lat, lng, placement) => {
          const seq = form.confirmPin(lat, lng, placement);
          setErrors((p) => ({ ...p, location: "", town: "", subArea: "" }));
          prefillFromAdjustedPin(lat, lng, seq);
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
