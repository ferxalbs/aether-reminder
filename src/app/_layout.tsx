import { memo, type RefObject, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Tabs, usePathname } from "expo-router";
import { AetherBlurTargetView } from "@/motion/components/AetherBlurTarget";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppBootstrap, useLocalAppBootstrap } from "@/app/bootstrap";
import { useAetherTheme } from "@/theme/useAetherTheme";
import {
  AssistantHost,
  AssistantSurfaceProvider,
} from "@/components/assistant/AssistantHost";
import { AppBottomNavigation } from "@/components/assistant/AppBottomNavigation";
import { MotionProvider } from "@/motion";

const PersistentChrome = memo(function PersistentChrome({
  blurTarget,
}: {
  blurTarget: RefObject<View | null>;
}) {
  const pathname = usePathname();
  const { phase } = useLocalAppBootstrap();
  if (phase !== "ready" || pathname === "/capture") return null;

  return (
    <>
      <AppBottomNavigation blurTarget={blurTarget} />
      <AssistantHost blurTarget={blurTarget} />
    </>
  );
});

export default function RootLayout() {
  const theme = useAetherTheme();
  const { colors } = theme;
  const blurTarget = useRef<View | null>(null);
  const bgColor = colors.background;

  return (
    <SafeAreaProvider>
      <MotionProvider>
        <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
        <View style={[styles.root, { backgroundColor: bgColor }]}>
          <AppBootstrap>
            <AssistantSurfaceProvider>
              <AetherBlurTargetView ref={blurTarget} style={styles.routeTarget}>
                <Tabs
                  tabBar={() => null}
                  screenOptions={{
                    headerShown: false,
                    tabBarHideOnKeyboard: true,
                    sceneStyle: { backgroundColor: bgColor },
                  }}
                  screenListeners={{
                    state: (event) => {
                      if (__DEV__) {
                        console.info(
                          "[AETHER tabs] state changed",
                          event.data.state,
                        );
                      }
                    },
                  }}
                >
                  <Tabs.Screen name="index" options={{ title: "Today" }} />
                  <Tabs.Screen name="tasks" options={{ title: "Schedule" }} />
                  <Tabs.Screen name="all" options={{ title: "Reminders" }} />
                  <Tabs.Screen
                    name="settings"
                    options={{ title: "Settings", href: null }}
                  />
                  <Tabs.Screen name="ai" options={{ href: null }} />
                  <Tabs.Screen name="transcribe" options={{ href: null }} />
                  <Tabs.Screen name="capture" options={{ href: null }} />
                </Tabs>
              </AetherBlurTargetView>
              <PersistentChrome blurTarget={blurTarget} />
            </AssistantSurfaceProvider>
          </AppBootstrap>
        </View>
      </MotionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  routeTarget: {
    flex: 1,
  },
});
