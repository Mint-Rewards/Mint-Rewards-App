import { ENV } from "@/config/env";

// Loaded lazily so a missing native binary doesn't crash the whole app at
// module evaluation time (same pattern used for expo-print).
let GoogleSignin: any;
let statusCodes: any;

try {
  const lib = require('@react-native-google-signin/google-signin');
  GoogleSignin = lib.GoogleSignin;
  statusCodes = lib.statusCodes;
} catch {
  console.warn('[googleAuth] RNGoogleSignin native module not found — rebuild the app with `cd ios && pod install && cd .. && npx expo run:ios`');
}

export const configureGoogleSignIn = () => {
  if (!GoogleSignin) return;
  GoogleSignin.configure({
    // iosClientId: ENV.googleIosClientId,
    // webClientId: ENV.googleWebClientId,
    iosClientId: "78392867949-3jjb4h3kmf5c4bnjun1qg3vitfgtvlqd.apps.googleusercontent.com",
    webClientId: "78392867949-dsbi2ttj54l3gomb3n112i3itfjt382t.apps.googleusercontent.com",
    offlineAccess: false,
    scopes: ['profile', 'email'],
  });
};

export const signInWithGoogle = async () => {
  if (!GoogleSignin) {
    return { success: false, error: 'Google Sign-In is not available on this build.' };
  }
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    return { success: true, data: response.data };
  } catch (error: any) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { success: false, error: 'cancelled' };
    } else if (error.code === statusCodes.IN_PROGRESS) {
      return { success: false, error: 'in_progress' };
    }
    return { success: false, error: error.message };
  }
};

export const signOutGoogle = async () => {
  if (!GoogleSignin) return { success: true };
  try {
    await GoogleSignin.signOut();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};