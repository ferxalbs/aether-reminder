import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, Layout, useReducedMotion } from 'react-native-reanimated';
import {
  Check,
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  Info,
  Key,
  Lock,
  Mic,
  Moon,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Vibrate,
  X,
} from 'lucide-react-native';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';
import { useSettingsStore } from '@/stores/settings.store';
import { DEFAULT_OPENROUTER_MODEL_ID, type AIModel } from '@/services/ai/models';
import { canRunAsAgent } from '@/services/ai/inference';
import { fetchAvailableModels, testOpenRouterConnection } from '@/services/ai/openrouter';
import { testOpenAIRealtimeConnection } from '@/services/transcription';
import { getAIErrorMessage } from '@/services/ai/providers';
import type { UserSettings } from '@/types';
import * as Haptics from 'expo-haptics';
import { notificationAsync } from '@/lib/haptics';
import { reportNonFatalError } from '@/lib/nonFatalError';

const settingsEntering = Platform.OS === 'ios' ? FadeInDown.duration(240).damping(20).stiffness(200) : undefined;
const settingsLayout = Platform.OS === 'ios' ? Layout.springify().damping(20).stiffness(200) : undefined;

function formatContextLength(contextLength?: number): string {
  if (!contextLength) return 'Context unknown';
  if (contextLength >= 1000000) return `${(contextLength / 1000000).toFixed(1)}M context`;
  if (contextLength >= 1000) return `${Math.round(contextLength / 1000)}k context`;
  return `${contextLength} tokens`;
}

type ProviderName = 'OpenRouter' | 'OpenAI';

export default function SettingsScreen() {
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion ? undefined : settingsEntering;
  const theme = useSettingsStore((s) => s.theme);
  const openRouterApiKey = useSettingsStore((s) => s.openRouterApiKey);
  const openAiApiKey = useSettingsStore((s) => s.openAiApiKey);
  const openRouterKeyLoaded = useSettingsStore((s) => s.openRouterKeyLoaded);
  const openAiKeyLoaded = useSettingsStore((s) => s.openAiKeyLoaded);
  const openRouterConfigured = useSettingsStore((s) => s.openRouterConfigured);
  const openAiConfigured = useSettingsStore((s) => s.openAiConfigured);
  const secureStoreAvailable = useSettingsStore((s) => s.secureStoreAvailable);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const autoSummarize = useSettingsStore((s) => s.autoSummarize);

  const loadCredentials = useSettingsStore((s) => s.loadCredentials);
  const setOpenRouterApiKey = useSettingsStore((s) => s.setOpenRouterApiKey);
  const deleteOpenRouterApiKey = useSettingsStore((s) => s.deleteOpenRouterApiKey);
  const setOpenAiApiKey = useSettingsStore((s) => s.setOpenAiApiKey);
  const deleteOpenAiApiKey = useSettingsStore((s) => s.deleteOpenAiApiKey);
  const setModel = useSettingsStore((s) => s.setModel);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const setAutoSummarize = useSettingsStore((s) => s.setAutoSummarize);

  const [openRouterInput, setOpenRouterInput] = useState('');
  const [openAiInput, setOpenAiInput] = useState('');
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [savingProvider, setSavingProvider] = useState<ProviderName | null>(null);
  const [testingProvider, setTestingProvider] = useState<ProviderName | null>(null);
  const [openRouterMessage, setOpenRouterMessage] = useState<string | null>(null);
  const [openAiMessage, setOpenAiMessage] = useState<string | null>(null);

  const [models, setModels] = useState<AIModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');

  // Model Picker Modal Sheet State
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const isDark = useIsDark();
  const keyStateLoaded = openRouterKeyLoaded && openAiKeyLoaded;

  const assistantContext = useMemo(
    () => ({
      surface: 'settings',
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      invocationSource: 'app' as const,
    }),
    []
  );
  useAssistantSurface(assistantContext);

  useEffect(() => {
    void loadCredentials().catch((error: unknown) => {
      reportNonFatalError('settings-credentials-load', error);
    });
  }, [loadCredentials]);

  const loadModels = (forceRefresh = false) => {
    setModelsLoading(true);
    setModelsError(null);
    void fetchAvailableModels(openRouterApiKey, forceRefresh)
      .then(setModels)
      .catch((error: unknown) => setModelsError(getAIErrorMessage(error)))
      .finally(() => setModelsLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    void fetchAvailableModels(openRouterApiKey, false)
      .then((availableModels) => {
        if (!cancelled) setModels(availableModels);
      })
      .catch((error: unknown) => {
        if (!cancelled) setModelsError(getAIErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openRouterApiKey]);

  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return query
      ? models.filter((model) => `${model.name} ${model.provider} ${model.id}`.toLowerCase().includes(query))
      : models;
  }, [modelSearch, models]);

  const activeModelDetails = useMemo(() => {
    const found = models.find((m) => m.id === selectedModel);
    if (found) return found;
    return {
      id: selectedModel,
      name: selectedModel.split('/').pop() || selectedModel,
      provider: selectedModel.split('/')[0] || 'OpenRouter',
      availability: 'available' as const,
    };
  }, [models, selectedModel]);

  const saveKey = async (provider: ProviderName) => {
    const input = provider === 'OpenRouter' ? openRouterInput : openAiInput;
    if (!input.trim()) {
      Alert.alert('API Key Required', `Enter an ${provider} API key before saving.`);
      return;
    }
    setSavingProvider(provider);
    const setKey = provider === 'OpenRouter' ? setOpenRouterApiKey : setOpenAiApiKey;
    try {
      await setKey(input);
      if (provider === 'OpenRouter') {
        setOpenRouterInput('');
        setShowOpenRouterKey(false);
        setOpenRouterMessage('OpenRouter key saved securely in SecureStore.');
      } else {
        setOpenAiInput('');
        setShowOpenAiKey(false);
        setOpenAiMessage('OpenAI key saved securely in SecureStore.');
      }
      if (hapticsEnabled) {
        notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error: unknown) => {
          reportNonFatalError('haptics', error);
        });
      }
    } catch (error) {
      Alert.alert(`${provider} Key Not Saved`, getAIErrorMessage(error));
    } finally {
      setSavingProvider(null);
    }
  };

  const testConnection = async (provider: ProviderName) => {
    const input = provider === 'OpenRouter' ? openRouterInput : openAiInput;
    const savedKey = provider === 'OpenRouter' ? openRouterApiKey : openAiApiKey;
    const keyToTest = input.trim() || savedKey;
    if (!keyToTest) {
      Alert.alert('API Key Required', `Save an ${provider} key or enter one to test.`);
      return;
    }
    setTestingProvider(provider);
    try {
      const result = provider === 'OpenRouter'
        ? await testOpenRouterConnection(keyToTest)
        : await testOpenAIRealtimeConnection(keyToTest);
      const message = `✓ ${result.provider} API connection verified.`;
      if (provider === 'OpenRouter') setOpenRouterMessage(message);
      else setOpenAiMessage(message);
      if (hapticsEnabled) {
        notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error: unknown) => {
          reportNonFatalError('haptics', error);
        });
      }
    } catch (error) {
      const message = `✕ ${getAIErrorMessage(error)}`;
      if (provider === 'OpenRouter') setOpenRouterMessage(message);
      else setOpenAiMessage(message);
    } finally {
      setTestingProvider(null);
    }
  };

  const deleteKey = (provider: ProviderName) => {
    const configured = provider === 'OpenRouter' ? openRouterConfigured : openAiConfigured;
    if (!configured) {
      if (provider === 'OpenRouter') setOpenRouterInput('');
      else setOpenAiInput('');
      return;
    }
    Alert.alert(
      `Delete ${provider} API Key?`,
      provider === 'OpenRouter'
        ? 'This disables AI reasoning and automated task actions until another OpenRouter key is saved.'
        : 'This disables realtime voice transcription until another OpenAI key is saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Key',
          style: 'destructive',
          onPress: () => {
            const deleteSavedKey = provider === 'OpenRouter'
              ? deleteOpenRouterApiKey
              : deleteOpenAiApiKey;
            void deleteSavedKey()
              .then(() => {
                if (provider === 'OpenRouter') {
                  setOpenRouterInput('');
                  setOpenRouterMessage('OpenRouter key deleted from SecureStore.');
                } else {
                  setOpenAiInput('');
                  setOpenAiMessage('OpenAI key deleted from SecureStore.');
                }
                if (hapticsEnabled) {
                  notificationAsync(Haptics.NotificationFeedbackType.Warning).catch((error: unknown) => {
                    reportNonFatalError('haptics', error);
                  });
                }
              })
              .catch((error: unknown) => Alert.alert(`${provider} Key Not Deleted`, getAIErrorMessage(error)));
          },
        },
      ]
    );
  };

  const storageDescription = !keyStateLoaded
    ? 'Checking secure hardware storage…'
    : secureStoreAvailable
      ? 'Keys are encrypted locally in Expo SecureStore. Only non-secret preferences use local storage.'
      : 'Secure storage is unavailable in this environment.';

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[
        styles.safeArea,
        { backgroundColor: isDark ? Colors.backgroundDark : Colors.backgroundLight },
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={entering} style={styles.header}>
          <Typography variant="display" style={styles.headerTitle}>
            Settings
          </Typography>
          <Typography variant="body" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.headerDescription}>
            Private, local preferences for AI, voice, appearance, and feedback.
          </Typography>
        </Animated.View>

        {/* Section 1: OpenRouter AI Reasoning */}
        <Animated.View entering={entering}>
          <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.sectionHeader}>
            OPENROUTER — AI REASONING
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                <Key size={18} color={isDark ? Colors.white : Colors.black} />
              </View>
              <View style={styles.headerTextGroup}>
                <Typography variant="title">OpenRouter API Key</Typography>
                <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  Powers AETHER’s tool reasoning agent.
                </Typography>
              </View>
            </View>

            <View style={[styles.statusBanner, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
              <View style={{ flex: 1 }}>
                <Typography variant="tiny" color={openRouterConfigured ? (isDark ? Colors.white : Colors.black) : isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  KEY STATUS
                </Typography>
                <Typography variant="bodyBold" style={{ color: isDark ? Colors.white : Colors.black }}>
                  {openRouterKeyLoaded ? (openRouterConfigured ? 'Saved in SecureStore' : 'No key configured') : 'Checking SecureStore…'}
                </Typography>
              </View>
              {openRouterConfigured && <Shield size={18} color={isDark ? Colors.white : Colors.black} />}
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                value={openRouterInput}
                onChangeText={setOpenRouterInput}
                placeholder={openRouterConfigured ? '••••••••••••••••••••••••' : 'Enter OpenRouter API Key'}
                placeholderTextColor={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
                secureTextEntry={!showOpenRouterKey}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.textInput,
                  {
                    color: isDark ? Colors.white : Colors.black,
                    backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
                    borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                  },
                ]}
              />
              <AnimatedPressable
                onPress={() => {
                  setShowOpenRouterKey((v) => !v);
                }}
                style={styles.eyeButton}
                accessibilityLabel={showOpenRouterKey ? 'Hide key' : 'Show key'}
              >
                {showOpenRouterKey ? <EyeOff size={18} color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} /> : <Eye size={18} color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} />}
              </AnimatedPressable>
            </View>

            <Typography variant="caption" color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} style={styles.storageNote}>
              {storageDescription}
            </Typography>

            <View style={styles.buttonStack}>
              <Button
                label="Save Key"
                onPress={() => void saveKey('OpenRouter')}
                variant={openRouterConfigured ? 'secondary' : 'primary'}
                loading={savingProvider === 'OpenRouter'}
                disabled={!secureStoreAvailable || !openRouterKeyLoaded || testingProvider !== null || !openRouterInput.trim()}
                fullWidth
              />
              <Button
                label="Test Connection"
                onPress={() => void testConnection('OpenRouter')}
                variant="secondary"
                loading={testingProvider === 'OpenRouter'}
                disabled={!openRouterKeyLoaded || savingProvider !== null}
                fullWidth
              />
              {openRouterConfigured || openRouterInput.trim() ? (
                <Button
                  label="Delete Key"
                  onPress={() => deleteKey('OpenRouter')}
                  variant="destructive"
                  icon={<Trash2 size={16} color={isDark ? Colors.white : Colors.black} />}
                  disabled={!openRouterKeyLoaded || savingProvider !== null || testingProvider !== null}
                  fullWidth
                />
              ) : null}
            </View>

            {openRouterMessage ? (
              <Typography
                variant="caption"
                color={isDark ? Colors.white : Colors.black}
                style={styles.statusMessage}
              >
                {openRouterMessage}
              </Typography>
            ) : null}
          </Card>
        </Animated.View>

        {/* Section 2: OpenAI Realtime Transcription */}
        <Animated.View entering={entering}>
          <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.sectionHeader}>
            OPENAI — REALTIME TRANSCRIPTION
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                <Mic size={18} color={isDark ? Colors.white : Colors.black} />
              </View>
              <View style={styles.headerTextGroup}>
                <Typography variant="title">OpenAI API Key</Typography>
                <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  Used strictly for realtime voice transcription.
                </Typography>
              </View>
            </View>

            <View style={[styles.statusBanner, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
              <View style={{ flex: 1 }}>
                <Typography variant="tiny" color={openAiConfigured ? (isDark ? Colors.white : Colors.black) : isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  KEY STATUS
                </Typography>
                <Typography variant="bodyBold" style={{ color: isDark ? Colors.white : Colors.black }}>
                  {openAiKeyLoaded ? (openAiConfigured ? 'Saved in SecureStore' : 'No key configured') : 'Checking SecureStore…'}
                </Typography>
              </View>
              {openAiConfigured && <Shield size={18} color={isDark ? Colors.white : Colors.black} />}
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                value={openAiInput}
                onChangeText={setOpenAiInput}
                placeholder={openAiConfigured ? '••••••••••••••••••••••••' : 'Enter OpenAI API Key'}
                placeholderTextColor={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
                secureTextEntry={!showOpenAiKey}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.textInput,
                  {
                    color: isDark ? Colors.white : Colors.black,
                    backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
                    borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                  },
                ]}
              />
              <AnimatedPressable
                onPress={() => {
                  setShowOpenAiKey((v) => !v);
                }}
                style={styles.eyeButton}
                accessibilityLabel={showOpenAiKey ? 'Hide key' : 'Show key'}
              >
                {showOpenAiKey ? <EyeOff size={18} color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} /> : <Eye size={18} color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} />}
              </AnimatedPressable>
            </View>

            <Typography variant="caption" color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} style={styles.storageNote}>
              {storageDescription}
            </Typography>

            <View style={styles.buttonStack}>
              <Button
                label="Save Key"
                onPress={() => void saveKey('OpenAI')}
                variant={openAiConfigured ? 'secondary' : 'primary'}
                loading={savingProvider === 'OpenAI'}
                disabled={!secureStoreAvailable || !openAiKeyLoaded || testingProvider !== null || !openAiInput.trim()}
                fullWidth
              />
              <Button
                label="Test Connection"
                onPress={() => void testConnection('OpenAI')}
                variant="secondary"
                loading={testingProvider === 'OpenAI'}
                disabled={!openAiKeyLoaded || savingProvider !== null}
                fullWidth
              />
              {openAiConfigured || openAiInput.trim() ? (
                <Button
                  label="Delete Key"
                  onPress={() => deleteKey('OpenAI')}
                  variant="destructive"
                  icon={<Trash2 size={16} color={isDark ? Colors.white : Colors.black} />}
                  disabled={!openAiKeyLoaded || savingProvider !== null || testingProvider !== null}
                  fullWidth
                />
              ) : null}
            </View>

            {openAiMessage ? (
              <Typography
                variant="caption"
                color={isDark ? Colors.white : Colors.black}
                style={styles.statusMessage}
              >
                {openAiMessage}
              </Typography>
            ) : null}
          </Card>
        </Animated.View>

        {/* Section 3: OpenRouter Model Selection */}
        <Animated.View entering={entering}>
          <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.sectionHeader}>
            MODEL SELECTION
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                <Cpu size={18} color={isDark ? Colors.white : Colors.black} />
              </View>
              <View style={styles.headerTextGroup}>
                <Typography variant="title">Tool-Enabled Model</Typography>
                <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  Active: {activeModelDetails.name}
                </Typography>
              </View>
            </View>

            {/* Active Model Card */}
            <View style={[styles.activeModelCard, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight }]}>
              <View style={{ flex: 1 }}>
                <Typography variant="tiny" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={{ letterSpacing: 0.5 }}>
                  SELECTED MODEL ID
                </Typography>
                <Typography variant="bodyBold" style={{ marginTop: 2 }}>
                  {selectedModel}
                </Typography>
                <Typography variant="tiny" color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} style={{ marginTop: 2 }}>
                  Provider: {activeModelDetails.provider}
                </Typography>
              </View>

              {selectedModel !== DEFAULT_OPENROUTER_MODEL_ID ? (
                <AnimatedPressable
                  onPress={() => {
                    setModel(DEFAULT_OPENROUTER_MODEL_ID);
                  }}
                  style={[styles.resetButton, { borderColor: isDark ? Colors.borderDark : Colors.borderLight }]}
                  accessibilityLabel="Reset model to default"
                >
                  <RotateCcw size={14} color={isDark ? Colors.white : Colors.black} />
                  <Typography variant="tiny" style={{ color: isDark ? Colors.white : Colors.black }}>
                    Reset
                  </Typography>
                </AnimatedPressable>
              ) : (
                <View style={[styles.defaultBadge, { backgroundColor: isDark ? Colors.borderDark : Colors.borderLight }]}>
                  <Typography variant="tiny" color={isDark ? Colors.white : Colors.black}>
                    Default
                  </Typography>
                </View>
              )}
            </View>

            <AnimatedPressable
              onPress={() => {
                setModelPickerVisible(true);
              }}
              scaleTo={0.98}
              style={[
                styles.pullDownButton,
                {
                  backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
                  borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                },
              ]}
            >
              <Typography variant="bodyBold" style={{ flex: 1 }}>
                Change Reasoning Model…
              </Typography>
              <ChevronDown size={18} color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} />
            </AnimatedPressable>
          </Card>
        </Animated.View>

        {/* Section 4: App Preferences */}
        <Animated.View entering={entering}>
          <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.sectionHeader}>
            APP PREFERENCES
          </Typography>
          <Card variant="outline" style={styles.cardSection}>

            {/* Segmented Control for Theme Preference */}
            <View style={{ marginBottom: Spacing.xs }}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.iconCircle, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                  <Moon size={18} color={isDark ? Colors.white : Colors.black} />
                </View>
                <Typography variant="bodyBold" style={{ flex: 1 }}>
                  Theme Preference
                </Typography>
              </View>

              <View
                style={[
                  styles.segmentedContainer,
                  {
                    backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
                    borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                  },
                ]}
              >
                {(['dark', 'light', 'system'] as UserSettings['theme'][]).map((val) => {
                  const isActive = theme === val;
                  const label = val === 'system' ? 'System' : val === 'dark' ? 'OLED Dark' : 'Light';
                  return (
                    <AnimatedPressable
                      key={val}
                      onPress={() => {
                        setTheme(val);
                      }}
                      scaleTo={0.97}
                      style={[
                        styles.segmentedItem,
                        {
                          backgroundColor: isActive
                            ? (isDark ? Colors.white : Colors.black)
                            : 'transparent',
                        },
                      ]}
                    >
                      <Typography
                        variant="caption"
                        style={{
                          color: isActive ? (isDark ? Colors.black : Colors.white) : isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight,
                          fontWeight: isActive ? '600' : '500',
                        }}
                      >
                        {label}
                      </Typography>
                    </AnimatedPressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? Colors.borderDark : Colors.borderLight }]} />

            {/* Haptic Feedback Switch */}
            <View style={styles.rowBetween}>
              <View style={styles.rowLeftGroup}>
                <View style={[styles.iconCircle, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                  <Vibrate size={18} color={isDark ? Colors.white : Colors.black} />
                </View>
                <View style={{ flex: 1 }}>
                  <Typography variant="bodyBold">Haptic Feedback</Typography>
                  <Typography variant="tiny" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                    Tactile touch responses on actions
                  </Typography>
                </View>
              </View>
              <ToggleSwitch
                value={hapticsEnabled}
                onValueChange={(enabled) => setHapticsEnabled(enabled)}
                accessibilityLabel="Haptic Feedback"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? Colors.borderDark : Colors.borderLight }]} />

            {/* Auto Task Summarize Switch */}
            <View style={styles.rowBetween}>
              <View style={styles.rowLeftGroup}>
                <View style={[styles.iconCircle, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                  <Sparkles size={18} color={isDark ? Colors.white : Colors.black} />
                </View>
                <View style={{ flex: 1 }}>
                  <Typography variant="bodyBold">Auto Task Summarize</Typography>
                  <Typography variant="tiny" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                    Automatically suggest task details with AI
                  </Typography>
                </View>
              </View>
              <ToggleSwitch
                value={autoSummarize}
                onValueChange={(enabled) => setAutoSummarize(enabled)}
                accessibilityLabel="Auto Task Summarize"
              />
            </View>

          </Card>
        </Animated.View>

        {/* Section 5: Hardware Security & Storage */}
        <Animated.View entering={entering}>
          <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.sectionHeader}>
            SECURITY INTEGRITY
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                <Lock size={18} color={isDark ? Colors.white : Colors.black} />
              </View>
              <View style={styles.headerTextGroup}>
                <Typography variant="bodyBold">Expo SecureStore Encrypted</Typography>
                <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  API keys are stored strictly in hardware Keychain / Keystore and never written to AsyncStorage or cloud backups.
                </Typography>
              </View>
            </View>
          </Card>
        </Animated.View>

        {/* Section 6: About & Privacy Accordions */}
        <Animated.View entering={entering}>
          <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.sectionHeader}>
            ABOUT & LEGAL
          </Typography>
          <Card variant="outline" style={styles.cardSection}>

            {/* About AETHER */}
            <AnimatedLayoutView>
              <AnimatedPressable
                onPress={() => {
                  setShowAbout((v) => !v);
                }}
                style={styles.accordionHeader}
              >
                <View style={[styles.iconCircle, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                  <Info size={18} color={isDark ? Colors.white : Colors.black} />
                </View>
                <Typography variant="bodyBold" style={{ flex: 1 }}>
                  About AETHER
                </Typography>
              </AnimatedPressable>
              {showAbout ? (
                <Animated.View layout={settingsLayout} style={styles.accordionBody}>
                  <Typography variant="body" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.accordionText}>
                    AETHER is a local-first, privacy-respecting task assistant. OpenRouter powers reasoning and tool execution; OpenAI powers realtime voice transcription.
                  </Typography>
                </Animated.View>
              ) : null}
            </AnimatedLayoutView>

            <View style={[styles.divider, { backgroundColor: isDark ? Colors.borderDark : Colors.borderLight }]} />

            {/* Privacy Policy */}
            <AnimatedLayoutView>
              <AnimatedPressable
                onPress={() => {
                  setShowPrivacy((v) => !v);
                }}
                style={styles.accordionHeader}
              >
                <View style={[styles.iconCircle, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                  <Shield size={18} color={isDark ? Colors.white : Colors.black} />
                </View>
                <Typography variant="bodyBold" style={{ flex: 1 }}>
                  Privacy Information
                </Typography>
              </AnimatedPressable>
              {showPrivacy ? (
                <Animated.View layout={settingsLayout} style={styles.accordionBody}>
                  <Typography variant="body" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.accordionText}>
                    API keys remain isolated in SecureStore and are never included in analytics, error logs, or AsyncStorage. Task content is sent to OpenRouter only when requested. Voice audio is streamed to OpenAI only during active transcription sessions.
                  </Typography>
                </Animated.View>
              ) : null}
            </AnimatedLayoutView>

          </Card>

          {/* App Version Footer */}
          <Typography variant="tiny" align="center" color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} style={styles.versionFooter}>
            AETHER v1.0.0 • Expo SDK 57
          </Typography>
        </Animated.View>

      </ScrollView>

      {/* Model Selector Modal Sheet */}
      <Modal
        visible={modelPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModelPickerVisible(false)}
      >
        <View
          style={[
            styles.sheetOverlay,
            { backgroundColor: isDark ? Colors.scrimDark : Colors.scrimLight },
          ]}
        >
          <View style={[styles.sheetContainer, { backgroundColor: isDark ? Colors.surfaceDark : Colors.surfaceLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight }]}>

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Typography variant="title">OpenRouter Model Catalog</Typography>
                <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  Select a tool-capable reasoning model
                </Typography>
              </View>

              <AnimatedPressable
                onPress={() => {
                  loadModels(true);
                }}
                accessibilityLabel="Force refresh model catalog"
                style={styles.iconPressable}
              >
                <RefreshCw size={18} color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} />
              </AnimatedPressable>

              <AnimatedPressable
                onPress={() => setModelPickerVisible(false)}
                style={styles.iconPressable}
              >
                <X size={20} color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} />
              </AnimatedPressable>
            </View>

            <View style={[styles.searchBox, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight }]}>
              <Search size={16} color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight} />
              <TextInput
                value={modelSearch}
                onChangeText={setModelSearch}
                placeholder="Search models or providers…"
                placeholderTextColor={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
                style={[styles.searchInput, { color: isDark ? Colors.textDark : Colors.textLight }]}
              />
            </View>

            {modelsLoading ? (
              <ActivityIndicator style={styles.centerLoader} color={isDark ? Colors.white : Colors.black} />
            ) : modelsError ? (
              <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.modelsErrorText}>
                {modelsError}
              </Typography>
            ) : filteredModels.length === 0 ? (
              <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.modelsErrorText}>
                No models match &quot;{modelSearch}&quot;.
              </Typography>
            ) : (
              <FlatList
                style={styles.sheetScrollView}
                data={filteredModels}
                keyExtractor={(model) => model.id}
                showsVerticalScrollIndicator={false}
                initialNumToRender={10}
                windowSize={7}
                renderItem={({ item: model }) => {
                  const isSelected = selectedModel === model.id;
                  const isSelectable = model.availability === 'available' && canRunAsAgent(model.capabilities);
                  const statusLabel = model.availability !== 'available'
                    ? 'Unavailable'
                    : isSelectable
                      ? 'Agent-Ready'
                      : 'No Tool Support';

                  return (
                    <AnimatedPressable
                      onPress={() => {
                        if (isSelectable) {
                          setModel(model.id);
                          setModelPickerVisible(false);
                        }
                      }}
                      disabled={!isSelectable}
                      scaleTo={0.98}
                      style={[
                        styles.modelCardItem,
                        {
                          backgroundColor: isSelected
                            ? (isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight)
                            : 'transparent',
                          borderColor: isSelected
                            ? (isDark ? Colors.white : Colors.black)
                            : (isDark ? Colors.borderDark : Colors.borderLight),
                          opacity: isSelectable || isSelected ? 1 : 0.45,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Typography variant="bodyBold">{model.name}</Typography>
                        <View style={styles.modelMetadataRow}>
                          <Typography variant="tiny" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                            {model.provider}
                          </Typography>
                          <Typography variant="tiny" color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}>
                            • {formatContextLength(model.contextLength)}
                          </Typography>
                          <View style={[styles.capabilityPill, { backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight, borderColor: isDark ? Colors.borderDark : Colors.borderLight, borderWidth: 1 }]}>
                            <Typography variant="tiny" style={{ color: isDark ? Colors.white : Colors.black }}>
                              {statusLabel}
                            </Typography>
                          </View>
                        </View>
                      </View>
                      {isSelected ? <Check size={18} color={isDark ? Colors.white : Colors.black} /> : null}
                    </AnimatedPressable>
                  );
                }}
              />
            )}

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function AnimatedLayoutView({ children }: { children: React.ReactNode }) {
  return <Animated.View layout={settingsLayout}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
    maxWidth: LayoutTokens.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: LayoutTokens.screenHorizontal,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.huge,
  },
  header: {
    maxWidth: LayoutTokens.readingMaxWidth,
    marginBottom: Spacing.xxl,
  },
  headerTitle: {
    letterSpacing: -0.8,
  },
  headerDescription: {
    marginTop: Spacing.sm,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.45,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  cardSection: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextGroup: {
    flex: 1,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  textInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    paddingRight: 48,
    fontSize: 14,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  storageNote: {
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  buttonStack: {
    flexDirection: 'column',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  statusMessage: {
    marginTop: Spacing.sm,
    fontWeight: '600',
  },
  activeModelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  defaultBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pullDownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginTop: Spacing.xs,
  },
  segmentedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  segmentedItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  iconPressable: {
    padding: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  accordionBody: {
    marginTop: Spacing.sm,
  },
  accordionText: {
    fontSize: 13,
    lineHeight: 20,
  },
  versionFooter: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    height: '75%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: Spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.md,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
  centerLoader: {
    marginVertical: Spacing.xl,
  },
  modelsErrorText: {
    marginVertical: Spacing.md,
  },
  sheetScrollView: {
    flex: 1,
  },
  modelCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  modelMetadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  capabilityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
});
