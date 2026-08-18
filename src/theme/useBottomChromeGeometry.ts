import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LayoutTokens, Spacing } from "@/theme/tokens";

export function useBottomChromeGeometry() {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const systemBottomInset = Math.max(Spacing.md, insets.bottom + Spacing.xs);
  const navigationHeight = LayoutTokens.navigationHeight;
  const navigationBottom = systemBottomInset;

  const composerNavigationGap = Spacing.md;
  const composerHeight = LayoutTokens.composerHeight;

  // When keyboard is visible, navigation is hidden, so composer hugs cleanly right above the keyboard
  const composerBottom = keyboardVisible
    ? Math.max(Spacing.sm, insets.bottom) +
      (Platform.OS === "android" ? Spacing.sm : Spacing.xs)
    : navigationBottom + navigationHeight + composerNavigationGap;

  const contentBottomInset =
    navigationBottom +
    navigationHeight +
    composerNavigationGap +
    composerHeight +
    Spacing.lg;
  const settingsContentBottomInset = systemBottomInset + Spacing.lg;

  return {
    systemBottomInset,
    navigationHeight,
    navigationBottom,
    composerHeight,
    composerBottom,
    contentBottomInset,
    settingsContentBottomInset,
    keyboardVisible,
  };
}
