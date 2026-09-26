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
import React, { useEffect, useRef } from "react";
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
   * False for a sheet with a ScrollView in it: a PanResponder over the whole
   * card competes with the scroll for the same downward drag, and the one
   * that wins is the one that claimed the gesture first — which is to say, it
   * varies. The grab bar is always draggable either way.
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
  const translateY = useRef(new Animated.Value(0)).current;

  // Re-opening a sheet that was dragged away must not open it already dragged.
  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const close = () => {
    // Carry the card the rest of the way down rather than cutting to the
    // Modal's own slide-out, which would jump back to wherever the finger
    // left it and then leave.
    Animated.timing(translateY, {
      toValue: Dimensions.get("window").height,
      duration: 180,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  // Held in a ref because the responder below is created once, and would
  // otherwise capture the first render's `close` — and through it, the first
  // render's `onClose`.
  const closeRef = useRef(close);
  closeRef.current = close;

  const responder = useRef(
    PanResponder.create({
      // Claimed on MOVE, never on start: claiming on start would swallow the
      // taps on every button inside the sheet.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > DRAG_SLOP && gesture.dy > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        // Downward only. Letting it travel up would peel the sheet off the
        // bottom of the screen and show the backdrop underneath it.
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
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
    }),
  ).current;

  const dragHandlers = dismissible ? responder.panHandlers : {};

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={dismissible ? onClose : () => {}}
    >
      <View style={styles.overlay} testID={testID}>
        {/*
          The dimmed area, as its own layer behind the card.
          Absolutely positioned rather than wrapping the sheet: a Pressable
          that CONTAINS the card would fire on every tap inside it too, so the
          sheet would close when someone pressed a button on it.
        */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissible ? onClose : undefined}
          // Announced as the dismissal it is, since it has no label of its own.
          accessibilityRole={dismissible ? "button" : undefined}
          accessibilityLabel={dismissible ? "Close" : undefined}
          testID="bottom-sheet-backdrop"
        />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: sheetInset, transform: [{ translateY }] },
            style,
          ]}
          {...(dragAnywhere ? dragHandlers : {})}
        >
          {/*
            The grab bar. Draggable even when the card is not, so a sheet with
            a ScrollView in it still has somewhere to take hold of, and so the
            affordance is visible rather than something to be discovered.
          */}
          {dismissible ? (
            <View
              style={[styles.handleZone, handleFloating && styles.handleFloating]}
              {...(dragAnywhere ? {} : dragHandlers)}
              pointerEvents="box-only"
            >
              <View
                style={[
                  styles.handle,
                  handleTint === "light" && styles.handleLight,
                ]}
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
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
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
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  handleLight: { backgroundColor: "rgba(255,255,255,0.55)" },
});
