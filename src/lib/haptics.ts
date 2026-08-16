import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

function androidImpact(
  style: Haptics.ImpactFeedbackStyle,
): Haptics.AndroidHaptics {
  switch (style) {
    case Haptics.ImpactFeedbackStyle.Heavy:
    case Haptics.ImpactFeedbackStyle.Rigid:
      return Haptics.AndroidHaptics.Long_Press;
    case Haptics.ImpactFeedbackStyle.Medium:
      return Haptics.AndroidHaptics.Context_Click;
    case Haptics.ImpactFeedbackStyle.Soft:
      return Haptics.AndroidHaptics.Segment_Tick;
    case Haptics.ImpactFeedbackStyle.Light:
    default:
      return Haptics.AndroidHaptics.Virtual_Key;
  }
}

export async function impactAsync(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
): Promise<void> {
  if (Platform.OS === "android") {
    await Haptics.performAndroidHapticsAsync(androidImpact(style));
    return;
  }
  await Haptics.impactAsync(style);
}

export async function selectionAsync(): Promise<void> {
  if (Platform.OS === "android") {
    await Haptics.performAndroidHapticsAsync(
      Haptics.AndroidHaptics.Segment_Frequent_Tick,
    );
    return;
  }
  await Haptics.selectionAsync();
}

export async function notificationAsync(
  type: Haptics.NotificationFeedbackType,
): Promise<void> {
  if (Platform.OS === "android") {
    const androidType =
      type === Haptics.NotificationFeedbackType.Success
        ? Haptics.AndroidHaptics.Confirm
        : type === Haptics.NotificationFeedbackType.Warning
          ? Haptics.AndroidHaptics.Gesture_End
          : Haptics.AndroidHaptics.Reject;
    await Haptics.performAndroidHapticsAsync(androidType);
    return;
  }
  await Haptics.notificationAsync(type);
}
