/**
 * React Native's resolver, with Reanimated 4's worklets exception.
 *
 * Reanimated 4 puts its worklets in a separate `react-native-worklets`
 * package whose `.native.js` files expect a native runtime, so resolving them
 * normally under Jest throws "Native part of Worklets doesn't seem to be
 * initialized" at import time and takes down every suite that renders a
 * component using an animated style. Dropping the `.native` extensions for
 * that package only is the fix the library itself ships, in
 * `react-native-worklets/jest/resolver.js`.
 *
 * It is reimplemented here rather than pointed at, because `resolver` takes
 * ONE entry and jest-expo's preset already supplies React Native's — setting
 * theirs would silently drop that, and React Native's own resolution is not
 * optional.
 */
const reactNativeResolver = require("@react-native/jest-preset/jest/resolver.js");

module.exports = (request, options) => {
  const touchesWorklets =
    options.basedir.includes("react-native-worklets") ||
    request.includes("react-native-worklets");

  return reactNativeResolver(
    request,
    touchesWorklets
      ? {
          ...options,
          extensions: options.extensions?.filter((ext) => !ext.includes("native")),
        }
      : options,
  );
};
