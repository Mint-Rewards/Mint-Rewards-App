import React from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const ConfirmationModal = ({
  visible,
  title,
  message,
  confirmText = "Confirm",
  loading = false,
  onCancel,
  onConfirm,
}: Props) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onCancel}
  >
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="warning" size={28} color="#E8820C" />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
            onPress={onConfirm}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.confirmText}>{confirmText}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFF4E5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#ddd",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#0C4A52",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
});

export default ConfirmationModal;
