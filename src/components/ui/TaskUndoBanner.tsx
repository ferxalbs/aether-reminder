import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import type { ActionReceipt } from '@/domain/receipts';
import { Colors, Radius, Spacing } from '@/theme/tokens';
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
  const textColor = isDark ? Colors.textDark : Colors.textLight;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${receipt.summary}. Undo available.`}
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
        },
      ]}
    >
      <View style={styles.copy}>
        <Typography variant="caption" color={textColor} numberOfLines={1}>
          {error ? `Undo failed: ${error}` : receipt.summary}
        </Typography>
      </View>
      <Button
        label="Undo"
        variant="ghost"
        size="sm"
        loading={undoing}
        disabled={undoing}
        onPress={onUndo}
        style={styles.undoButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  copy: {
    flex: 1,
  },
  undoButton: {
    paddingHorizontal: Spacing.sm,
  },
});
