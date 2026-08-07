import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Check, Cpu, Eye, EyeOff, Info, Key, Moon, RefreshCw, Search, Shield, Trash2, Vibrate } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { FloatingToolbar } from '@/components/ui/FloatingToolbar';
import { useSettingsStore } from '@/stores/settings.store';
import { AIModel, maskApiKey } from '@/services/ai/models';
import { fetchAvailableModels, testOpenRouterConnection } from '@/services/ai/openrouter';
import { getAIErrorMessage } from '@/services/ai/providers';
import { UserSettings } from '@/types';
import * as Haptics from 'expo-haptics';

function formatContextLength(contextLength?: number): string {
  return contextLength ? `${contextLength.toLocaleString()} token context` : 'Context size unavailable';
}

export default function SettingsScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const openRouterApiKey = useSettingsStore((s) => s.openRouterApiKey);
  const apiKeyLoaded = useSettingsStore((s) => s.apiKeyLoaded);
  const secureStoreAvailable = useSettingsStore((s) => s.secureStoreAvailable);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const loadApiKey = useSettingsStore((s) => s.loadApiKey);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const deleteApiKey = useSettingsStore((s) => s.deleteApiKey);
  const setModel = useSettingsStore((s) => s.setModel);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [models, setModels] = useState<AIModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const isDark = theme === 'dark' || (theme === 'system' && true);
  const maskedKey = apiKeyLoaded ? maskApiKey(openRouterApiKey) : '';

  useEffect(() => {
    void loadApiKey();
  }, [loadApiKey]);

  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        const availableModels = await fetchAvailableModels(openRouterApiKey || undefined);
        if (cancelled) return;
        setModels(availableModels);
        if (!selectedModel && availableModels[0]) setModel(availableModels[0].id);
      } catch (error) {
        if (!cancelled) setModelsError(getAIErrorMessage(error));
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    };
    void loadModels();
    return () => { cancelled = true; };
  }, [openRouterApiKey, selectedModel, setModel]);

  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return query
      ? models.filter((model) => `${model.name} ${model.provider} ${model.id}`.toLowerCase().includes(query))
      : models;
  }, [modelSearch, models]);

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      Alert.alert('API Key Required', 'Enter an OpenRouter API key before saving.');
      return;
    }
    setSavingKey(true);
    setConnectionMessage(null);
    try {
      await setApiKey(apiKeyInput);
      setApiKeyInput('');
      setShowApiKey(false);
      setConnectionMessage('API key saved securely on this device.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error) {
      Alert.alert('Key Not Saved', getAIErrorMessage(error));
    } finally {
      setSavingKey(false);
    }
  };

  const handleTestConnection = async () => {
    const keyToTest = apiKeyInput.trim() || openRouterApiKey;
    if (!keyToTest) {
      Alert.alert('API Key Required', 'Save an OpenRouter API key or enter one to test.');
      return;
    }
    setTestingConnection(true);
    setConnectionMessage(null);
    try {
      const result = await testOpenRouterConnection(keyToTest);
      setConnectionMessage(`${result.provider} connection is working.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error) {
      setConnectionMessage(getAIErrorMessage(error));
    } finally {
      setTestingConnection(false);
    }
  };

  const handleDeleteApiKey = () => {
    if (!openRouterApiKey) {
      setApiKeyInput('');
      return;
    }
    Alert.alert(
      'Delete OpenRouter API key?',
      'This removes the saved key from SecureStore and disables remote AI requests until a new key is saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Key',
          style: 'destructive',
          onPress: () => {
            void deleteApiKey()
              .then(() => { setApiKeyInput(''); setConnectionMessage('OpenRouter API key deleted.'); })
              .catch((error: unknown) => Alert.alert('Key Not Deleted', getAIErrorMessage(error)));
          },
        },
      ]
    );
  };

  const storageDescription = !apiKeyLoaded
    ? 'Checking secure storage…'
    : secureStoreAvailable
    ? 'Stored locally in Expo SecureStore. It is never persisted in app preferences.'
    : 'Secure storage is unavailable in this environment. The key cannot be saved here.';

  const refreshModels = () => {
    setModelsLoading(true);
    setModelsError(null);
    void fetchAvailableModels(openRouterApiKey || undefined)
      .then(setModels)
      .catch((error: unknown) => setModelsError(getAIErrorMessage(error)))
      .finally(() => setModelsLoading(false));
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? Colors.black : Colors.zinc50 }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Typography variant="caption" color={Colors.zinc500}>PREFERENCES & AI</Typography>
          <Typography variant="display">Settings</Typography>
        </View>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>OPENROUTER API CONFIGURATION</Typography>
        <Card variant="elevated" style={styles.cardSection}>
          <View style={styles.rowHeader}>
            <Key size={16} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="title" style={{ flex: 1 }}>Bring Your Own Key</Typography>
          </View>
          <Typography variant="caption" color={Colors.zinc500} style={styles.helperText}>
            Your key is sent directly to OpenRouter. This app has no bundled or backend-owned API key.
          </Typography>

          <View style={styles.savedKeyRow}>
            <View style={{ flex: 1 }}>
              <Typography variant="tiny" color={Colors.zinc500}>SAVED KEY</Typography>
              <Typography variant="bodyBold">{maskedKey || (apiKeyLoaded ? 'No key saved' : 'Loading…')}</Typography>
            </View>
            <Shield size={18} color={secureStoreAvailable ? Colors.zinc300 : Colors.zinc600} />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="Enter a new sk-or-v1-… key"
              placeholderTextColor={Colors.zinc500}
              secureTextEntry={!showApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.apiKeyInput, { color: isDark ? Colors.white : Colors.zinc950, backgroundColor: isDark ? Colors.zinc800 : Colors.zinc100 }]}
            />
            <AnimatedPressable onPress={() => setShowApiKey((visible) => !visible)} style={styles.eyeButton} accessibilityLabel={showApiKey ? 'Hide API key' : 'Show API key'}>
              {showApiKey ? <EyeOff size={16} color={Colors.zinc400} /> : <Eye size={16} color={Colors.zinc400} />}
            </AnimatedPressable>
          </View>
          <Typography variant="caption" color={Colors.zinc500} style={styles.storageDescription}>{storageDescription}</Typography>

          <View style={styles.buttonRow}>
            <Button label="Save Securely" onPress={() => void handleSaveApiKey()} variant="primary" size="sm" loading={savingKey} disabled={!secureStoreAvailable || !apiKeyLoaded || testingConnection} style={styles.flexButton} />
            <Button label="Test Connection" onPress={() => void handleTestConnection()} variant="secondary" size="sm" loading={testingConnection} disabled={!apiKeyLoaded || savingKey} style={styles.flexButton} />
          </View>
          <Button label="Delete / Reset Key" onPress={handleDeleteApiKey} variant="ghost" size="sm" icon={<Trash2 size={15} color={isDark ? Colors.zinc300 : Colors.zinc700} />} disabled={!apiKeyLoaded || savingKey || testingConnection} style={styles.deleteButton} />
          {connectionMessage ? <Typography variant="caption" color={Colors.zinc400} style={styles.statusMessage}>{connectionMessage}</Typography> : null}
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionHeader}>SELECT AI MODEL</Typography>
        <Card variant="elevated" style={styles.cardSection}>
          <View style={styles.rowHeader}>
            <Cpu size={16} color={isDark ? Colors.white : Colors.black} />
            <View style={{ flex: 1 }}>
              <Typography variant="title">OpenRouter model catalog</Typography>
              <Typography variant="caption" color={Colors.zinc500}>Live OpenAI-compatible models from OpenRouter</Typography>
            </View>
            <AnimatedPressable onPress={refreshModels} accessibilityLabel="Refresh model catalog" style={styles.refreshButton}>
              <RefreshCw size={16} color={Colors.zinc400} />
            </AnimatedPressable>
          </View>
          <View style={[styles.searchContainer, { backgroundColor: isDark ? Colors.zinc800 : Colors.zinc100 }]}>
            <Search size={15} color={Colors.zinc500} />
            <TextInput value={modelSearch} onChangeText={setModelSearch} placeholder="Search models or providers" placeholderTextColor={Colors.zinc500} style={[styles.searchInput, { color: isDark ? Colors.white : Colors.zinc950 }]} />
          </View>
          {modelsLoading ? <ActivityIndicator style={styles.modelsLoading} color={isDark ? Colors.white : Colors.black} /> : modelsError ? <Typography variant="caption" color={Colors.zinc500} style={styles.modelsMessage}>{modelsError}</Typography> : filteredModels.length === 0 ? <Typography variant="caption" color={Colors.zinc500} style={styles.modelsMessage}>No supported models match this search.</Typography> : (
            <ScrollView style={styles.modelList} nestedScrollEnabled>
              {filteredModels.map((model) => {
                const isSelected = selectedModel === model.id;
                const isAvailable = model.availability === 'available';
                return (
                  <AnimatedPressable key={model.id} onPress={() => { if (isAvailable) { setModel(model.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } }} disabled={!isAvailable} scaleTo={0.98} style={[styles.modelItem, { backgroundColor: isSelected ? (isDark ? Colors.zinc800 : Colors.zinc100) : 'transparent', borderColor: isSelected ? (isDark ? Colors.white : Colors.black) : (isDark ? Colors.zinc800 : Colors.zinc200), opacity: isAvailable ? 1 : 0.5 }]}>
                    <View style={{ flex: 1 }}>
                      <Typography variant="bodyBold">{model.name}</Typography>
                      <View style={styles.modelMetaRow}>
                        <Typography variant="tiny" color={Colors.zinc400}>{model.provider}</Typography>
                        <Typography variant="tiny" color={Colors.zinc500}>{formatContextLength(model.contextLength)}</Typography>
                        <Typography variant="tiny" color={Colors.zinc500}>{isAvailable ? 'Available' : 'Unavailable'}</Typography>
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
          <AnimatedPressable onPress={() => setShowAbout((visible) => !visible)} style={styles.linkRow}><Info size={16} color={isDark ? Colors.white : Colors.black} /><Typography variant="bodyBold" style={{ flex: 1 }}>About TaskFlow AI</Typography></AnimatedPressable>
          {showAbout ? <Typography variant="body" color={Colors.zinc400} style={styles.expandText}>TaskFlow AI is a local-first productivity co-pilot. AI inference uses the OpenRouter key you provide and the model you select.</Typography> : null}
          <View style={[styles.divider, { backgroundColor: isDark ? Colors.zinc800 : Colors.zinc200 }]} />
          <AnimatedPressable onPress={() => setShowPrivacy((visible) => !visible)} style={styles.linkRow}><Shield size={16} color={isDark ? Colors.white : Colors.black} /><Typography variant="bodyBold" style={{ flex: 1 }}>Privacy Information</Typography></AnimatedPressable>
          {showPrivacy ? <Typography variant="body" color={Colors.zinc400} style={styles.expandText}>The API key is stored only in Expo SecureStore. It is not placed in AsyncStorage, analytics, crash reports, or an app environment variable. Task text is sent to OpenRouter only when you request AI analysis.</Typography> : null}
        </Card>
      </ScrollView>
      <FloatingToolbar />
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
