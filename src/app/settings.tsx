import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import {
  Key,
  Cpu,
  Moon,
  Vibrate,
  Info,
  Shield,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { FloatingToolbar } from '@/components/ui/FloatingToolbar';
import { DEFAULT_MODELS, useSettingsStore } from '@/stores/settings.store';
import { UserSettings } from '@/types';
import * as Haptics from 'expo-haptics';

export default function SettingsScreen() {
  const settings = useSettingsStore();
  const [apiKeyInput, setApiKeyInput] = useState(settings.openRouterApiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const theme = settings.theme;
  const isDark = theme === 'dark' || (theme === 'system' && true);

  const handleSaveApiKey = () => {
    settings.setApiKey(apiKeyInput);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert('Settings Saved', 'OpenRouter API Key has been updated.');
  };

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: isDark ? Colors.black : Colors.zinc50 },
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Typography variant="caption" color={Colors.zinc500}>
            PREFERENCES & AI
          </Typography>
          <Typography variant="display">Settings</Typography>
        </View>

        {/* Section 1: AI API Configuration */}
        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>
          OPENROUTER API CONFIGURATION
        </Typography>

        <Card variant="elevated" style={styles.cardSection}>
          <View style={styles.rowHeader}>
            <Key size={16} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="title" style={{ flex: 1 }}>
              API Key
            </Typography>
          </View>
          <Typography variant="caption" color={Colors.zinc500} style={{ marginBottom: Spacing.sm }}>
            Stored locally on device via AsyncStorage.
          </Typography>

          <View style={styles.inputContainer}>
            <TextInput
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="sk-or-v1-..."
              placeholderTextColor={Colors.zinc500}
              secureTextEntry={!showApiKey}
              autoCapitalize="none"
              style={[
                styles.apiKeyInput,
                {
                  color: isDark ? Colors.white : Colors.zinc950,
                  backgroundColor: isDark ? Colors.zinc800 : Colors.zinc100,
                },
              ]}
            />
            <AnimatedPressable
              onPress={() => setShowApiKey(!showApiKey)}
              style={styles.eyeButton}
            >
              {showApiKey ? (
                <EyeOff size={16} color={Colors.zinc400} />
              ) : (
                <Eye size={16} color={Colors.zinc400} />
              )}
            </AnimatedPressable>
          </View>

          <Button
            label="Save Key"
            onPress={handleSaveApiKey}
            variant="secondary"
            size="sm"
            style={{ marginTop: Spacing.sm }}
          />
        </Card>

        {/* Section 2: AI Model Selection */}
        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>
          SELECT AI MODEL
        </Typography>

        <Card variant="elevated" style={styles.cardSection}>
          <View style={styles.rowHeader}>
            <Cpu size={16} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="title">Default Reasoning Engine</Typography>
          </View>

          {DEFAULT_MODELS.map((m) => {
            const isSelected = settings.selectedModel === m.id;
            return (
              <AnimatedPressable
                key={m.id}
                onPress={() => {
                  settings.setModel(m.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }}
                scaleTo={0.97}
                style={[
                  styles.modelItem,
                  {
                    backgroundColor: isSelected
                      ? isDark
                        ? Colors.zinc800
                        : Colors.zinc100
                      : 'transparent',
                    borderColor: isSelected
                      ? isDark
                        ? Colors.white
                        : Colors.black
                      : isDark
                      ? Colors.zinc800
                      : Colors.zinc200,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Typography variant="bodyBold">{m.name}</Typography>
                  <Typography variant="caption" color={Colors.zinc500}>
                    {m.description}
                  </Typography>
                </View>
                {isSelected && (
                  <Check size={18} color={isDark ? Colors.white : Colors.black} />
                )}
              </AnimatedPressable>
            );
          })}
        </Card>

        {/* Section 3: Preferences */}
        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>
          APP PREFERENCES
        </Typography>

        <Card variant="elevated" style={styles.cardSection}>
          {/* Theme selector */}
          <View style={styles.toggleRow}>
            <View style={styles.rowHeader}>
              <Moon size={16} color={isDark ? Colors.white : Colors.black} />
              <Typography variant="bodyBold">Theme Preference</Typography>
            </View>
            <View style={styles.themeGroup}>
              {(['dark', 'light', 'system'] as UserSettings['theme'][]).map((t) => (
                <AnimatedPressable
                  key={t}
                  onPress={() => settings.setTheme(t)}
                  style={[
                    styles.themeChip,
                    {
                      backgroundColor: settings.theme === t
                        ? isDark
                          ? Colors.white
                          : Colors.black
                        : isDark
                        ? Colors.zinc800
                        : Colors.zinc200,
                    },
                  ]}
                >
                  <Typography
                    variant="tiny"
                    color={settings.theme === t ? (isDark ? Colors.black : Colors.white) : Colors.zinc500}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {t}
                  </Typography>
                </AnimatedPressable>
              ))}
            </View>
          </View>

          {/* Haptics toggle */}
          <View style={[styles.toggleRow, { marginTop: Spacing.md }]}>
            <View style={styles.rowHeader}>
              <Vibrate size={16} color={isDark ? Colors.white : Colors.black} />
              <Typography variant="bodyBold">Haptic Feedback</Typography>
            </View>
            <Switch
              value={settings.hapticsEnabled}
              onValueChange={(val) => {
                settings.setHapticsEnabled(val);
                Haptics.selectionAsync().catch(() => {});
              }}
              trackColor={{ false: Colors.zinc700, true: isDark ? Colors.white : Colors.black }}
              thumbColor={settings.hapticsEnabled ? (isDark ? Colors.black : Colors.white) : Colors.zinc400}
            />
          </View>
        </Card>

        {/* Section 4: About & Privacy */}
        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>
          ABOUT & LEGAL
        </Typography>

        <Card variant="elevated" style={styles.cardSection}>
          <AnimatedPressable
            onPress={() => setShowAbout(!showAbout)}
            style={styles.linkRow}
          >
            <Info size={16} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="bodyBold" style={{ flex: 1 }}>
              About TaskFlow AI
            </Typography>
          </AnimatedPressable>

          {showAbout && (
            <Typography variant="body" color={Colors.zinc400} style={styles.expandText}>
              TaskFlow AI v1.0.0. A high-performance, minimal productivity co-pilot designed with Apple Liquid Glass and Emil Kowalski interaction principles.
            </Typography>
          )}

          <View style={[styles.divider, { backgroundColor: isDark ? Colors.zinc800 : Colors.zinc200 }]} />

          <AnimatedPressable
            onPress={() => setShowPrivacy(!showPrivacy)}
            style={styles.linkRow}
          >
            <Shield size={16} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="bodyBold" style={{ flex: 1 }}>
              Privacy Information
            </Typography>
          </AnimatedPressable>

          {showPrivacy && (
            <Typography variant="body" color={Colors.zinc400} style={styles.expandText}>
              Your tasks and API keys are stored strictly on your local device. Requests sent to OpenRouter API only transmit task descriptions needed for AI summarization. No data is tracked or sold.
            </Typography>
          )}
        </Card>
      </ScrollView>

      <FloatingToolbar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 110,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  cardSection: {
    marginBottom: Spacing.md,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  apiKeyInput: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 14,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  themeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: Spacing.xs,
  },
  expandText: {
    marginTop: Spacing.xs,
    fontSize: 13,
    lineHeight: 19,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
});
