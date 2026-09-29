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
    // Must come from the environment, not a literal. app.config.js derives the
    // native iosUrlScheme from this same GOOGLE_IOS_CLIENT_ID, so a hardcoded
    // value here disagrees with the scheme compiled into any build whose
    // variant differs — which is why the production client ID sitting here
    // made Google Sign-In fail on every dev build with "missing support for
    // the following URL schemes".
    iosClientId: ENV.googleIosClientId,
    webClientId: ENV.googleWebClientId,
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