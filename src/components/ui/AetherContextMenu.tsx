import React from 'react';
import { DimensionValue, Pressable, StyleSheet, View } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { AetherContextSurface } from './AetherContextSurface';
import { Typography } from './Typography';
import { Colors, Hairline, Spacing } from '@/theme/tokens';
import { useSemanticColors } from '@/theme/useSemanticColors';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface AetherContextMenuProps {
  items: ContextMenuItem[];
  onClose?: () => void;
  width?: DimensionValue;
}

export const AetherContextMenu: React.FC<AetherContextMenuProps> = ({
  items,
  onClose,
  width = 220,
}) => {
  const colors = useSemanticColors();
  const isDark = useIsDark();

  return (
    <AetherContextSurface width={width}>
      {items.map((item, index) => {
        const Icon = item.icon;
        const textColor = item.destructive
          ? colors.destructive
          : item.disabled
          ? colors.textTertiary
          : colors.textPrimary;

        return (
          <React.Fragment key={item.id}>
            {index > 0 ? (
              <View
                style={[
                  styles.separator,
                  { backgroundColor: isDark ? Colors.separatorDark : Colors.separatorLight },
                ]}
              />
            ) : null}
            <Pressable
              onPress={() => {
                if (item.disabled) return;
                item.onPress();
                onClose?.();
              }}
              disabled={item.disabled}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                styles.item,
                pressed && { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
              ]}
            >
              <Typography variant="body" style={[styles.label, { color: textColor }]}>
                {item.label}
              </Typography>
              {Icon ? <Icon size={18} color={textColor} strokeWidth={1.8} /> : null}
            </Pressable>
          </React.Fragment>
        );
      })}
    </AetherContextSurface>
  );
};

const styles = StyleSheet.create({
  item: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '400',
  },
  separator: {
    height: Hairline.width,
    marginHorizontal: Spacing.md,
  },
});
