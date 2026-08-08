import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { Button } from '@/components/ui/Button';
import { AssistantMaterial } from './AssistantMaterial';
import { AssistantComposer } from './AssistantComposer';
import type {
  AssistantMessage,
  AssistantReceipt,
  AssistantSurfaceState,
  PendingAssistantConfirmation,
} from './assistantTypes';
import { assistantStateLabel } from './AssistantOrb';
import type { AgentSemanticState } from '@/services/agent';

interface AssistantSheetProps {
  surface: AssistantSurfaceState;
  messages: AssistantMessage[];
  receipts: AssistantReceipt[];
  semanticState: AgentSemanticState;
  error: string | null;
  isRunning: boolean;
  pendingConfirmation: PendingAssistantConfirmation | null;
  composerValue: string;
  onComposerChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onExpand: () => void;
  onConfirm: () => void;
  onCancelConfirmation: () => void;
  reduceMotion: boolean;
}

function confirmationTitle(pending: PendingAssistantConfirmation): string {
  if (pending.toolId === 'tasks.delete' && typeof pending.args === 'object' && pending.args !== null) {
    const args = pending.args as { ids?: unknown[]; id?: unknown };
    const count = Array.isArray(args.ids) ? args.ids.length : args.id ? 1 : 0;
    return count > 1 ? `Delete ${count} tasks?` : 'Delete this task?';
  }
  if (pending.toolId === 'app.navigate') return 'Open another AETHER surface?';
  return 'Confirm this action?';
}

export const AssistantSheet: React.FC<AssistantSheetProps> = ({
  surface,
  messages,
  receipts,
  semanticState,
  error,
  isRunning,
  pendingConfirmation,
  composerValue,
  onComposerChange,
  onSubmit,
  onClose,
  onExpand,
  onConfirm,
  onCancelConfirmation,
  reduceMotion,
}) => {
  const isDark = useIsDark();
  const { height: windowHeight } = useWindowDimensions();
  const height = useSharedValue(0);
  const isVisible = surface !== 'closed';
  const showConversation = surface === 'medium' || surface === 'full';
  const targetHeight =
    surface === 'opening' || surface === 'compact'
      ? 84
      : surface === 'medium'
        ? Math.min(470, windowHeight * 0.58)
        : surface === 'full'
          ? Math.min(720, windowHeight * 0.82)
          : 0;

  useEffect(() => {
    height.value = reduceMotion
      ? withTiming(targetHeight, { duration: 140 })
      : withSpring(targetHeight, { damping: 24, stiffness: 240, mass: 0.8 });
  }, [height, reduceMotion, targetHeight]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));
  if (!isVisible) return null;

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]} pointerEvents="box-none">
      <AssistantMaterial style={styles.sheet} borderRadius={Radius.xl}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
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
              {showConversation ? (
                <Pressable
                  onPress={onExpand}
                  accessibilityRole="button"
                  accessibilityLabel={surface === 'full' ? 'Collapse assistant conversation' : 'Expand assistant conversation'}
                  style={styles.headerButton}
                >
                  {surface === 'full' ? <ChevronDown size={19} color={Colors.zinc500} /> : <ChevronUp size={19} color={Colors.zinc500} />}
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close assistant" style={styles.headerButton}>
                <X size={19} color={Colors.zinc500} />
              </Pressable>
            </View>
          </View>

          {showConversation ? (
            <ScrollView
              style={styles.conversation}
              contentContainerStyle={styles.conversationContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {messages.length === 0 ? (
                <Typography variant="body" color={Colors.zinc500} style={styles.welcome}>
                  Ask about your tasks, or tell me what to change.
                </Typography>
              ) : (
                messages.map((message) => (
                  <View key={message.id} style={[styles.messageRow, message.role === 'user' && styles.userMessageRow]}>
                    <View style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble, { backgroundColor: message.role === 'user' ? (isDark ? Colors.white : Colors.black) : (isDark ? Colors.zinc800 : Colors.zinc100) }]}>
                      <Typography variant="body" color={message.role === 'user' ? (isDark ? Colors.black : Colors.white) : undefined}>
                        {message.text || (isRunning && message.role === 'assistant' ? ' ' : 'No response text.')}
                      </Typography>
                    </View>
                  </View>
                ))
              )}

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
                </View>
              ) : null}
            </ScrollView>
          ) : null}

          <View style={styles.composerContainer}>
            <AssistantComposer
              value={composerValue}
              onChangeText={onComposerChange}
              onSubmit={onSubmit}
              disabled={isRunning}
              autoFocus={surface === 'compact'}
            />
          </View>
        </KeyboardAvoidingView>
      </AssistantMaterial>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.sm,
    bottom: 0,
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
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  composerContainer: {
    paddingTop: Spacing.xs,
  },
});
