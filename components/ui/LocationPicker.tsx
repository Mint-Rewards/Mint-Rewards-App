import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  FlatList,
  Modal,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Constants } from "../../utils/constants";

interface LocationPickerProps {
  label: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testID?: string;
  hasError?: boolean;
  /** Renders the required-field asterisk after the label. */
  required?: boolean;
  /** Validation message rendered under the selector. */
  error?: string;
  /**
   * Overrides the group's own spacing. Callers that render their own footer
   * (hints, suggestions, a shared error line) pass `{ marginBottom: 0 }` so the
   * group's gap doesn't detach that footer from the field.
   */
  containerStyle?: StyleProp<ViewStyle>;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  testID,
  hasError = false,
  required = false,
  error,
  containerStyle,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <View style={[styles.inputGroup, containerStyle]}>
      <Text style={styles.inputLabel}>
        {label}
        {required && <Text style={styles.asterisk}> *</Text>}
      </Text>

      {/* Trigger button */}
      <TouchableOpacity
        testID={testID}
        style={[
          styles.selector,
          hasError && styles.inputError,
          disabled && styles.selectorDisabled,
        ]}
        onPress={() => !disabled && setIsOpen(true)}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <Text
          style={[styles.selectorText, !value && styles.placeholderText]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color={disabled ? "#CCCCCC" : "#666666"}
        />
      </TouchableOpacity>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {/* Modal dropdown */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => {
            setIsOpen(false);
            setSearch("");
          }}
        >
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select {label}</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsOpen(false);
                  setSearch("");
                }}
              >
                <Ionicons name="close" size={22} color="#333333" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={16} color="#999999" />
              <TextInput
                style={styles.searchInput}
                placeholder={`Search ${label.toLowerCase()}...`}
                placeholderTextColor="#999999"
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={16} color="#999999" />
                </TouchableOpacity>
              )}
            </View>

            {/* Options list */}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item}
              style={styles.list}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>No results found</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.option,
                    item === value && styles.optionSelected,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      item === value && styles.optionTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                  {item === value && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={Constants.appThemeColor}
                    />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  // The tokens below mirror app/editProfile.tsx's form fields so this picker
  // sits in the same visual language as the inputs above and below it.
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d3748",
    marginBottom: 8,
  },
  asterisk: {
    color: "#e53e3e",
    fontWeight: "700",
  },
  selector: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#f8f9fa",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectorDisabled: {
    backgroundColor: "#f1f3f5",
    borderColor: "#edf2f7",
  },
  inputError: {
    borderColor: "#e53e3e",
    backgroundColor: "#fef5f5",
  },
  selectorText: {
    fontSize: 16,
    color: "#2d3748",
    flex: 1,
  },
  placeholderText: {
    color: "#a0aec0",
  },
  errorText: {
    color: "#e53e3e",
    fontSize: 14,
    marginTop: 4,
  },
  // Modal styles
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    maxHeight: "65%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333333",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F5F5F5",
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#333333",
    padding: 0,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  optionSelected: {
    backgroundColor: "#F0FBF5",
    marginHorizontal: -4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  optionText: {
    fontSize: 16,
    color: "#333333",
  },
  optionTextSelected: {
    color: Constants.appThemeColor,
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    color: "#999999",
    fontSize: 15,
    paddingVertical: 24,
  },
});