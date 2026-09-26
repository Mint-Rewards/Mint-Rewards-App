/**
 * A card that rises from the bottom, and leaves the way it arrived.
 *
 * Three ways out, none of them a button: tap the dimmed area behind it, drag
 * it down past a threshold, or press Android's back. A sheet that can only be
 * closed by a "Close" control is the one shape of modal people reliably feel
 * trapped in — every other app on the handset dismisses on a backdrop tap, so
 * the first thing they try is the thing that did nothing.
 *
 * Core Animated and PanResponder rather than reanimated/gesture-handler,
 * which are both installed: a gesture-handler gesture inside a React Native
 * <Modal> needs its own GestureHandlerRootView around the modal's contents,
 * and forgetting it produces a sheet that simply ignores the drag with no
 * error anywhere. PanResponder has no such requirement, and this ships by OTA.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSheetInset } from "@/hooks/useSheetInset";

/** How far down it must be dragged to count as a dismissal. */
const DISMISS_DISTANCE = 110;

/**
 * A flick counts even when it is short.
 *
 * Distance alone makes a quick downward flick — which is what most people
 * actually do — feel like it was ignored.
 */
const DISMISS_VELOCITY = 0.6;

/** Below this the gesture is a tap or a horizontal drift, not a dismissal. */
const DRAG_SLOP = 8;

const ENTER_MS = 240;
const EXIT_MS = 200;

/**
 * How far the card may be lifted ABOVE its resting place, and how heavily
 * that movement is damped.
 *
 * Dragging up cannot dismiss anything, but a handle that only answers in one
 * direction feels broken — you pull it and nothing happens. So it follows the
 * finger, reluctantly, and springs back. The sheet's own background is
 * extended by this much below the screen (see `overhang`), so lifting it
 * reveals more card rather than a strip of backdrop under it.
 */
const LIFT_LIMIT = 64;
const LIFT_DAMPING = 0.35;

interface Props {
  visible: boolean;
  onClose: () => void;
  /**
   * False pins the sheet in place: no backdrop tap, no drag, no back button.
   *
   * For the gates, where whether the user may skip is a decision made by
   * policy rather than by reaching for the nearest way out.
   */
  dismissible?: boolean;
  /**
   * Whether the whole card is a drag handle, or only the grab bar.
   *
   * False for a sheet with a ScrollView in it: the responder claims the
   * gesture on the CAPTURE phase, which is what lets a drag beat the buttons
   * inside the card — and would equally beat a scroll.
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
   * The Modal's own `animationType` cannot be used here: "slide" translates
   * the ENTIRE modal, dim layer included, so the backdrop slid down with the
   * card instead of fading where it stood. Animating it here means the sheet
   * has to outlive `visible` going false long enough to play the exit.
   */
  const [rendered, setRendered] = useState(visible);

  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      translateY.setValue(screenHeight);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ENTER_MS,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: ENTER_MS,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    /*
     * Runs from wherever the card currently is, so a drag that crossed the
     * threshold carries on from under the finger rather than snapping back
     * and then leaving.
     */
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: screenHeight,
        duration: EXIT_MS,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: EXIT_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setRendered(false);
    });
  }, [visible, screenHeight, translateY, backdropOpacity]);

  /**
   * Asks the PARENT to close, and does not animate.
   *
   * The exit belongs to the effect above, which fires when `visible` goes
   * false. Animating here as well would play it twice, and would also hide a
   * sheet whose owner decided not to close it.
   */
  const requestClose = useCallback(() => onClose(), [onClose]);
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  const responder = useRef(
    PanResponder.create({
      /*
       * CAPTURE, not bubble. A TouchableOpacity inside the card becomes the
       * responder the moment a finger lands on it, and a bubbling
       * `onMoveShouldSetPanResponder` is then never consulted — so the card
       * ignored every drag that began on a button, which on a card that is
       * mostly buttons is every drag. Capturing on a downward move of more
       * than a few pixels lets a drag beat a tap without breaking taps,
       * which do not move.
       */
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        gesture.dy > DRAG_SLOP && gesture.dy > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        translateY.setValue(
          gesture.dy >= 0
            ? gesture.dy
            : // Upward: damped and capped, because there is nothing above to
              // travel to and only the dismissal below to aim at.
              Math.max(-LIFT_LIMIT, gesture.dy * LIFT_DAMPING),
        );
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          closeRef.current();
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
      // A gesture taken away mid-drag must not leave the card stranded.
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
    }),
  ).current;

  const dragHandlers = dismissible ? responder.panHandlers : {};

  if (!rendered) return null;

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
      <View style={styles.overlay} testID={testID}>
        {/*
          The dimmed area, as its own layer behind the card, fading rather
          than travelling. Absolutely positioned rather than wrapping the
          card: a Pressable that CONTAINS it would fire on every tap inside
          it too, so the sheet would close when someone pressed a button.
        */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="auto"
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissible ? onClose : undefined}
            // Announced as the dismissal it is, since it has no label.
            accessibilityRole={dismissible ? "button" : undefined}
            accessibilityLabel={dismissible ? "Close" : undefined}
            testID="bottom-sheet-backdrop"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              /*
               * The card runs LIFT_LIMIT past the bottom of the screen and is
               * pulled back by the same amount, so the part that comes into
               * view when it is lifted is more card and not the dimmed area
               * behind it.
               */
              paddingBottom: sheetInset + LIFT_LIMIT,
              marginBottom: -LIFT_LIMIT,
              transform: [{ translateY }],
            },
            style,
          ]}
          {...(dragAnywhere ? dragHandlers : {})}
        >
          {/*
            The grab bar, and always a drag target in its own right — it gets
            the handlers whether or not the rest of the card does. Giving them
            only to the card left this bar swallowing touches it then did
            nothing with, which is worse than having no handle at all.
          */}
          {dismissible ? (
            <View
              style={[styles.handleZone, handleFloating && styles.handleFloating]}
              {...dragHandlers}
            >
              <View
                style={[styles.handle, handleTint === "light" && styles.handleLight]}
              />
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  // Generous, because it is also the drag target: a 4px bar is a fine thing
  // to look at and a poor thing to catch with a thumb.
  handleZone: { alignItems: "center", paddingTop: 10, paddingBottom: 6 },
  handleFloating: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    // Taller than it looks: the bar is 4px and a thumb is not.
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
