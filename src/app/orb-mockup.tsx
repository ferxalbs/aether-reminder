import React, { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View, Pressable } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { Stack, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { FiberCanvas } from '@/lib/fiber-canvas';

const Scene = React.lazy(() => import('@/components/assistant/OrbScene'));

const AdaptiveGlass = ({ children, style }: any) => {
  if (isLiquidGlassAvailable()) {
    return <GlassView style={style}>{children}</GlassView>;
  }
  return (
    <BlurView tint="systemMaterial" intensity={90} style={style}>
      {children}
    </BlurView>
  );
};

export default function OrbMockup() {
  const isDark = useIsDark();
  const router = useRouter();

  const closeMockup = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ presentation: 'transparentModal', headerShown: false, animation: 'fade' }} />
      
      {/* Background Dim */}
      <Pressable style={styles.scrim} onPress={closeMockup} />

      <AdaptiveGlass style={styles.sheet}>
        <View style={styles.header}>
          <Typography variant="bodyBold">AETHER</Typography>
          <Pressable onPress={closeMockup} style={styles.closeBtn}>
            <X size={20} color={isDark ? Colors.white : Colors.black} />
          </Pressable>
        </View>

        <View style={styles.orbContainer}>
          <Suspense fallback={<ActivityIndicator color={isDark ? Colors.white : Colors.black} />}>
            <FiberCanvas style={styles.canvas}>
              <Scene />
            </FiberCanvas>
          </Suspense>
        </View>

        <View style={styles.footer}>
          <Typography variant="title" align="center" style={styles.listeningText}>
            I&apos;m listening...
          </Typography>
          <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} align="center">
            Say the reminder, date, and time in one sentence.
          </Typography>
        </View>
      </AdaptiveGlass>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    marginHorizontal: Spacing.sm,
    marginBottom: 40,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  closeBtn: {
    padding: Spacing.xs,
    opacity: 0.5,
  },
  orbContainer: {
    height: 320,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    flex: 1,
    width: '100%',
  },
  footer: {
    marginTop: Spacing.xl,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  listeningText: {
    fontSize: 24,
    fontWeight: '600',
  },
});
