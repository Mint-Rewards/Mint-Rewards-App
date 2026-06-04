import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';

interface Props {
  onCredential: (credential: AppleAuthentication.AppleAuthenticationCredential) => void;
  onError: (error: unknown) => void;
  disabled?: boolean;
  buttonType?: AppleAuthentication.AppleAuthenticationButtonType;
}

export default function AppleSignInButton({ onCredential, onError, disabled, buttonType = AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN }: Props) {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setIsSupported);
  }, []);

  if (!isSupported) return null;

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={buttonType}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={20}
      style={{ width: '100%', height: 52 }}
      onPress={async () => {
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
          if (error.code === 'ERR_REQUEST_CANCELED') return;
          onError(error);
        }
      }}
    />
  );
}
