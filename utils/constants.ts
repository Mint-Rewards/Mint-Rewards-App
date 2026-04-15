import { Alert, Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

// Size configuration utility
export const SizeConfig = {
  blockSizeHorizontal: width / 100,
  blockSizeVertical: height / 100,
  fontSize: width / 100,
};

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
