import React from "react";
import { requireNativeView } from "expo";
import type { View, ViewProps } from "react-native";

const NativeAetherBlurTarget = requireNativeView<ViewProps>(
  "AetherMotion",
  "AetherAndroidBlurTargetView",
) as React.ForwardRefExoticComponent<ViewProps & React.RefAttributes<View>>;

export const AetherBlurTargetView = React.forwardRef<View, ViewProps>(
  (props, ref) => <NativeAetherBlurTarget {...props} ref={ref} />,
);

AetherBlurTargetView.displayName = "AetherBlurTargetView";
