import { useAppStore } from "@/store/store";
import { userFromAuth } from "@/utils/userFromAuth";
import { configureGoogleSignIn, signInWithGoogle } from "@/utils/googleAuth";
import AppleSignInButton from "@/components/AppleSignInButton";
import OtpInput from "@/components/OtpInput";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { usePostHog, useFeatureFlag } from "posthog-react-native";
import {
  AppState,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { Constants, Utils, API_BASE_URL } from "../utils/constants";
import SecurityQuestionFields, {
  type SecurityQuestion,
} from "@/components/SecurityQuestionFields";
import { normalizePhone, pinShapeError, PIN_LENGTH } from "../utils/phoneNumber";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordHint,
} from "../utils/password";
import { AppleAuthenticationButtonType } from 'expo-apple-authentication';
import type { AppleAuthenticationCredential } from 'expo-apple-authentication';

const GoogleIcon = ({ size = 20, opacity = 1 }: { size?: number; opacity?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill={`rgba(234,67,53,${opacity})`} d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill={`rgba(66,133,244,${opacity})`} d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill={`rgba(251,188,5,${opacity})`} d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill={`rgba(52,168,83,${opacity})`} d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

/** How much of the field to leave visible above the keyboard. */
const FIELD_SCROLL_MARGIN = 90;
/** Long enough for the keyboard to start animating and the layout to settle. */
const FIELD_SCROLL_DELAY_MS = 120;

const RegisterScreen = () => {
  const [name, setName] = useState("");
  const insets = useSafeAreaInsets();

  /*
   * SCROLLING THE FOCUSED FIELD CLEAR OF THE KEYBOARD, which on Android
   * nothing else does.
   *
   * The KeyboardAvoidingView below is given no `behavior` on Android — there
   * `padding` fights the system's own windowSoftInputMode and `height`
   * collapses the layout — so on Android it is inert and the lower half of
   * this form sits under the keyboard. QA reported Confirm PIN, which is the
   * lowest control on the phone tab.
   *
   * Same remedy as Edit Profile: measure where the control is and scroll it
   * into view. Everything is optional-chained and the failure callback is a
   * no-op, because a measurement that cannot be taken must still leave a
   * usable form.
   */
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const pinRef = useRef<View>(null);
  const confirmPinRef = useRef<View>(null);

  const scrollIntoView = (anchor: React.RefObject<View | TextInput | null>) => {
    setTimeout(() => {
      const target = anchor.current;
      const content = contentRef.current;
      if (!target || !content) return;
      target.measureLayout(
        content,
        (_x, y) =>
          scrollRef.current?.scrollTo({
            y: Math.max(0, y - FIELD_SCROLL_MARGIN),
            animated: true,
          }),
        () => {},
      );
    }, FIELD_SCROLL_DELAY_MS);
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hidePassword, setHidePassword] = useState(true);

  /*
   * Re-mask the password whenever the app leaves the foreground.
   *
   * Everything on this screen is ordinary component state, and pressing Back
   * on Android backgrounds the app rather than closing it — the screen stays
   * mounted and comes back exactly as it was. For the typed password that is
   * fine, because the field is masked. For the eye toggle it is not: reveal
   * the password, take a call, and it is still in plain text on return, for
   * whoever is holding the phone. The Android recents snapshot captures it
   * too.
   *
   * Only the toggle is reset. Clearing what they typed would punish anyone
   * who checks a notification mid-login, and masked text leaks nothing.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") setHidePassword(true);
    });
    return () => sub.remove();
  }, []);
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  /*
   * Phone is the default tab. Most new users have a number and no email, and
   * the tab somebody lands on is the one most of them will use.
   *
   * `name` is shared across both tabs on purpose: switching tabs to compare
   * them should not throw away something already typed.
   */
  const [authTab, setAuthTab] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);

  /*
   * SIGNING UP WITH A NUMBER IS TWO STEPS, and the second one is not optional.
   *
   * A phone-number account has no email address, so if its owner forgets the
   * PIN there is no reset link to send — the security question is the only
   * recovery route that does not need a human on the other end. Asking for it
   * before the account is created means an account never exists that its owner
   * cannot get back into.
   *
   * It is collected here rather than after signing in because there is no
   * session yet by design: this endpoint returns no token, and the new account
   * proves itself at the login screen with the PIN it just chose. Everything
   * goes to the server in ONE request, which writes account, PIN and question
   * in a single transaction.
   */
  const [phoneStep, setPhoneStep] = useState<"details" | "question">("details");
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [questionsError, setQuestionsError] = useState(false);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  const { signUp } = useAppStore();
  const posthog = usePostHog();
  // Default to enabled (!== false) so buttons don't flicker/hide while flags are still loading.
  const googleSignInEnabled = useFeatureFlag("google-signin-enabled") !== false;
  const appleSignInEnabled = useFeatureFlag("apple-signin-enabled") !== false;

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    try {
      configureGoogleSignIn();
      const result = await signInWithGoogle();

      if (result.success && result.data) {
        const { idToken } = result.data;

        // `signup`, so this screen keeps its find-or-create behaviour: a
        // person who already has an account and taps Sign Up with Google is
        // signed in rather than refused.
        const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, intent: "signup" }),
        });

        const data = await res.json();

        if (data.Status === "Success") {
          const userData = data.data;
          const user = userFromAuth(userData, {
            token: userData.token || "",
            picture: userData.picture,
          });

          useAppStore.setState({ user, token: userData.token || null });
          await SecureStore.setItemAsync("userToken", userData.token || "");
          await SecureStore.setItemAsync("userEmail", userData.email);
          await SecureStore.setItemAsync("userName", userData.userName);
          await SecureStore.setItemAsync("userPoints", String(userData.points || 0));

          /*
           * What happened, not which screen it happened on.
           *
           * This screen always reported a signup and the login screen always
           * reported a login, while both ran the same find-or-create. So an
           * existing user tapping Sign Up was counted as a new one, and — far
           * more commonly — a new user who started on the login screen was
           * never counted as a signup at all. The server now says which it
           * was.
           */
          if (userData.created) {
            posthog.identify(userData._id, {
              $set: { userName: userData.userName, mintId: userData.mintId },
              $set_once: {
                first_signup_date: new Date().toISOString(),
                signup_method: 'google',
              },
            });
            posthog.capture('user_signed_up_google', {
              mint_id: userData.mintId,
              is_first_time_login: userData.firstTimeLogin,
            });
          } else {
            posthog.identify(userData._id, {
              $set: { userName: userData.userName, mintId: userData.mintId },
              $set_once: { first_login_date: new Date().toISOString() },
            });
            posthog.capture('user_logged_in_google', { mint_id: userData.mintId });
          }

          router.replace("/(tabs)/home");
        } else {
          Constants.showDialog(data.ErrorMessage || "Google sign-up failed.");
        }
      } else if (result.error !== "cancelled") {
        Constants.showDialog(result.error || "Google sign-up failed.");
      }
    } catch {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignUp = async (credential: AppleAuthenticationCredential) => {
    setAppleLoading(true);
    try {
      // Apple only sends fullName on the very first sign-in; cache it for future logins.
      const cacheKey = `appleFullName_${credential.user}`;
      if (credential.fullName?.givenName || credential.fullName?.familyName) {
        await SecureStore.setItemAsync(cacheKey, JSON.stringify(credential.fullName));
      }
      let fullName = credential.fullName;
      if (!fullName?.givenName && !fullName?.familyName) {
        const cached = await SecureStore.getItemAsync(cacheKey);
        if (cached) fullName = JSON.parse(cached);
      }

      const res = await fetch(`${API_BASE_URL}/api/auth/apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityToken: credential.identityToken,
          fullName,
          intent: 'signup',
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text}`);
      }

      const data = await res.json();

      if (data.Status === 'Success') {
        const userData = data.data;

        const user = userFromAuth(userData, {
          token: userData.token || "",
        });

        useAppStore.setState({ user, token: userData.token || null });

        await SecureStore.setItemAsync('userToken', userData.token || '');
        await SecureStore.setItemAsync('userEmail', userData.email);
        await SecureStore.setItemAsync('userName', userData.userName);
        await SecureStore.setItemAsync('userPoints', String(userData.points || 0));

        // What happened, not which screen it happened on — see the Google
        // handler above.
        if (userData.created) {
          posthog.identify(userData._id, {
            $set: { userName: userData.userName, mintId: userData.mintId },
            $set_once: {
              first_signup_date: new Date().toISOString(),
              signup_method: 'apple',
            },
          });
          posthog.capture('user_signed_up_apple', {
            mint_id: userData.mintId,
            is_first_time_login: userData.firstTimeLogin,
          });
        } else {
          posthog.identify(userData._id, {
            $set: { userName: userData.userName, mintId: userData.mintId },
            $set_once: { first_login_date: new Date().toISOString() },
          });
          posthog.capture('user_logged_in_apple', { mint_id: userData.mintId });
        }

        router.replace('/(tabs)/home');
      } else {
        Constants.showDialog(data.ErrorMessage || 'Apple Sign-Up failed.');
      }
    } catch (error: any) {
      console.log('Apple Sign-Up error:', error.message, error.stack);
      Constants.showDialog('An error occurred. Please try again.');
    } finally {
      setAppleLoading(false);
    }
  };

  /**
   * The question list, fetched rather than carried.
   *
   * The ids are stored against the account and matched on recovery, so a copy
   * in the client would disagree with the server the first time either
   * changed. This endpoint serves the prompts to anyone — there is no session
   * at this point in signing up — and a selection only to a caller that proved
   * who it is.
   *
   * A failure is recoverable rather than fatal: the step shows a retry, and
   * the account has not been created, so nothing is in a half state.
   */
  const loadQuestions = async () => {
    setQuestionsError(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/security-question`);
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.questions) ? data.questions : [];
      if (!res.ok || list.length === 0) {
        setQuestionsError(true);
        return;
      }
      setQuestions(list);
    } catch {
      setQuestionsError(true);
    }
  };

  const handlePhoneSignUp = async () => {
    if (name.trim() === "") {
      Constants.showDialog("Please enter your name");
      return;
    }

    const parsed = normalizePhone(phone);
    if (!parsed.ok) {
      Constants.showDialog(parsed.message);
      return;
    }

    /*
     * Shape only. The server also refuses sequences, repeats, dates and a
     * denylist of common PINs, and returns a message worth showing — checking
     * those here would mean two copies of a list that will change.
     */
    const shape = pinShapeError(pin);
    if (shape) {
      Constants.showDialog(shape);
      return;
    }

    if (pin !== confirmPin) {
      Constants.showDialog("The PINs do not match.");
      return;
    }

    /*
     * Step one ends here. Nothing has been sent yet — the account is created
     * by the single request at the end of step two, so backing out now leaves
     * no trace.
     */
    if (phoneStep === "details") {
      setPhoneStep("question");
      void loadQuestions();
      return;
    }

    if (!questionId) {
      Constants.showDialog("Choose a security question.");
      return;
    }
    if (answer.trim().length < 2) {
      Constants.showDialog("Enter an answer you will remember.");
      return;
    }

    setPhoneLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/phone-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: name.trim(),
          phone: parsed.e164,
          pin,
          confirmPin,
          // Written in the same transaction as the account and the PIN.
          questionId,
          answer: answer.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201 && data.success) {
        posthog.capture("user_signed_up", { method: "phone" });
        /*
         * No session is established here, and that is the whole point: the
         * endpoint returns no token, and the new account signs in with the PIN
         * it just chose. The number is carried across so they do not retype it.
         */
        router.replace({
          pathname: "/login",
          params: { phone: parsed.national, justSignedUp: "1" },
        });
        return;
      }

      if (res.status === 429) {
        Constants.showDialog(
          data.error || "Too many attempts. Please try again later.",
        );
        return;
      }

      Constants.showDialog(data.error || "Registration failed");
    } catch {
      Constants.showDialog("An error occurred. Please try again.");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (name.trim() === "") {
      Constants.showDialog("Please enter your name");
    } else if (email.trim() === "") {
      Constants.showDialog("Please enter your email address");
    } else if (!Utils.isEmail(email.trim())) {
      Constants.showDialog("Please enter a valid email address");
    } else if (password.length < PASSWORD_MIN_LENGTH) {
      Constants.showDialog(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      );
    } else if (password.length > PASSWORD_MAX_LENGTH) {
      Constants.showDialog(
        `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
      );
    } else {
      setLoading(true);
      try {
        const result = await signUp(email.trim(), password, name.trim(), "", "", "", "");
        if (result.Status === "Success") {
          posthog.capture('user_signed_up', { method: 'email' });
          router.push({ pathname: "/verify-email", params: { email: email.trim() } });
        } else if (result.code === "RATE_LIMITED") {
          const minutes = Math.ceil((result.retryAfterSeconds || 3600) / 60);
          Constants.showDialog(
            `Too many signup attempts. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          );
        } else {
          Constants.showDialog(result.ErrorMessage || "Registration failed");
        }
      } catch {
        Constants.showDialog("An error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        /*
         * flexGrow fills the viewport; the padding keeps the last
         * control clear of the fixed footer below it. Without it the
         * Google button sat flush against the "Already have an
         * account?" bar and its rounded bottom read as cut off.
         */
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      {/* The container every focused control is measured against. Measuring
          relative to the ScrollView itself is not possible — its content
          container takes no ref — so the content carries one. */}
      <View ref={contentRef}>
      {/*
        * TOP PADDING COMES FROM THE DEVICE, not a guess.
        *
        * This was `paddingTop: 100`, a number eyeballed to clear a notch on
        * one handset. It is not the inset — it is a constant ADDED to whatever
        * the device already reserves, so on anything with a smaller status
        * area the heading sat behind a band of empty colour.
        *
        * `insets.top` is what the system actually reserves; the constant below
        * is the gap between that and the text, which is all it was ever meant
        * to be.
        */}
      <View
        style={[styles.headerSection, { paddingTop: insets.top + 20 }]}
      >
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Join Mint Rewards!</Text>
          <Text style={styles.welcomeSubtitle}>
            Start recycling and earning rewards{"\n"}today
          </Text>
        </View>
      </View>

      <View style={styles.contentSection}>
          {/*
            * Two ways to make an account, and they are not the same account.
            *
            * A phone sign-up has NO EMAIL ADDRESS — the column is nullable and
            * the credential check is satisfied by the number. That means the
            * usual "email me a reset link" route does not exist for it, and
            * the security question set during profile completion is the only
            * way back in short of contacting support. The copy under the PIN
            * field says so, because the moment to learn it is now and not when
            * locked out.
            */}
          <View style={styles.authTabs}>
            <TouchableOpacity
              style={[
                styles.authTab,
                authTab === "phone" && styles.authTabActive,
              ]}
              onPress={() => setAuthTab("phone")}
              accessibilityRole="tab"
              accessibilityState={{ selected: authTab === "phone" }}
            >
              <Text
                style={[
                  styles.authTabText,
                  authTab === "phone" && styles.authTabTextActive,
                ]}
              >
                Phone
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.authTab,
                authTab === "email" && styles.authTabActive,
              ]}
              onPress={() => setAuthTab("email")}
              accessibilityRole="tab"
              accessibilityState={{ selected: authTab === "email" }}
            >
              <Text
                style={[
                  styles.authTabText,
                  authTab === "email" && styles.authTabTextActive,
                ]}
              >
                Email
              </Text>
            </TouchableOpacity>
          </View>

          {/*
            * Step two: the security question, shown in place of the details.
            *
            * Nothing has been sent yet. "Back" returns to the form with every
            * field still filled in, because none of this is submitted until
            * the one request at the end.
            */}
          {authTab === "phone" && phoneStep === "question" && (
            <View style={styles.questionStep}>
              <Text style={styles.questionStepTitle}>
                One last thing
              </Text>
              <Text style={styles.questionStepBody}>
                Your account has no email address, so if you ever forget your
                PIN this is how we confirm it is you. Without it you would have
                to contact support.
              </Text>

              {questionsError ? (
                <>
                  <Text style={styles.questionStepBody}>
                    The questions could not be loaded.
                  </Text>
                  <TouchableOpacity
                    onPress={() => void loadQuestions()}
                    accessibilityRole="button"
                  >
                    <Text style={styles.questionStepRetry}>Try again</Text>
                  </TouchableOpacity>
                </>
              ) : questions.length === 0 ? (
                <ActivityIndicator color={Constants.appThemeColor} />
              ) : (
                <SecurityQuestionFields
                  questions={questions}
                  selectedId={questionId}
                  onSelect={setQuestionId}
                  answer={answer}
                  onChangeAnswer={setAnswer}
                  disabled={phoneLoading}
                />
              )}

              <TouchableOpacity
                onPress={() => setPhoneStep("details")}
                disabled={phoneLoading}
                accessibilityRole="button"
              >
                <Text style={styles.questionStepBack}>
                  Back to your details
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {authTab === "phone" && phoneStep === "details" && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.textInput}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    placeholder="Your name"
                    placeholderTextColor="#999999"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Mobile number</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.textInput}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    placeholder="03XX XXXXXXX"
                    placeholderTextColor="#999999"
                    maxLength={20}
                  />
                </View>
              </View>

              <View ref={pinRef} style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PIN</Text>
                <OtpInput
                  value={pin}
                  onChange={setPin}
                  secure
                  autoComplete="off"
                  autoFocus={false}
                  disabled={phoneLoading || loading}
                  onFocus={() => scrollIntoView(pinRef)}
                />
              </View>

              <View ref={confirmPinRef} style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm PIN</Text>
                <OtpInput
                  value={confirmPin}
                  onChange={setConfirmPin}
                  secure
                  autoComplete="off"
                  autoFocus={false}
                  error={confirmPin.length === PIN_LENGTH && confirmPin !== pin}
                  disabled={phoneLoading || loading}
                  /* The lowest control on this tab, and the one QA saw the
                     keyboard cover. */
                  onFocus={() => scrollIntoView(confirmPinRef)}
                />
                <Text
                  style={[
                    styles.passwordHint,
                    confirmPin.length > 0 &&
                      confirmPin !== pin &&
                      styles.passwordHintError,
                  ]}
                  accessibilityLiveRegion="polite"
                >
                  {confirmPin.length > 0 && confirmPin !== pin
                    ? "The PINs do not match."
                    : "You will sign in with your number and this PIN. Keep it somewhere safe — without an email address we cannot send you a reset link."}
                </Text>
              </View>

            </>
          )}

          {/*
            * One button for both steps, outside them, so step two is not left
            * without a way forward.
            *
            * The label tells the truth about what pressing it does. On step one
            * NOTHING is created — the account, the PIN and the security
            * question all go in a single request at the end of step two — and a
            * button saying "Create Account" there would be a promise the screen
            * does not keep.
            */}
          {authTab === "phone" && (
            <TouchableOpacity
              style={styles.signUpButton}
              onPress={handlePhoneSignUp}
              disabled={phoneLoading || loading}
              accessibilityRole="button"
            >
              {phoneLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.signUpButtonText}>
                  {phoneStep === "details" ? "Continue" : "Create Account"}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {authTab === "email" && (
          <>
          {/*
            * SOCIAL SIGN-UP COMES FIRST, and that is a hierarchy decision
            * as much as a spacing one.
            *
            * It is ONE TAP. The form below it is four fields and a
            * password rule. Underneath the form, the fast path was off the
            * bottom of every handset but the largest — the slow path was
            * hiding the quick one.
            *
            * The divider now reads downward into the form rather than up
            * out of it, so the order on screen matches the order of
            * effort.
            */}
          {(googleSignInEnabled || (Platform.OS === "ios" && appleSignInEnabled)) && (
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              {/* Names what is below it now that it reads downward into the
                  form, rather than a bare "or" between two equals. */}
              <Text style={styles.dividerText}>or sign up with email</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          {/* Google Sign-Up Button */}
          {googleSignInEnabled && (
            <TouchableOpacity
              style={[
                styles.googleButton,
                (loading || googleLoading) && styles.googleButtonDisabled,
              ]}
              onPress={handleGoogleSignUp}
              disabled={loading || appleLoading || googleLoading}
              activeOpacity={0.9}
            >
              {googleLoading ? (
                <ActivityIndicator color="#1f1f1f" size="small" />
              ) : (
                <View style={styles.googleButtonContent}>
                  <GoogleIcon size={20} opacity={loading ? 0.38 : 1} />
                  <Text
                    style={[
                      styles.googleButtonText,
                      loading && styles.googleButtonTextDisabled,
                    ]}
                    numberOfLines={1}
                  >
                    Sign up with Google
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Apple Sign-Up is iOS-only */}
          {Platform.OS === "ios" && appleSignInEnabled && (
            <View style={styles.appleButtonContainer}>
              <AppleSignInButton
                onCredential={handleAppleSignUp}
                onError={(e: unknown) => {
                  console.warn('Apple Sign-Up error', e);
                  Constants.showDialog('Apple Sign-Up failed. Please try again.');
                }}
                disabled={loading || appleLoading || googleLoading}
                buttonType={AppleAuthenticationButtonType.SIGN_UP}
              />
            </View>
          )}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Name</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Your name"
                placeholderTextColor="#999999"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={email}
                // Trim on entry: an address can never contain whitespace, and
                // a stray leading space made signup fail validation.
                onChangeText={(t) => setEmail(t.trim())}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Enter your email"
                placeholderTextColor="#999999"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.passwordTextInput}
                value={password}
                maxLength={PASSWORD_MAX_LENGTH}
                onChangeText={setPassword}
                secureTextEntry={hidePassword}
                placeholder={`Min. ${PASSWORD_MIN_LENGTH} characters`}
                placeholderTextColor="#999999"
              />
              <TouchableOpacity
                style={styles.eyeIconButton}
                onPress={() => setHidePassword(!hidePassword)}
              >
                <Ionicons
                  name={hidePassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#999999"
                />
              </TouchableOpacity>
            </View>
            <Text
              style={[
                styles.passwordHint,
                passwordHint(password).invalid && styles.passwordHintError,
              ]}
              accessibilityLiveRegion="polite"
            >
              {passwordHint(password).message}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.signUpButton}
            onPress={handleSignUp}
            disabled={loading || appleLoading || googleLoading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.signUpButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/*
            Consent, stated where it is given.
            
            This screen asked for a name, an email, a phone number and then —
            a step later — a precise home location, with no mention of what
            any of it is for and nothing to read before agreeing. The links
            are the minimum: a person signing up can see the terms they are
            accepting.
            
            Stated rather than ticked. A blocking checkbox is the stricter
            reading and the control is easy to add on top of this if legal
            asks for it; what could not stay is there being nothing to read
            at all.
          */}
          <Text style={styles.legalText}>
            By creating an account you agree to our{" "}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL("https://www.mintrewards.app/terms")}
              accessibilityRole="link"
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL("https://www.mintrewards.app/privacy")}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
            .
          </Text>

          </>
          )}
        </View>
      </View>
      </ScrollView>

      <View
        style={[
          styles.bottomSection,
          /*
           * The system navigation bar, not a guess at its height.
           *
           * Android draws this app edge to edge, so the window bottom is
           * UNDER the nav bar and a fixed padding measured from it is
           * spent on pixels nobody can see — the link ended up flat
           * against the bar. insets.bottom is what the bar actually
           * occupies on this device, gesture or three-button.
           */
          { paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace("/login")}>
            <Text style={styles.loginLinkText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  authTabs: {
    flexDirection: "row",
    backgroundColor: "#f2f4f5",
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  authTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  authTabActive: {
    backgroundColor: "#ffffff",
    // Enough lift to read as the selected tab without competing with the
    // Create Account button below it.
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  authTabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#7a8287",
  },
  authTabTextActive: {
    color: Constants.appThemeColor,
  },
  headerSection: {
    backgroundColor: Constants.appThemeColor,
    // Overridden inline with insets.top + a gap. Kept as a fallback for a
    // render with no safe-area provider, where insets are all zero.
    paddingTop: 44,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  welcomeSection: {
    marginTop: 0,
  },
  welcomeTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 6,
  },
  welcomeSubtitle: {
    color: "#ffffff",
    fontSize: 16,
    lineHeight: 22,
    opacity: 0.9,
  },
  /*
   * SPACING ON THIS SCREEN IS A BUDGET, not a preference.
   *
   * The email tab stacks four fields, a button, a divider and two social
   * buttons. At the old values that came to ~913pt of content against 721pt
   * of usable height on an iPhone 13, so the social buttons — the ONE-TAP
   * path — were below the fold on every handset but the largest.
   *
   * The trims below give back ~48pt without touching field spacing, so the
   * form keeps its breathing room. The rest was won by moving the social
   * buttons above the form; see the email tab.
   */
  contentSection: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 20,
  // Keeps the last field scrollable clear of the software keyboard.
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 20,
  },
  passwordHint: {
    fontSize: 13,
    color: "#999999",
    marginTop: 6,
    marginLeft: 4,
  },
  passwordHintError: {
    color: "#d32f2f",
  },

  inputLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 8,
  },
  inputContainer: {
    height: 50,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 15,
    backgroundColor: "#FAFAFA",
    flexDirection: "row",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: "#333333",
    height: "100%",
  },
  passwordTextInput: {
    flex: 1,
    fontSize: 16,
    color: "#333333",
    height: "100%",
  },
  eyeIconButton: {
    padding: 5,
  },
  signUpButton: {
    height: 52,
    backgroundColor: Constants.appThemeColor,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  legalText: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    color: "#667085",
  },
  legalLink: {
    color: "#00528A",
    textDecorationLine: "underline",
  },
  signUpButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  dividerContainer: {
    // 24 each side cost 48pt to say one word.
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E0E0E0",
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: "#999999",
  },
  appleButtonContainer: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    marginBottom: 10,
  },
  googleButton: {
    height: 52,
    backgroundColor: "#f2f2f2",
    borderRadius: 20,
    paddingHorizontal: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  googleButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.38)",
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 10,
  },
  googleButtonText: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: "#1f1f1f",
    letterSpacing: 0.25,
    textAlign: "center",
  },
  googleButtonTextDisabled: {
    opacity: 0.38,
  },
  bottomSection: {
    /*
     * Symmetrical breathing room.
     *
     * This had paddingBottom: 30 and nothing on top, while the row inside it
     * adds another marginBottom: 20 — so the text sat flush against the
     * scrolling content above it and 50px clear of the screen edge below.
     * It read as stuck to the Apple button.
     *
     * The background is not decoration either: this bar is a sibling of the
     * ScrollView, so without it the last control scrolling past shows through
     * and the two appear to overlap.
     */
    paddingTop: 18,
    paddingBottom: 30,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  loginContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  loginText: {
    fontSize: 16,
    color: "#666666",
  },
  questionStep: { marginBottom: 4 },
  questionStepTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f1f1f",
    marginBottom: 8,
  },
  questionStepBody: {
    fontSize: 14,
    color: "#5b6368",
    lineHeight: 20,
    marginBottom: 18,
  },
  questionStepRetry: {
    fontSize: 15,
    fontWeight: "600",
    color: Constants.appThemeColor,
    marginBottom: 18,
  },
  questionStepBack: {
    fontSize: 14,
    fontWeight: "600",
    color: Constants.appThemeColor,
    marginTop: 18,
  },
  loginLinkText: {
    fontSize: 16,
    color: Constants.appThemeColor,
    fontWeight: "600",
  },
});

export default RegisterScreen;
