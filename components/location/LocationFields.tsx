/**
 * The location fieldset: city, town, sub-area, house number, street.
 *
 * Rendered by BOTH `app/editProfile.tsx` and the confirm-address modal, driven
 * by `useLocationForm`. Neither host owns any cascade logic — that is the point.
 *
 * Province is absent on purpose. It is derived from the city at save time
 * (`resolveProvinceForPayload`), because every registry city belongs to exactly
 * one province and an editable field would let someone save an impossible pair.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LocationPicker } from "@/components/ui/LocationPicker";
import type { LocationFormApi } from "@/hooks/useLocationForm";
import { OTHER_TEXT_MAX } from "@/hooks/useLocationForm";
import { OTHER_OPTION } from "@/utils/locationForm";

interface Props {
  form: LocationFormApi;
  errors: Record<string, string>;
  clearError: (field: string) => void;
  /** Renders the pin row and its error. Hosts that show their own map pass false. */
  showPinRow?: boolean;
  /**
   * Renders the province filter above the city picker.
   *
   * True everywhere today, including the confirm modal (owner request,
   * 2026-08-26). It was briefly false there on the reasoning that the sheet
   * arrives with a city already resolved from the pin — but a resolved city can
   * be the WRONG city, and correcting it in a 58-entry list without the filter
   * is the harder half of the job, not the easier one.
   *
   * The prop stays because the sheet is space-constrained and a future host may
   * want the leaner form.
   */
  showProvince?: boolean;
  onOpenMap?: () => void;
  /** Street address is optional; a host with no room for it can hide it. */
  showStreet?: boolean;
  /**
   * Anchor for the pin row, so a host that scrolls can bring it into view.
   *
   * The pin is the one checklist destination with nothing focusable in it — it
   * is a button, not an input — so a host cannot reach it with `.focus()` the
   * way it can the name or phone fields. Handing out the ref is the smallest
   * thing that lets the host scroll to it without this component learning
   * anything about scrolling.
   */
  pinRef?: React.RefObject<View | null>;
}

export function LocationFields({
  form,
  errors,
  clearError,
  showPinRow = true,
  showProvince = true,
  onOpenMap,
  showStreet = true,
  pinRef,
}: Props) {
  const { values } = form;

  const suggestions = (list: string[], onPick: (v: string) => void) => {
    if (list.length === 0) return null;
    return (
      <View style={styles.suggestionBox}>
        <Text style={styles.suggestionHeading}>Did you mean</Text>
        {list.map((suggestion) => (
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

  return (
    <View>
      {/* ── Province — a FILTER, never a saved answer ────────────────────────
          It narrows a 58-entry city list to something scannable. The province
          that is SAVED is derived from the chosen city in
          `buildLocationPayload`, which is what keeps an impossible pair like
          Karachi/Punjab off the server. Optional on purpose: leaving it blank
          offers every city, so nobody is trapped behind it. */}
      {showProvince ? (
      <LocationPicker
        label="Province"
        placeholder="All provinces"
        options={form.provinceOptions}
        value={values.province}
        onChange={(province) => {
          form.selectProvince(province);
          clearError("city");
          clearError("town");
        }}
        testID="province-picker"
      />
      ) : null}

      <LocationPicker
        label="City"
        required
        placeholder="Select city"
        options={form.cityOptions}
        value={values.city}
        onChange={(city) => {
          form.selectCity(city);
          clearError("city");
          clearError("town");
        }}
        hasError={!!errors.city}
        error={errors.city}
        testID="city-picker"
      />

      {/* ── Pin — placed BEFORE the fields it fills in ──────────────────────
          Third in the order, and that position is the design: the map has a
          city to open on (`getSelectionRegion` aims at the city centroid), and
          the pin then supplies the town, sub-area and street below it via
          `applyPinPrefill`. Placing it after those fields would ask the user
          for the same answers twice — and placing it FIRST would leave the map
          opening on the whole country, since there would be no city to aim at.

          The fields below stay editable, and stay answerable by hand: a
          geocoder that resolves nothing (the state whenever the server has no
          LOCATIONIQ_API_KEY) leaves them exactly as the user left them. */}
      {showPinRow ? (
        <View style={styles.group} ref={pinRef}>
          <Text style={styles.label}>
            Exact Location (Pin)<Text style={styles.asterisk}> *</Text>
          </Text>
          <TouchableOpacity
            style={styles.pinBtn}
            onPress={onOpenMap}
            activeOpacity={0.8}
            disabled={!values.city}
          >
            <Ionicons
              name={values.latitude ? "location" : "location-outline"}
              size={20}
              color={values.city ? "#00528A" : "#a0aec0"}
            />
            <Text style={[styles.pinText, !values.city && styles.pinTextDisabled]}>
              {values.latitude && values.longitude
                ? `${parseFloat(values.latitude).toFixed(5)}, ${parseFloat(values.longitude).toFixed(5)}`
                : values.city
                  ? "Set location on map"
                  : "Select city first"}
            </Text>
            {values.latitude ? (
              <TouchableOpacity
                onPress={form.clearPin}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#a0aec0" />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#a0aec0" />
            )}
          </TouchableOpacity>
          {errors.location ? (
            <Text style={styles.errorText}>{errors.location}</Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Town ─────────────────────────────────────────────────────────── */}
      <View style={styles.group}>
        {form.townIsCustom ? (
          <>
            <Text style={styles.label}>
              Town<Text style={styles.asterisk}> *</Text>
            </Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.rowInput, errors.town && styles.inputError]}
                value={values.townOther}
                // Writes to `townOther` but clears the `town` error — both fields
                // satisfy the same "Town is required" rule.
                onChangeText={(v) => {
                  form.setValue("townOther", v);
                  clearError("town");
                }}
                placeholder="Enter your town"
                placeholderTextColor="#a0aec0"
                autoCapitalize="words"
                maxLength={OTHER_TEXT_MAX}
              />
              <TouchableOpacity style={styles.backBtn} onPress={form.backToTownList}>
                <Ionicons name="list" size={20} color="#00528A" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          // `value` is the STORED town, which may be a deprecated entry absent
          // from `options` — the picker displays it, but it cannot be re-picked.
          <LocationPicker
            label="Town"
            required
            placeholder={values.city ? "Select town" : "Select city first"}
            options={form.townOptions}
            value={values.town}
            onChange={(town) => {
              if (town === OTHER_OPTION) form.useCustomTown();
              else form.selectTown(town);
              clearError("town");
            }}
            disabled={!values.city}
            hasError={!!errors.town}
            containerStyle={styles.noGap}
            testID="town-picker"
          />
        )}

        {suggestions(form.townSuggestions, (town) => {
          form.selectTown(town);
          clearError("town");
        })}

        {errors.town ? <Text style={styles.errorText}>{errors.town}</Text> : null}
        <Text style={styles.hint}>
          {form.townIsCustom
            ? "Tap the list icon to choose from available towns instead"
            : `Select "${OTHER_OPTION}" if your town isn't listed`}
        </Text>
      </View>

      {/* ── Sub-area ─────────────────────────────────────────────────────── */}
      {form.showSubArea ? (
        <View style={styles.group}>
          <LocationPicker
            label={form.blockLabel}
            required
            placeholder={`Select ${form.blockLabel.toLowerCase()}`}
            options={form.subAreaOptions}
            value={form.subAreaIsOther ? OTHER_OPTION : values.subArea}
            onChange={(value) => {
              if (value === OTHER_OPTION) form.useCustomSubArea();
              else form.selectSubArea(value);
              clearError("subArea");
            }}
            hasError={!!errors.subArea}
            containerStyle={styles.noGap}
            testID="subarea-picker"
          />

          {form.subAreaIsOther ? (
            <TextInput
              style={[styles.input, styles.stacked]}
              value={values.subAreaOther}
              onChangeText={(v) => {
                form.setValue("subAreaOther", v);
                clearError("subArea");
              }}
              placeholder={`Enter your ${form.blockLabel.toLowerCase()}`}
              placeholderTextColor="#a0aec0"
              autoCapitalize="words"
              maxLength={OTHER_TEXT_MAX}
            />
          ) : null}

          {suggestions(form.subAreaSuggestions, (value) => {
            form.selectSubArea(value);
            clearError("subArea");
          })}

          {errors.subArea ? <Text style={styles.errorText}>{errors.subArea}</Text> : null}
          <Text style={styles.hint}>
            {form.subAreaIsOther
              ? "We'll review entries like yours and add common ones to the list"
              : `Select "${OTHER_OPTION}" if yours isn't listed`}
          </Text>
        </View>
      ) : null}

      {/* ── House number — the one field a geocoder can never supply ──────── */}
      <View style={styles.group}>
        <Text style={styles.label}>
          {form.houseNoField.label}
          <Text style={styles.asterisk}> *</Text>
        </Text>
        <TextInput
          style={[styles.input, errors.houseNo && styles.inputError]}
          value={values.houseNo}
          onChangeText={(v) => {
            form.setValue("houseNo", v);
            clearError("houseNo");
          }}
          placeholder={`e.g. ${form.houseNoField.placeholder}`}
          placeholderTextColor="#a0aec0"
          autoCapitalize="characters"
          maxLength={OTHER_TEXT_MAX}
        />
        {errors.houseNo ? <Text style={styles.errorText}>{errors.houseNo}</Text> : null}
      </View>

      {showStreet ? (
        <View style={styles.group}>
          <Text style={styles.label}>Street Address</Text>
          <TextInput
            style={styles.input}
            value={values.address}
            onChangeText={(v) => form.setValue("address", v)}
            placeholder="e.g. Main Boulevard"
            placeholderTextColor="#a0aec0"
          />
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 20 },
  noGap: { marginBottom: 0 },
  pinTextDisabled: { color: "#a0aec0" },
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
  stacked: { marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowInput: { flex: 1 },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8f9fa",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { color: "#e53e3e", fontSize: 14, marginTop: 4 },
  hint: { fontSize: 13, color: "#718096", marginTop: 6 },
  suggestionBox: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8f9fa",
    paddingVertical: 6,
  },
  suggestionHeading: {
    fontSize: 12,
    color: "#718096",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestionText: { fontSize: 15, color: "#2d3748" },
  pinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pinText: { flex: 1, fontSize: 15, color: "#2d3748" },
});
