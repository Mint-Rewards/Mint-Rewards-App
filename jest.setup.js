/**
 * Safe-area values for components rendered outside a provider.
 *
 * The app mounts `SafeAreaProvider` at the root (app/_layout.tsx), but a unit
 * test renders one component on its own, and `useSafeAreaInsets` throws rather
 * than guess — so every test that rendered a bottom sheet started failing the
 * moment the sheets began reserving the Android navigation bar.
 *
 * The library ships this mock for the purpose. Non-zero insets on purpose: a
 * zero mock would let a screen that forgot to reserve them pass just as well
 * as one that did.
 */
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default,
);

/**
 * Gesture Handler, for components that render a BottomSheet.
 *
 * A GestureDetector needs the handler registry, which the library's own
 * jestSetup installs. Reanimated 4's worklets are the other half of the same
 * problem and are dealt with in jest.resolver.js rather than by a mock, so
 * the real animated styles still render here.
 *
 * What this does NOT do is exercise the gesture. A drag is a native
 * negotiation, and the two attempts this sheet went through both passed every
 * test in the suite while ignoring the finger completely — so the tests around
 * it assert the shape that was got wrong, and the handset remains the only
 * place the gesture itself is verified.
 */
require("react-native-gesture-handler/jestSetup");
