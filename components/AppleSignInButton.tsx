import type { AppleAuthenticationCredential, AppleAuthenticationButtonType } from 'expo-apple-authentication';

interface Props {
  onCredential: (credential: AppleAuthenticationCredential) => void;
  onError: (error: unknown) => void;
  disabled?: boolean;
  buttonType?: AppleAuthenticationButtonType;
  /** iOS only — see AppleSignInButton.ios.tsx. Ignored elsewhere. */
  compact?: boolean;
}

export default function AppleSignInButton(_props: Props) {
  return null;
}
