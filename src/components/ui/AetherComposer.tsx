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
import { Mic, Plus, ArrowUp } from 'lucide-react-native';
import { GlassSurface } from './GlassSurface';
import { AnimatedPressable } from './AnimatedPressable';
import { AetherQuickActionsMenu } from './AetherQuickActionsMenu';
import { LayoutTokens, Motion, Radius, Spacing } from '@/theme/tokens';
import { useSemanticColors } from '@/theme/useSemanticColors';

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
      {/* Background dismiss for quick actions menu */}
      {menuOpen ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Close menu"
          />
          <View style={styles.menuAnchor}>
            <AetherQuickActionsMenu
              onAddDate={onAddDate}
              onSetPriority={onSetPriority}
              onAddLocation={onAddLocation}
              onAttachFile={onAttachFile}
              onClose={() => setMenuOpen(false)}
            />
          </View>
        </>
      ) : null}

      <GlassSurface
        borderRadius={Radius.pill}
        intensity={Platform.OS === 'ios' ? 65 : 45}
        tier={Platform.OS === 'android' ? 'A' : undefined}
        style={styles.glassContainer}
        contentStyle={styles.content}
      >
        {/* Plus quick actions button */}
        <AnimatedPressable
          onPress={() => setMenuOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel="Quick actions"
          scaleTo={Motion.iconPressScale}
          style={styles.iconButton}
        >
          <Plus size={20} color={colors.textPrimary} strokeWidth={2.2} />
        </AnimatedPressable>

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
          <AnimatedPressable
            onPress={handleSubmit}
            accessibilityRole="button"
            accessibilityLabel="Create reminder"
            scaleTo={Motion.iconPressScale}
            style={[
              styles.sendButton,
              { backgroundColor: colors.interactive },
            ]}
          >
            <ArrowUp size={18} color={colors.interactiveForeground} strokeWidth={2.8} />
          </AnimatedPressable>
        ) : (
          <AnimatedPressable
            onPress={onVoicePress}
            accessibilityRole="button"
            accessibilityLabel="Speak reminder"
            scaleTo={Motion.iconPressScale}
            style={styles.iconButton}
          >
            <Mic size={20} color={colors.textPrimary} strokeWidth={2} />
          </AnimatedPressable>
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
    bottom: LayoutTokens.composerHeight + 10,
    left: 4,
    zIndex: 1000,
  },
});

