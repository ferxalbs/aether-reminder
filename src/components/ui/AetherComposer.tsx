import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Mic, Plus, Send } from 'lucide-react-native';
import { GlassSurface } from './GlassSurface';
import { AetherQuickActionsMenu } from './AetherQuickActionsMenu';
import { LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useSemanticColors } from '@/theme/useSemanticColors';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface AetherComposerProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmit?: (text: string) => void;
  onVoicePress?: () => void;
  onAddDate?: () => void;
  onSetPriority?: () => void;
  onAddLocation?: () => void;
  onAttachFile?: () => void;
  disabled?: boolean;
}

export const AetherComposer: React.FC<AetherComposerProps> = ({
  value: externalValue,
  onChangeText: externalOnChangeText,
  onSubmit,
  onVoicePress,
  onAddDate,
  onSetPriority,
  onAddLocation,
  onAttachFile,
  disabled = false,
}) => {
  const [internalValue, setInternalValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const isDark = useIsDark();
  const colors = useSemanticColors();

  useEffect(() => {
    if (Platform.OS !== 'android' || !menuOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMenuOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [menuOpen]);

  const textValue = externalValue !== undefined ? externalValue : internalValue;
  const setTextValue = (text: string) => {
    if (externalOnChangeText) externalOnChangeText(text);
    else setInternalValue(text);
  };

  const handleSubmit = () => {
    const trimmed = textValue.trim();
    if (!trimmed) return;
    if (onSubmit) onSubmit(trimmed);
    setTextValue('');
    Keyboard.dismiss();
  };

  const hasText = textValue.trim().length > 0;

  return (
    <View style={styles.host} pointerEvents="box-none">
      {menuOpen ? (
        <View style={styles.menuAnchor}>
          <AetherQuickActionsMenu
            onAddDate={onAddDate}
            onSetPriority={onSetPriority}
            onAddLocation={onAddLocation}
            onAttachFile={onAttachFile}
            onClose={() => setMenuOpen(false)}
          />
        </View>
      ) : null}

      <GlassSurface
        borderRadius={Radius.pill}
        intensity={Platform.OS === 'ios' ? 65 : 45}
        tier={Platform.OS === 'android' ? 'A' : undefined}
        style={styles.glassContainer}
        contentStyle={styles.content}
      >
        {/* Plus quick actions button */}
        <Pressable
          onPress={() => setMenuOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel="Quick actions"
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' },
          ]}
        >
          <Plus size={20} color={colors.textPrimary} strokeWidth={2.2} />
        </Pressable>

        {/* Text Input */}
        <TextInput
          value={textValue}
          onChangeText={setTextValue}
          placeholder="New reminder…"
          placeholderTextColor={colors.textTertiary}
          editable={!disabled}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          autoCapitalize="sentences"
          autoCorrect
          accessibilityLabel="New reminder"
          style={[styles.input, { color: colors.textPrimary }]}
        />

        {/* Voice or Send Action */}
        {hasText ? (
          <Pressable
            onPress={handleSubmit}
            accessibilityRole="button"
            accessibilityLabel="Create reminder"
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: colors.interactive },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Send size={16} color={colors.interactiveForeground} strokeWidth={2.4} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onVoicePress}
            accessibilityRole="button"
            accessibilityLabel="Speak reminder"
            style={({ pressed }) => [
              styles.iconButton,
              pressed && { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' },
            ]}
          >
            <Mic size={20} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        )}
      </GlassSurface>
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    width: '100%',
    maxWidth: LayoutTokens.navigationMaxWidth,
    alignSelf: 'center',
  },
  glassContainer: {
    width: '100%',
    height: LayoutTokens.composerHeight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  content: {
    flex: 1,
    height: LayoutTokens.composerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    gap: Spacing.xs,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 15,
    paddingHorizontal: Spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  menuAnchor: {
    position: 'absolute',
    bottom: LayoutTokens.composerHeight + 8,
    left: 8,
    zIndex: 1000,
  },
});
