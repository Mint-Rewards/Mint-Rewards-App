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
