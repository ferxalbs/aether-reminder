import React, { useEffect, type RefObject } from 'react';
import {
  Pressable,
  Platform,
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '@/components/ui/Typography';
import { Button } from '@/components/ui/Button';
import { AssistantMaterial } from './AssistantMaterial';
import { AssistantComposer } from './AssistantComposer';
import type {
  AssistantMessage,
  AssistantReceipt,
  AssistantSurfaceState,
  PendingAssistantConfirmation,
  AssistantOrbState,
} from './assistantTypes';
import { assistantStateLabel } from './AssistantOrb';
import type { AgentSemanticState } from '@/services/agent';
import type { VoiceState } from './VoiceController';

interface AssistantSheetProps {
  surface: AssistantSurfaceState;
  messages: AssistantMessage[];
  receipts: AssistantReceipt[];
  semanticState: AgentSemanticState;
  error: string | null;
  canRetry: boolean;
  isRunning: boolean;
  pendingConfirmation: PendingAssistantConfirmation | null;
  composerValue: string;
  onComposerChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onExpand: () => void;
  onConfirm: () => void;
  onCancelConfirmation: () => void;
  onRetry: () => void;
  reduceMotion: boolean;
  voiceState: VoiceState;
  voiceLocked: boolean;
  voiceError: string | null;
  voiceCanRetry: boolean;
  voiceRetryAttempt: number;
  voiceTranscript: string;
  voiceAudioLevel: SharedValue<number>;
  onVoiceStop: () => void;
  onVoiceCancel: () => void;
  onVoiceRetry: () => void;
  keyboardOffset: number;
  blurTarget?: RefObject<View | null>;
  orbState: AssistantOrbState;
  assistantExpanded: boolean;
  onOrbPress: () => void;
  onOrbPressIn?: () => void;
  onOrbLongPress?: () => void;
  onOrbPressOut?: () => void;
  onOrbPressMove?: (event: { nativeEvent: { pageY: number } }) => void;
}

function confirmationTitle(pending: PendingAssistantConfirmation): string {
  if (pending.action.toolId === 'tasks.delete') {
    const args = pending.action.args as { ids?: unknown[]; id?: unknown };
    const count = Array.isArray(args.ids) ? args.ids.length : args.id ? 1 : 0;
    return count > 1 ? `Delete ${count} tasks?` : 'Delete this task?';
  }
  if (pending.action.toolId === 'app.navigate') return 'Open another AETHER surface?';
  return 'Confirm this action?';
}

export const AssistantSheet: React.FC<AssistantSheetProps> = ({
  surface,
  messages,
  receipts,
  semanticState,
  error,
  canRetry,
  isRunning,
  pendingConfirmation,
  composerValue,
  onComposerChange,
  onSubmit,
  onClose,
  onExpand,
  onConfirm,
  onCancelConfirmation,
  onRetry,
  reduceMotion,
  voiceState,
  voiceLocked,
  voiceError,
  voiceCanRetry,
  voiceRetryAttempt,
  voiceTranscript,
  voiceAudioLevel,
  onVoiceStop,
  onVoiceCancel,
  onVoiceRetry,
  keyboardOffset,
  blurTarget,
  orbState,
  assistantExpanded,
  onOrbPress,
  onOrbPressIn,
  onOrbLongPress,
  onOrbPressOut,
  onOrbPressMove,
}) => {
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const height = useSharedValue(0);
  const keyboardShift = useSharedValue(0);
  const voiceLevelStyle = useAnimatedStyle(() => ({
    width: `${Math.round(Math.min(1, voiceAudioLevel.value) * 100)}%`,
  }));
  const isVisible = surface !== 'closed';
  const showHeader = surface === 'medium' || surface === 'full';
  const showConversation = surface === 'medium' || surface === 'full';
  const voiceActive = voiceState !== 'idle' && voiceState !== 'error';
  const targetHeight =
    surface === 'opening' || surface === 'compact'
      ? voiceActive ? 124 : 84
      : surface === 'medium'
        ? Math.min(470, windowHeight * 0.58)
        : surface === 'full'
          ? Math.min(720, windowHeight * 0.82)
          : 0;

  useEffect(() => {
    height.value = reduceMotion || Platform.OS === 'android'
      ? withTiming(targetHeight, { duration: 140 })
      : withSpring(targetHeight, { damping: 24, stiffness: 240, mass: 0.8 });
  }, [height, reduceMotion, targetHeight]);

  useEffect(() => {
    keyboardShift.value = withTiming(keyboardOffset, { duration: reduceMotion ? 120 : 220 });
  }, [keyboardOffset, keyboardShift, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));
  const animatedBottomStyle = useAnimatedStyle(() => ({
    bottom: Math.max(insets.bottom, 10) + 12 + keyboardShift.value,
  }));
  if (!isVisible) return null;

  return (
    <Animated.View
      style={[styles.wrapper, animatedBottomStyle, animatedStyle]}
      pointerEvents="box-none"
    >
      <AssistantMaterial style={styles.sheet} borderRadius={Radius.xl} blurTarget={blurTarget}>
        <View style={styles.keyboardView}>
          {showHeader ? (
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <View style={[styles.statusMark, { backgroundColor: semanticState === 'error' ? '#B42318' : isDark ? Colors.white : Colors.black }]} />
                <View>
                  <Typography variant="bodyBold">AETHER</Typography>
                  <Typography variant="tiny" color={Colors.zinc500} accessibilityLiveRegion="polite">
                    {assistantStateLabel(semanticState)}
                  </Typography>
                </View>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={onExpand}
                  accessibilityRole="button"
                  accessibilityLabel={surface === 'full' ? 'Collapse assistant conversation' : 'Expand assistant conversation'}
                  style={styles.headerButton}
                >
                  {surface === 'full' ? <ChevronDown size={19} color={Colors.zinc500} /> : <ChevronUp size={19} color={Colors.zinc500} />}
                </Pressable>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close assistant" style={styles.headerButton}>
                  <X size={19} color={Colors.zinc500} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {showConversation ? (
            <FlatList
              style={styles.conversation}
              contentContainerStyle={styles.conversationContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              data={messages}
              keyExtractor={(message) => message.id}
              renderItem={({ item: message }) => {
                if (!message.text && !(isRunning && message.role === 'assistant')) return null;
                return (
                  <View style={[styles.messageRow, message.role === 'user' && styles.userMessageRow]}>
                    <View style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble, { backgroundColor: message.role === 'user' ? (isDark ? Colors.white : Colors.black) : (isDark ? Colors.zinc800 : Colors.zinc100) }]}>
                      <Typography variant="body" color={message.role === 'user' ? (isDark ? Colors.black : Colors.white) : undefined}>
                        {message.text || ' '}
                      </Typography>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={(
                <Typography variant="body" color={Colors.zinc500} style={styles.welcome}>
                  Ask about your tasks, or tell me what to change.
                </Typography>
              )}
              ListFooterComponent={(
                <View style={styles.conversationFooter}>
                  {receipts.map(({ receipt, toolId }) => (
                    <View key={receipt.id} style={[styles.receipt, { borderColor: isDark ? Colors.zinc700 : Colors.zinc200 }]}>
                      <View style={styles.receiptIcon}><Check size={14} color="#2F855A" strokeWidth={2.8} /></View>
                      <View style={styles.receiptCopy}>
                        <Typography variant="bodyBold">{receipt.summary}</Typography>
                        <Typography variant="tiny" color={Colors.zinc500}>{toolId}</Typography>
                      </View>
                    </View>
                  ))}

                  {pendingConfirmation ? (
                    <View style={[styles.confirmation, { backgroundColor: isDark ? Colors.zinc800 : Colors.zinc100 }]}>
                      <Typography variant="bodyBold">{confirmationTitle(pendingConfirmation)}</Typography>
                      <Typography variant="caption" color={Colors.zinc500} style={styles.confirmationReason}>
                        {pendingConfirmation.reason}
                      </Typography>
                      <View style={styles.confirmationActions}>
                        <Button label="Cancel" variant="secondary" size="sm" onPress={onCancelConfirmation} style={styles.confirmationButton} />
                        <Button label="Confirm" variant="primary" size="sm" onPress={onConfirm} loading={isRunning} style={styles.confirmationButton} />
                      </View>
                    </View>
                  ) : null}

                  {error ? (
                    <View accessibilityLiveRegion="assertive" style={styles.errorMessage}>
                      <Text style={[styles.errorText, { color: isDark ? '#FDA29B' : '#B42318' }]}>{error}</Text>
                      {canRetry ? <Button label="Retry" variant="secondary" size="sm" onPress={onRetry} loading={isRunning} style={styles.retryButton} /> : null}
                    </View>
                  ) : null}
                  </View>
              )}
            />
          ) : null}

          <View style={styles.composerContainer}>
            {voiceState !== 'idle' && voiceState !== 'error' ? (
              <View style={[styles.voiceControls, { backgroundColor: isDark ? Colors.zinc800 : Colors.zinc100 }]}>
                <Typography variant="bodyBold">{voiceState === 'connecting' ? voiceRetryAttempt > 0 ? 'Retrying connection…' : 'Connecting…' : voiceLocked ? 'Listening (locked)' : voiceState === 'listening' ? 'Listening…' : voiceState === 'transcribing' ? 'Transcribing…' : 'Finalizing…'}</Typography>
                {voiceTranscript ? <Typography variant="caption" color={Colors.zinc500} numberOfLines={3}>{voiceTranscript}</Typography> : null}
                {voiceState === 'listening' || voiceState === 'transcribing' ? <View style={[styles.voiceLevelTrack, { backgroundColor: isDark ? Colors.zinc700 : Colors.zinc200 }]}><Animated.View style={[styles.voiceLevelFill, { backgroundColor: '#65D6C0' }, voiceLevelStyle]} /></View> : null}
                {voiceLocked ? <View style={styles.voiceActions}><Button label="Cancel" variant="secondary" size="sm" onPress={onVoiceCancel} /><Button label="Stop & Send" variant="primary" size="sm" onPress={onVoiceStop} /></View> : null}
              </View>
            ) : null}
            {voiceError ? (
              <View accessibilityLiveRegion="assertive" style={styles.voiceError}>
                <Text style={[styles.errorText, { color: isDark ? '#FDA29B' : '#B42318' }]}>{voiceError}</Text>
                {voiceCanRetry ? <Button label="Try again" variant="secondary" size="sm" onPress={onVoiceRetry} style={styles.retryButton} /> : null}
              </View>
            ) : null}
            <AssistantComposer
              value={composerValue}
              onChangeText={onComposerChange}
              onSubmit={onSubmit}
              disabled={isRunning || voiceActive}
              autoFocus={surface === 'compact' && voiceState === 'idle'}
              orbState={orbState}
              assistantExpanded={assistantExpanded}
              onOrbPress={onOrbPress}
              onOrbPressIn={onOrbPressIn}
              onOrbLongPress={onOrbLongPress}
              onOrbPressOut={onOrbPressOut}
              onOrbPressMove={onOrbPressMove}
              audioLevel={voiceAudioLevel}
            />
          </View>
        </View>
      </AssistantMaterial>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.sm,
    zIndex: 20,
  },
  sheet: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusMark: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  headerButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversation: {
    flex: 1,
  },
  conversationContent: {
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  conversationFooter: {
    gap: Spacing.sm,
  },
  welcome: {
    paddingVertical: Spacing.xl,
  },
  messageRow: {
    alignItems: 'flex-start',
  },
  userMessageRow: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '88%',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  userBubble: {
    borderBottomRightRadius: Radius.sm,
  },
  assistantBubble: {
    borderBottomLeftRadius: Radius.sm,
  },
  receipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  receiptIcon: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(47, 133, 90, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptCopy: {
    flex: 1,
    gap: 2,
  },
  confirmation: {
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  confirmationReason: {
    marginTop: Spacing.xs,
  },
  confirmationActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  confirmationButton: {
    flex: 1,
  },
  errorMessage: {
    paddingVertical: Spacing.xs,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  composerContainer: {
    paddingTop: Spacing.xs,
  },
  voiceControls: {
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  voiceActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  voiceError: {
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  voiceLevelTrack: {
    height: 4,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  voiceLevelFill: {
    height: 4,
    borderRadius: Radius.pill,
  },
});
