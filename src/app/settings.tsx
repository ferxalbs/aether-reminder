import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Check,
  Cpu,
  Eye,
  EyeOff,
  Info,
  Key,
  Mic,
  Moon,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Vibrate,
} from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';
import { useSettingsStore } from '@/stores/settings.store';
import { DEFAULT_OPENROUTER_MODEL_ID, type AIModel } from '@/services/ai/models';
import { canRunAsAgent } from '@/services/ai/inference';
import { fetchAvailableModels, testOpenRouterConnection } from '@/services/ai/openrouter';
import { testOpenAIRealtimeConnection } from '@/services/transcription';
import { getAIErrorMessage } from '@/services/ai/providers';
import type { UserSettings } from '@/types';
import * as Haptics from 'expo-haptics';

function formatContextLength(contextLength?: number): string {
  return contextLength ? `${contextLength.toLocaleString()} token context` : 'Context size unavailable';
}

type ProviderName = 'OpenRouter' | 'OpenAI';

export default function SettingsScreen() {
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
  const loadCredentials = useSettingsStore((s) => s.loadCredentials);
  const setOpenRouterApiKey = useSettingsStore((s) => s.setOpenRouterApiKey);
  const deleteOpenRouterApiKey = useSettingsStore((s) => s.deleteOpenRouterApiKey);
  const setOpenAiApiKey = useSettingsStore((s) => s.setOpenAiApiKey);
  const deleteOpenAiApiKey = useSettingsStore((s) => s.deleteOpenAiApiKey);
  const setModel = useSettingsStore((s) => s.setModel);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);

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
    void loadCredentials();
  }, [loadCredentials]);

  const loadModels = () => {
    setModelsLoading(true);
    setModelsError(null);
    void fetchAvailableModels()
      .then(setModels)
      .catch((error: unknown) => setModelsError(getAIErrorMessage(error)))
      .finally(() => setModelsLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    void fetchAvailableModels()
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
  }, []);

  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return query
      ? models.filter((model) => `${model.name} ${model.provider} ${model.id}`.toLowerCase().includes(query))
      : models;
  }, [modelSearch, models]);

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
        setOpenRouterMessage('OpenRouter key saved securely.');
      } else {
        setOpenAiInput('');
        setShowOpenAiKey(false);
        setOpenAiMessage('OpenAI key saved securely.');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
      const message = `${result.provider} connection is working.`;
      if (provider === 'OpenRouter') setOpenRouterMessage(message);
      else setOpenAiMessage(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error) {
      const message = getAIErrorMessage(error);
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
      `Delete ${provider} API key?`,
      provider === 'OpenRouter'
        ? 'This disables AI reasoning and task actions until another OpenRouter key is saved.'
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
                  setOpenRouterMessage('OpenRouter key deleted.');
                } else {
                  setOpenAiInput('');
                  setOpenAiMessage('OpenAI key deleted.');
                }
              })
              .catch((error: unknown) => Alert.alert(`${provider} Key Not Deleted`, getAIErrorMessage(error)));
          },
        },
      ]
    );
  };

  const storageDescription = !keyStateLoaded
    ? 'Checking secure storage…'
    : secureStoreAvailable
      ? 'Keys are stored locally in Expo SecureStore. Only non-secret preferences use app storage.'
      : 'Secure storage is unavailable in this environment. Keys cannot be saved here.';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? Colors.black : Colors.zinc50 }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Typography variant="caption" color={Colors.zinc500}>PREFERENCES</Typography>
          <Typography variant="display">Settings</Typography>
        </View>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>OPENROUTER — AI REASONING</Typography>
        <Card variant="elevated" style={styles.cardSection}>
          <View style={styles.rowHeader}>
            <Key size={16} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="title" style={{ flex: 1 }}>OpenRouter API key</Typography>
          </View>
          <Typography variant="caption" color={Colors.zinc500} style={styles.helperText}>
            Used only for AETHER’s tool-enabled reasoning agent and the OpenRouter model you select. It does not enable voice transcription.
          </Typography>
          <View style={styles.savedKeyRow}>
            <View style={{ flex: 1 }}>
              <Typography variant="tiny" color={Colors.zinc500}>KEY STATUS</Typography>
              <Typography variant="bodyBold">{openRouterKeyLoaded ? openRouterConfigured ? 'Saved securely' : 'No key saved' : 'Loading…'}</Typography>
            </View>
            <Shield size={18} color={secureStoreAvailable ? Colors.zinc300 : Colors.zinc600} />
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              value={openRouterInput}
              onChangeText={setOpenRouterInput}
              placeholder="Enter an OpenRouter key"
              placeholderTextColor={Colors.zinc500}
              secureTextEntry={!showOpenRouterKey}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.apiKeyInput, { color: isDark ? Colors.white : Colors.zinc950, backgroundColor: isDark ? Colors.zinc800 : Colors.zinc100 }]}
            />
            <AnimatedPressable onPress={() => setShowOpenRouterKey((visible) => !visible)} style={styles.eyeButton} accessibilityLabel={showOpenRouterKey ? 'Hide OpenRouter API key' : 'Show OpenRouter API key'}>
              {showOpenRouterKey ? <EyeOff size={16} color={Colors.zinc400} /> : <Eye size={16} color={Colors.zinc400} />}
            </AnimatedPressable>
          </View>
          <Typography variant="caption" color={Colors.zinc500} style={styles.storageDescription}>{storageDescription}</Typography>
          <View style={styles.buttonRow}>
            <Button label="Save Securely" onPress={() => void saveKey('OpenRouter')} variant="primary" size="sm" loading={savingProvider === 'OpenRouter'} disabled={!secureStoreAvailable || !openRouterKeyLoaded || testingProvider !== null} style={styles.flexButton} />
            <Button label="Test Connection" onPress={() => void testConnection('OpenRouter')} variant="secondary" size="sm" loading={testingProvider === 'OpenRouter'} disabled={!openRouterKeyLoaded || savingProvider !== null} style={styles.flexButton} />
          </View>
          <Button label="Delete Key" onPress={() => deleteKey('OpenRouter')} variant="ghost" size="sm" icon={<Trash2 size={15} color={isDark ? Colors.zinc300 : Colors.zinc700} />} disabled={!openRouterKeyLoaded || savingProvider !== null || testingProvider !== null} style={styles.deleteButton} />
          {openRouterMessage ? <Typography variant="caption" color={Colors.zinc400} style={styles.statusMessage}>{openRouterMessage}</Typography> : null}
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>OPENAI — REALTIME VOICE TRANSCRIPTION</Typography>
        <Card variant="elevated" style={styles.cardSection}>
          <View style={styles.rowHeader}>
            <Mic size={16} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="title" style={{ flex: 1 }}>OpenAI API key</Typography>
          </View>
          <Typography variant="caption" color={Colors.zinc500} style={styles.helperText}>
            Used only for realtime microphone transcription with gpt-realtime-whisper. OpenAI never runs AETHER’s conversational agent.
          </Typography>
          <View style={styles.savedKeyRow}>
            <View style={{ flex: 1 }}>
              <Typography variant="tiny" color={Colors.zinc500}>KEY STATUS</Typography>
              <Typography variant="bodyBold">{openAiKeyLoaded ? openAiConfigured ? 'Saved securely' : 'No key saved' : 'Loading…'}</Typography>
            </View>
            <Shield size={18} color={secureStoreAvailable ? Colors.zinc300 : Colors.zinc600} />
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              value={openAiInput}
              onChangeText={setOpenAiInput}
              placeholder="Enter an OpenAI key"
              placeholderTextColor={Colors.zinc500}
              secureTextEntry={!showOpenAiKey}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.apiKeyInput, { color: isDark ? Colors.white : Colors.zinc950, backgroundColor: isDark ? Colors.zinc800 : Colors.zinc100 }]}
            />
            <AnimatedPressable onPress={() => setShowOpenAiKey((visible) => !visible)} style={styles.eyeButton} accessibilityLabel={showOpenAiKey ? 'Hide OpenAI API key' : 'Show OpenAI API key'}>
              {showOpenAiKey ? <EyeOff size={16} color={Colors.zinc400} /> : <Eye size={16} color={Colors.zinc400} />}
            </AnimatedPressable>
          </View>
          <Typography variant="caption" color={Colors.zinc500} style={styles.storageDescription}>{storageDescription}</Typography>
          <View style={styles.buttonRow}>
            <Button label="Save Securely" onPress={() => void saveKey('OpenAI')} variant="primary" size="sm" loading={savingProvider === 'OpenAI'} disabled={!secureStoreAvailable || !openAiKeyLoaded || testingProvider !== null} style={styles.flexButton} />
            <Button label="Test Connection" onPress={() => void testConnection('OpenAI')} variant="secondary" size="sm" loading={testingProvider === 'OpenAI'} disabled={!openAiKeyLoaded || savingProvider !== null} style={styles.flexButton} />
          </View>
          <Button label="Delete Key" onPress={() => deleteKey('OpenAI')} variant="ghost" size="sm" icon={<Trash2 size={15} color={isDark ? Colors.zinc300 : Colors.zinc700} />} disabled={!openAiKeyLoaded || savingProvider !== null || testingProvider !== null} style={styles.deleteButton} />
          {openAiMessage ? <Typography variant="caption" color={Colors.zinc400} style={styles.statusMessage}>{openAiMessage}</Typography> : null}
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>OPENROUTER MODEL SELECTOR</Typography>
        <Card variant="elevated" style={styles.cardSection}>
          <View style={styles.rowHeader}>
            <Cpu size={16} color={isDark ? Colors.white : Colors.black} />
            <View style={{ flex: 1 }}>
              <Typography variant="title">Tool-enabled model</Typography>
              <Typography variant="caption" color={Colors.zinc500}>Default: {DEFAULT_OPENROUTER_MODEL_ID}. Live metadata decides compatibility.</Typography>
            </View>
            <AnimatedPressable onPress={loadModels} accessibilityLabel="Refresh OpenRouter model catalog" style={styles.refreshButton}>
              <RefreshCw size={16} color={Colors.zinc400} />
            </AnimatedPressable>
          </View>
          <View style={[styles.searchContainer, { backgroundColor: isDark ? Colors.zinc800 : Colors.zinc100 }]}>
            <Search size={15} color={Colors.zinc500} />
            <TextInput value={modelSearch} onChangeText={setModelSearch} placeholder="Search models or providers" placeholderTextColor={Colors.zinc500} style={[styles.searchInput, { color: isDark ? Colors.white : Colors.zinc950 }]} />
          </View>
          {modelsLoading ? <ActivityIndicator style={styles.modelsLoading} color={isDark ? Colors.white : Colors.black} /> : modelsError ? <Typography variant="caption" color={Colors.zinc500} style={styles.modelsMessage}>{modelsError}</Typography> : filteredModels.length === 0 ? <Typography variant="caption" color={Colors.zinc500} style={styles.modelsMessage}>No catalog models match this search.</Typography> : (
            <ScrollView style={styles.modelList} nestedScrollEnabled>
              {filteredModels.map((model) => {
                const isSelected = selectedModel === model.id;
                const isSelectable = model.availability === 'available' && canRunAsAgent(model.capabilities);
                const status = model.availability !== 'available' ? 'Unavailable' : isSelectable ? 'Agent-ready' : 'Tool support unavailable';
                return (
                  <AnimatedPressable key={model.id} onPress={() => { if (isSelectable) { setModel(model.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } }} disabled={!isSelectable} scaleTo={0.98} style={[styles.modelItem, { backgroundColor: isSelected ? (isDark ? Colors.zinc800 : Colors.zinc100) : 'transparent', borderColor: isSelected ? (isDark ? Colors.white : Colors.black) : (isDark ? Colors.zinc800 : Colors.zinc200), opacity: isSelectable || isSelected ? 1 : 0.5 }]}>
                    <View style={{ flex: 1 }}>
                      <Typography variant="bodyBold">{model.name}</Typography>
                      <View style={styles.modelMetaRow}>
                        <Typography variant="tiny" color={Colors.zinc400}>{model.provider}</Typography>
                        <Typography variant="tiny" color={Colors.zinc500}>{formatContextLength(model.contextLength)}</Typography>
                        <Typography variant="tiny" color={Colors.zinc500}>{status}</Typography>
                      </View>
                    </View>
                    {isSelected ? <Check size={18} color={isDark ? Colors.white : Colors.black} /> : null}
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          )}
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>APP PREFERENCES</Typography>
        <Card variant="elevated" style={styles.cardSection}>
          <View style={styles.toggleRow}>
            <View style={styles.rowHeader}><Moon size={16} color={isDark ? Colors.white : Colors.black} /><Typography variant="bodyBold">Theme Preference</Typography></View>
            <View style={styles.themeGroup}>
              {(['dark', 'light', 'system'] as UserSettings['theme'][]).map((value) => <AnimatedPressable key={value} onPress={() => setTheme(value)} style={[styles.themeChip, { backgroundColor: theme === value ? (isDark ? Colors.white : Colors.black) : (isDark ? Colors.zinc800 : Colors.zinc200) }]}><Typography variant="tiny" color={theme === value ? (isDark ? Colors.black : Colors.white) : Colors.zinc500} style={{ textTransform: 'capitalize' }}>{value}</Typography></AnimatedPressable>)}
            </View>
          </View>
          <View style={[styles.toggleRow, { marginTop: Spacing.md }]}>
            <View style={styles.rowHeader}><Vibrate size={16} color={isDark ? Colors.white : Colors.black} /><Typography variant="bodyBold">Haptic Feedback</Typography></View>
            <Switch value={hapticsEnabled} onValueChange={(value) => { setHapticsEnabled(value); Haptics.selectionAsync().catch(() => {}); }} trackColor={{ false: Colors.zinc700, true: isDark ? Colors.white : Colors.black }} thumbColor={hapticsEnabled ? (isDark ? Colors.black : Colors.white) : Colors.zinc400} />
          </View>
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>ABOUT & LEGAL</Typography>
        <Card variant="elevated" style={styles.cardSection}>
          <AnimatedPressable onPress={() => setShowAbout((visible) => !visible)} style={styles.linkRow}><Info size={16} color={isDark ? Colors.white : Colors.black} /><Typography variant="bodyBold" style={{ flex: 1 }}>About AETHER</Typography></AnimatedPressable>
          {showAbout ? <Typography variant="body" color={Colors.zinc400} style={styles.expandText}>AETHER is a local-first task assistant. OpenRouter handles reasoning and task tools; OpenAI handles only realtime voice transcription.</Typography> : null}
          <View style={[styles.divider, { backgroundColor: isDark ? Colors.zinc800 : Colors.zinc200 }]} />
          <AnimatedPressable onPress={() => setShowPrivacy((visible) => !visible)} style={styles.linkRow}><Shield size={16} color={isDark ? Colors.white : Colors.black} /><Typography variant="bodyBold" style={{ flex: 1 }}>Privacy Information</Typography></AnimatedPressable>
          {showPrivacy ? <Typography variant="body" color={Colors.zinc400} style={styles.expandText}>API keys are stored only in Expo SecureStore and are never placed in AsyncStorage, analytics, crash reports, source, or app configuration. Task text goes to OpenRouter only when you ask AETHER; voice audio goes to OpenAI only during an active transcription session.</Typography> : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 110 },
  header: { marginBottom: Spacing.lg },
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: Spacing.xs, marginTop: Spacing.md },
  cardSection: { marginBottom: Spacing.md },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  helperText: { marginTop: Spacing.sm, marginBottom: Spacing.md },
  savedKeyRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, backgroundColor: 'rgba(127, 127, 127, 0.12)', marginBottom: Spacing.sm },
  inputContainer: { position: 'relative', justifyContent: 'center' },
  apiKeyInput: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, paddingRight: 44, fontSize: 14 },
  eyeButton: { position: 'absolute', right: 12, padding: 4 },
  storageDescription: { marginTop: Spacing.sm },
  buttonRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  flexButton: { flex: 1 },
  deleteButton: { alignSelf: 'flex-start', marginTop: Spacing.xs },
  statusMessage: { marginTop: Spacing.sm },
  refreshButton: { padding: Spacing.xs },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.md, paddingHorizontal: Spacing.sm, marginTop: Spacing.md },
  searchInput: { flex: 1, paddingHorizontal: Spacing.sm, paddingVertical: 9, fontSize: 13 },
  modelsLoading: { marginVertical: Spacing.lg },
  modelsMessage: { marginVertical: Spacing.md },
  modelList: { maxHeight: 380, marginTop: Spacing.sm },
  modelItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.xs },
  modelMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 3 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  themeGroup: { flexDirection: 'row', gap: 4 },
  themeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: Spacing.xs },
  expandText: { marginTop: Spacing.xs, fontSize: 13, lineHeight: 19 },
  divider: { height: 1, marginVertical: Spacing.sm },
});
