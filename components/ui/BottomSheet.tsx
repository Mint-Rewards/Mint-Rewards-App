/**
 * A card that rises from the bottom and clings to your finger.
 *
 * Three ways out, none of them a button: drag it down, tap the dimmed area
 * behind it, or press Android's back. A sheet that can only be closed by a
 * "Close" control is the one shape of modal people reliably feel trapped in —
 * every other app on the handset dismisses on a backdrop tap, so the first
 * thing they try is the thing that did nothing.
 *
 * Gesture Handler and Reanimated, NOT PanResponder. Two attempts were built on
 * PanResponder and neither followed the finger: the JS responder system
 * negotiates per touch, a TouchableOpacity becomes the responder the moment a
 * finger lands on it, and on a card that is mostly buttons the sheet is simply
 * never asked. Capturing on the move phase did not rescue it either. Gesture
 * Handler runs at the native level and does not take part in that argument,
 * which is why every app whose sheets feel right is using it.
 *
 * The documented cost is that a gesture inside a React Native <Modal> needs
 * its own GestureHandlerRootView around the modal's contents — without it the
 * drag is silently ignored, which is exactly the failure this replaces. It is
 * mounted below, deliberately and with this comment attached to it.
 */
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Extrapolation,
} from "react-native-reanimated";
import { useSheetInset } from "@/hooks/useSheetInset";

/** How far down it must be left to count as a dismissal. */
const DISMISS_DISTANCE = 110;

/**
 * A flick counts even when it is short, in px per second.
 *
 * Distance alone makes a quick downward flick — which is what most people
 * actually do — feel like it was ignored. Note the unit: Gesture Handler
 * reports px/s where PanResponder reported px/ms, and carrying the old
 * number across would have made every gesture a dismissal.
 */
const DISMISS_VELOCITY = 800;

/**
 * Vertical travel before the drag takes over from the buttons underneath.
 *
 * This is what lets the whole card be a handle without eating taps: a tap
 * does not move, so the gesture never activates and the press goes through.
 */
const ACTIVATION_SLOP = 10;

/**
 * How far the card may be lifted ABOVE its resting place, and how heavily
 * that movement is damped.
 *
 * Dragging up cannot dismiss anything, but a card that answers in only one
 * direction does not feel attached to the finger. So it follows, reluctantly,
 * and springs back. The card's own background is extended by this much below
 * the screen, so lifting it reveals more card and not a strip of backdrop.
 */
const LIFT_LIMIT = 64;
const LIFT_DAMPING = 0.35;

const ENTER_MS = 260;
const EXIT_MS = 200;

interface Props {
  visible: boolean;
  onClose: () => void;
  /**
   * False pins the card in place: no drag, no backdrop tap, no back button.
   *
   * For the gates, where whether the user may skip is a decision made by
   * policy rather than by reaching for the nearest way out.
   */
  dismissible?: boolean;
  /**
   * False confines the drag to the grab bar.
   *
   * For a sheet with a ScrollView in it, where a card-wide pan and the scroll
   * are competing for the same downward drag.
   */
  dragAnywhere?: boolean;
  /** Extra padding under the content, on top of the system inset. */
  extraInset?: number;
  /**
   * Draws the grab bar OVER the content instead of above it.
   *
   * For a sheet whose first child is its own coloured header: in flow, the
   * bar sits on a strip of the sheet's background colour above that header,
   * which reads as a rendering fault rather than a handle.
   */
  handleFloating?: boolean;
  /** Light for a dark header, dark for a pale one. A bar has to be visible. */
  handleTint?: "dark" | "light";
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}

export function BottomSheet({
  visible,
  onClose,
  dismissible = true,
  dragAnywhere = true,
  extraInset,
  handleFloating = false,
  handleTint = "dark",
  style,
  children,
  testID,
}: Props) {
  const sheetInset = useSheetInset(extraInset);
  const screenHeight = Dimensions.get("window").height;

  /**
   * Kept mounted through the exit animation.
   *
   * The Modal's own `animationType` cannot be used: "slide" translates the
   * ENTIRE modal, dim layer included, so the backdrop slid away with the card
   * instead of fading where it stood.
   */
  const [rendered, setRendered] = useState(visible);
  const translateY = useSharedValue(screenHeight);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      translateY.value = screenHeight;
      translateY.value = withTiming(0, { duration: ENTER_MS });
      return;
    }
    /*
     * Runs from wherever the card currently is, so a drag that crossed the
     * threshold carries on from under the finger rather than snapping back
     * and then leaving.
     */
    translateY.value = withTiming(screenHeight, { duration: EXIT_MS }, (done) => {
      if (done) runOnJS(setRendered)(false);
    });
  }, [visible, screenHeight, translateY]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  /**
   * The dim fades with the drag, not just with the open and close.
   *
   * It is the thing that makes a half-completed drag readable: the further
   * the card has gone, the more of the screen behind it shows through, so the
   * gesture tells you what letting go will do before you let go.
   */
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, screenHeight * 0.6],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const pan = Gesture.Pan()
    .enabled(dismissible)
    // Vertical only, and only past the slop, so taps and horizontal swipes
    // inside the card are left alone.
    .activeOffsetY([-ACTIVATION_SLOP, ACTIVATION_SLOP])
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      translateY.value =
        event.translationY >= 0
          ? event.translationY
          : Math.max(-LIFT_LIMIT, event.translationY * LIFT_DAMPING);
    })
    .onEnd((event) => {
      if (
        event.translationY > DISMISS_DISTANCE ||
        event.velocityY > DISMISS_VELOCITY
      ) {
        // The parent owns `visible`; the exit plays in the effect above.
        runOnJS(onClose)();
        return;
      }
      translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    });

  if (!rendered) return null;

  const card = (
    <Animated.View
      style={[
        styles.card,
        {
          /*
           * The card runs LIFT_LIMIT past the bottom of the screen and is
           * pulled back by the same amount, so what comes into view when it
           * is lifted is more card and not the dimmed area behind it.
           */
          paddingBottom: sheetInset + LIFT_LIMIT,
          marginBottom: -LIFT_LIMIT,
        },
        style,
        cardStyle,
      ]}
    >
      {dismissible ? (
        <View style={[styles.handleZone, handleFloating && styles.handleFloating]}>
          <View style={[styles.handle, handleTint === "light" && styles.handleLight]} />
        </View>
      ) : null}
      {children}
    </Animated.View>
  );

  return (
    <Modal
      visible
      transparent
      // Ours, not the Modal's — see `rendered` above.
      animationType="none"
      // Edge-to-edge: without this the modal stops short of the status bar
      // and leaves a pale band above the dimmed area.
      statusBarTranslucent
      onRequestClose={dismissible ? onClose : () => {}}
    >
      {/*
        Required. A Gesture Handler gesture inside a React Native <Modal> is
        silently inert without its own root view here — the modal's contents
        are in a separate native view hierarchy that the app's root does not
        reach. This is the single line whose absence made the last two
        attempts ignore every drag.
      */}
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.overlay} testID={testID}>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={dismissible ? onClose : undefined}
              // Announced as the dismissal it is, since it has no label.
              accessibilityRole={dismissible ? "button" : undefined}
              accessibilityLabel={dismissible ? "Close" : undefined}
              testID="bottom-sheet-backdrop"
            />
          </Animated.View>

          {dragAnywhere ? (
            <GestureDetector gesture={pan}>{card}</GestureDetector>
          ) : (
            card
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  handleZone: { alignItems: "center", paddingTop: 10, paddingBottom: 6 },
  handleFloating: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    paddingTop: 12,
    paddingBottom: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  handleLight: { backgroundColor: "rgba(255,255,255,0.55)" },
});
