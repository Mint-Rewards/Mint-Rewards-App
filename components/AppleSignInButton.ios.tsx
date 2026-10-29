import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  onCredential: (credential: AppleAuthentication.AppleAuthenticationCredential) => void;
  onError: (error: unknown) => void;
  disabled?: boolean;
  buttonType?: AppleAuthentication.AppleAuthenticationButtonType;
  /**
   * Draws our own button reading just "Apple", instead of Apple's.
   *
   * WHAT THIS GIVES UP, because it is not free. The system button is
   * guaranteed to have an Apple-approved appearance, translates its own title
   * into the device language, and carries its own VoiceOver label. A custom
   * one has to do all three by hand, and Apple's Human Interface Guidelines
   * permit custom buttons only when they follow the branding rules — an
   * approved title, the official logo, approved colours and proportions.
   *
   * "Apple" on its own is not one of the titles Apple lists. The three the
   * system offers are "Sign in with", "Continue with" and "Sign up with
   * Apple". This reads correctly only because the divider above it says
   * "or signup with", which completes the phrase — but a reviewer looking at
   * the button alone will not see that.
   *
   * SO: fine for the preview builds QA uses, and a decision to take
   * deliberately before an App Store submission. Passing `compact={false}`
   * returns the system button with no other change.
   */
  compact?: boolean;
}

export default function AppleSignInButton({
  onCredential,
  onError,
  disabled,
  buttonType = AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN,
  compact = false,
}: Props) {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setIsSupported);
  }, []);

  if (!isSupported) return null;

  // One flow for both buttons, so the custom one cannot drift from the
  // system one in what it actually requests or how it handles a cancel.
  const start = async () => {
    if (disabled) return;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      onCredential(credential);
    } catch (error: any) {
      // Backing out is not a failure and must not raise a dialog.
      if (error.code === 'ERR_REQUEST_CANCELED') return;
      onError(error);
    }
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.custom, disabled && styles.disabled]}
        onPress={start}
        disabled={disabled}
        activeOpacity={0.9}
        accessibilityRole="button"
        /* The system button supplies this itself; a custom one must say what
           it does rather than leave a screen reader announcing "Apple". */
        accessibilityLabel="Sign up with Apple"
      >
        <View style={styles.content}>
          <Ionicons name="logo-apple" size={20} color="#ffffff" />
          <Text style={styles.label} numberOfLines={1}>
            Apple
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={buttonType}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={20}
      style={{ width: '100%', height: 52 }}
      onPress={start}
    />
  );
}

/*
 * Matched to googleButton deliberately: same height, same radius, same font
 * size and weight. The pair reads as one control split in two, which is the
 * whole reason for drawing this one by hand.
 */
const styles = StyleSheet.create({
  custom: {
    height: 52,
    borderRadius: 20,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  disabled: { opacity: 0.38 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontSize: 18,
    fontWeight: '500',
    color: '#ffffff',
    letterSpacing: 0.25,
  },
});
