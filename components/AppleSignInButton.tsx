import type { AppleAuthenticationCredential, AppleAuthenticationButtonType } from 'expo-apple-authentication';

interface Props {
  onCredential: (credential: AppleAuthenticationCredential) => void;
  onError: (error: unknown) => void;
  disabled?: boolean;
  buttonType?: AppleAuthenticationButtonType;
}

export default function AppleSignInButton(_props: Props) {
  return null;
}
