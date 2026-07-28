import { Alert, Dimensions } from "react-native";
import { ENV } from "@/config/env";

const { width, height } = Dimensions.get("window");

// Size configuration utility
export const SizeConfig = {
  blockSizeHorizontal: width / 100,
  blockSizeVertical: height / 100,
  fontSize: width / 100,
};

// API Base URL — resolved and validated in config/env.ts. Re-exported here so
// the existing import sites keep working; new code should import from
// "@/config/env" directly.
export const API_BASE_URL = ENV.apiUrl;

// App Constants
export const Constants = {
  appThemeColor: "#449EB2", // Green color matching the design

  showDialog: (message: string) => {
    Alert.alert("Mint Rewards", message);
  },

  appUser: {
    isAdmin: false,
    // Add other user properties as needed
  },
};

// Utility functions
export const Utils = {
  isEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  validatePassword: (password: string): boolean => {
    return password.length >= 8;
  },
};
