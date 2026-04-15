import Navbar from "@/components/ui/navbar";
import { useAppStore } from "@/store/store";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const StoreScreen = () => {
  const { user } = useAppStore();
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Navbar user={user} />

      {/* Main Content */}
      <View style={styles.content}>
        <View style={styles.comingSoonContainer}>
          {/* Illustration */}
          <View style={styles.illustrationContainer}>
            <LinearGradient
              colors={["#f8f9fa", "#e9ecef"]}
              style={styles.illustrationBackground}
            >
              <Ionicons name="storefront-outline" size={80} color="#00528A" />
            </LinearGradient>

            {/* Decorative elements */}
            <View style={styles.sparkleContainer}>
              <Ionicons
                name="bag"
                size={16}
                color="#FFD700"
                style={styles.sparkle1}
              />
              <Ionicons
                name="card"
                size={12}
                color="#FF69B4"
                style={styles.sparkle2}
              />
              <Ionicons
                name="pricetag"
                size={14}
                color="#00CED1"
                style={styles.sparkle3}
              />
            </View>
          </View>

          {/* Text Content */}
          <View style={styles.textContainer}>
            <Text style={styles.title}>Store Coming Soon! 🚀</Text>
            <Text style={styles.subtitle}>
              We&apos;re building something amazing for you.
            </Text>
            <Text style={styles.description}>
              Get ready to shop for exclusive eco-friendly products, redeem
              rewards, and discover sustainable lifestyle items!
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push("/(tabs)/home")}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#00528A", "#00528A"]}
                style={styles.gradientButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="home" size={20} color="#ffffff" />
                <Text style={styles.primaryButtonText}>Back to Home</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  headerSection: {
    backgroundColor: "#ffffff",
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    zIndex: 10,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 14,
    opacity: 0.9,
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
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
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    marginLeft: 15,
    borderColor: "#b1b1b1ff",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  comingSoonContainer: {
    alignItems: "center",
    maxWidth: 320,
  },
  illustrationContainer: {
    position: "relative",
    marginBottom: 40,
  },
  illustrationBackground: {
    width: 160,
    height: 160,
    borderRadius: 80,
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
  sparkleContainer: {
    position: "absolute",
    width: 200,
    height: 200,
    top: -20,
    left: -20,
  },
  sparkle1: {
    position: "absolute",
    top: 20,
    right: 30,
  },
  sparkle2: {
    position: "absolute",
    bottom: 40,
    left: 20,
  },
  sparkle3: {
    position: "absolute",
    top: 60,
    left: 30,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2d3748",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#4a5568",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 24,
  },
  description: {
    fontSize: 14,
    color: "#718096",
    textAlign: "center",
    lineHeight: 22,
  },
  actionButtons: {
    width: "100%",
    marginBottom: 40,
  },
  primaryButton: {
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
  gradientButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
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
  secondaryButtonText: {
    color: "#00528A",
    fontSize: 16,
    fontWeight: "600",
  },
  featuresContainer: {
    width: "100%",
    backgroundColor: "#f8f9fa",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d3748",
    marginBottom: 16,
    textAlign: "center",
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    color: "#4a5568",
    flex: 1,
  },
});

export default StoreScreen;
