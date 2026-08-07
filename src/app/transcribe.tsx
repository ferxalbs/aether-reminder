import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, SafeAreaView, StatusBar, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { Mic, MicOff, Plus, Sparkles, Check } from 'lucide-react-native';
import { Colors, Spacing } from '@/theme/tokens';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { WaveformView } from '@/components/ui/WaveformView';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { FloatingToolbar } from '@/components/ui/FloatingToolbar';
import { useSettingsStore } from '@/stores/settings.store';
import { useTasksStore } from '@/stores/tasks.store';
import { defaultTranscriptionProvider } from '@/services/transcription';
import { TranscriptionResult } from '@/types';
import * as Haptics from 'expo-haptics';

export default function TranscribeScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);
  const openRouterApiKey = useSettingsStore((s) => s.openRouterApiKey);
  const addTasksBatch = useTasksStore((s) => s.addTasksBatch);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  async function startRecording() {
    try {
      setRecordingDuration(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        // Fallback demo recording if permission missing or in simulator
        setIsRecording(true);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
    } catch {
      // Fallback state if native audio recorder unavailable
      setIsRecording(true);
    }
  }

  async function stopRecording() {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setIsRecording(false);
      setIsProcessing(true);

      let uri: string = 'mock://voice-recording';
      if (recording) {
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        uri = recording.getURI() || uri;
        setRecording(null);
      }

      const result = await defaultTranscriptionProvider.transcribeAudio(
        uri,
        openRouterApiKey
      );
      setTranscription(result);
    } catch {
      Alert.alert('Transcription Failed', 'Could not process audio. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  const handleCreateTasks = () => {
    if (!transcription || transcription.taskCandidates.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    addTasksBatch(
      transcription.taskCandidates.map((cand) => ({
        title: cand.title,
        priority: cand.priority,
        notes: cand.notes,
        dueDate: new Date().toISOString().split('T')[0],
      }))
    );

    Alert.alert(
      'Tasks Added',
      `Successfully added ${transcription.taskCandidates.length} tasks from your voice note!`
    );
    setTranscription(null);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
            VOICE CAPTURE
          </Typography>
          <Typography variant="display">Transcribe</Typography>
        </View>

        {/* Central Mic Record Card */}
        <Card variant="elevated" style={styles.micCard}>
          <Typography variant="caption" color={Colors.zinc500} align="center">
            {isRecording
              ? `RECORDING... (${formatTimer(recordingDuration)})`
              : 'TAP MIC TO START SPEAKING'}
          </Typography>

          {/* Animated Waveform */}
          <WaveformView isRecording={isRecording} barCount={18} />

          {/* Record Button */}
          <View style={styles.micButtonWrapper}>
            <AnimatedPressable
              onPress={isRecording ? stopRecording : startRecording}
              scaleTo={0.9}
              hapticStyle={Haptics.ImpactFeedbackStyle.Heavy}
              style={[
                styles.micCircle,
                {
                  backgroundColor: isRecording
                    ? isDark
                      ? Colors.white
                      : Colors.black
                    : isDark
                    ? Colors.zinc900
                    : Colors.zinc100,
                  borderColor: isRecording
                    ? isDark
                      ? Colors.white
                      : Colors.black
                    : isDark
                    ? Colors.zinc700
                    : Colors.zinc300,
                },
              ]}
            >
              {isRecording ? (
                <MicOff size={32} color={isDark ? Colors.black : Colors.white} />
              ) : (
                <Mic size={32} color={isDark ? Colors.white : Colors.black} />
              )}
            </AnimatedPressable>
          </View>
        </Card>

        {/* Transcript Preview Section */}
        {isProcessing ? (
          <Card variant="elevated" style={styles.resultCard}>
            <Typography variant="body" align="center" color={Colors.zinc500}>
              Processing speech audio with AI...
            </Typography>
          </Card>
        ) : transcription ? (
          <Card variant="elevated" style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Sparkles size={16} color={isDark ? Colors.white : Colors.black} />
              <Typography variant="title">Speech Transcript</Typography>
            </View>

            <Typography variant="body" style={styles.transcriptQuote}>
              &quot;{transcription.text}&quot;
            </Typography>

            <Typography
              variant="caption"
              color={Colors.zinc500}
              style={styles.candidatesLabel}
            >
              EXTRACTED TASKS ({transcription.taskCandidates.length})
            </Typography>

            {transcription.taskCandidates.map((cand, idx) => (
              <View key={idx} style={styles.candidateRow}>
                <Check size={14} color={isDark ? Colors.white : Colors.black} />
                <Typography variant="bodyBold" style={{ flex: 1 }}>
                  {cand.title}
                </Typography>
                <Typography
                  variant="tiny"
                  color={Colors.zinc400}
                  style={{ textTransform: 'uppercase' }}
                >
                  {cand.priority}
                </Typography>
              </View>
            ))}

            <View style={styles.actionRow}>
              <Button
                label="Add All as Tasks"
                onPress={handleCreateTasks}
                variant="primary"
                icon={<Plus size={16} color={isDark ? Colors.black : Colors.white} />}
                fullWidth
              />
            </View>
          </Card>
        ) : (
          <Card variant="outline" style={styles.hintCard}>
            <Typography variant="body" color={Colors.zinc500} align="center">
              Speak naturally like &quot;Remind me to submit product roadmap tomorrow&quot;. TaskFlow AI will automatically extract actionable tasks.
            </Typography>
          </Card>
        )}
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
  micCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  micButtonWrapper: {
    marginTop: Spacing.md,
  },
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  resultCard: {
    marginBottom: Spacing.lg,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  transcriptQuote: {
    fontStyle: 'italic',
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  candidatesLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    gap: 8,
  },
  actionRow: {
    marginTop: Spacing.md,
  },
  hintCard: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
});
