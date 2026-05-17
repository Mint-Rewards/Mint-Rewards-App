// import * as AuthSession from 'expo-auth-session';
// import * as WebBrowser from 'expo-web-browser';

// WebBrowser.maybeCompleteAuthSession();

// const GOOGLE_CLIENT_ID = '490896222696-4jtrnrbi9uhn98q2ukjb68f2cd45dq2v.apps.googleusercontent.com';

// const discovery = {
//   authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
//   tokenEndpoint: 'https://oauth2.googleapis.com/token',
//   revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
// };

// const redirectUri = 'https://auth.expo.io/@mint-rewards/mint-rewards';

// // const redirectUri = AuthSession.makeRedirectUri({
// //   scheme: 'mint-rewards',
// //   path: 'auth',
// // });

// export const useGoogleAuth = () => {
//   const [request, response, promptAsync] = AuthSession.useAuthRequest(
//     {
//       clientId: GOOGLE_CLIENT_ID,
//       redirectUri,
//       scopes: ['openid', 'profile', 'email'],
//       responseType: AuthSession.ResponseType.Code,
//       usePKCE: false,
//     },
//     discovery
//   );

//   return { request, response, promptAsync, redirectUri };
// };

// export const fetchGoogleUser = async (accessToken: string) => {
//   const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
//     headers: { Authorization: `Bearer ${accessToken}` },
//   });
//   return res.json();
// };

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
    iosClientId: '490896222696-4jtrnrbi9uhn98q2ukjb68f2cd45dq2v.apps.googleusercontent.com',
    webClientId: '490896222696-3umgevhg0eqtkg03cfs7saa19i0g8qir.apps.googleusercontent.com',
    offlineAccess: true,
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