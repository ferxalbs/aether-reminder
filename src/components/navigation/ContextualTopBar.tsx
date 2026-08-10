import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { MoreHorizontal } from 'lucide-react-native';
import { LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useSemanticColors } from '@/theme/useSemanticColors';

interface ContextualTopBarProps {
  actions?: MenuAction[];
  accessibilityLabel?: string;
  onAction?: (actionId: string) => void;
}

/**
 * Screen-local chrome. It intentionally contains actions, never app destinations.
 * Expo UI maps the menu to SwiftUI Menu on iOS and Compose DropdownMenu on Android.
 */
export function ContextualTopBar({
  actions = [],
  accessibilityLabel = 'More actions',
  onAction,
}: ContextualTopBarProps) {
  const colors = useSemanticColors();

  if (actions.length === 0) return null;

  return (
    <View style={styles.host}>
      <MenuView
        actions={actions}
        onPressAction={(event) => onAction?.(event.nativeEvent.event)}
        style={styles.menu}
      >
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.control,
            {
              backgroundColor: colors.elevatedSurface,
              borderColor: colors.border,
            },
          ]}
        >
          <MoreHorizontal size={20} color={colors.textPrimary} strokeWidth={2.2} />
        </View>
      </MenuView>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
    maxWidth: LayoutTokens.contentMaxWidth,
    minHeight: 44,
    alignSelf: 'center',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: LayoutTokens.screenHorizontal,
    marginTop: Spacing.xs,
  },
  menu: {
    borderRadius: Radius.md,
  },
  control: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
  },
});
