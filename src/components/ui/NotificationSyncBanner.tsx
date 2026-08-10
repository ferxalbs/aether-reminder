import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Button } from './Button';
import { Typography } from './Typography';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface NotificationSyncBannerProps {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}

export const NotificationSyncBanner: React.FC<NotificationSyncBannerProps> = ({
  message,
  onRetry,
  retrying = false,
}) => {
  const isDark = useIsDark();

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={`Notification sync error: ${message}`}
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
        },
      ]}
    >
      <View style={styles.messageRow}>
        <AlertTriangle size={18} color={isDark ? Colors.white : Colors.black} />
        <Typography
          variant="caption"
          color={isDark ? Colors.textDark : Colors.textLight}
          style={styles.message}
        >
          {message}
        </Typography>
      </View>
      <Button
        label="Retry"
        size="sm"
        variant="destructive"
        loading={retrying}
        disabled={retrying}
        onPress={onRetry}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  messageRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  message: {
    flex: 1,
  },
});
