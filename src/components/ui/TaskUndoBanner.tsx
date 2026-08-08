import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import type { ActionReceipt } from '@/domain/receipts';
import { Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Button } from './Button';
import { Typography } from './Typography';

export interface TaskUndoBannerProps {
  receipt: ActionReceipt;
  error?: string | null;
  undoing?: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

export const TaskUndoBanner: React.FC<TaskUndoBannerProps> = ({
  receipt,
  error,
  undoing = false,
  onUndo,
  onDismiss,
}) => {
  const isDark = useIsDark();
  const textColor = isDark ? '#FEF3C7' : '#92400E';

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${receipt.summary}. Undo available.`}
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          backgroundColor: isDark ? 'rgba(120, 53, 15, 0.42)' : '#FFFBEB',
          borderColor: isDark ? 'rgba(251, 191, 36, 0.34)' : '#FDE68A',
        },
      ]}
    >
      <View style={styles.copyRow}>
        <AlertTriangle size={18} color={isDark ? '#FCD34D' : '#B45309'} />
        <View style={styles.copy}>
          <Typography variant="caption" color={textColor}>
            {receipt.summary}
          </Typography>
          {error ? (
            <Typography variant="tiny" color={isDark ? '#FECACA' : '#B91C1C'}>
              Undo failed: {error}
            </Typography>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label="Undo"
          variant="secondary"
          size="sm"
          loading={undoing}
          disabled={undoing}
          onPress={onUndo}
        />
        <Button
          label="Dismiss"
          variant="ghost"
          size="sm"
          disabled={undoing}
          onPress={onDismiss}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
});
