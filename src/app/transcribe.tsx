import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, ScrollView, SafeAreaView, StatusBar, Alert } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Mic, MicOff, Plus, Sparkles, Check } from 'lucide-react-native';
import { Colors, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { WaveformView } from '@/components/ui/WaveformView';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { FloatingToolbar } from '@/components/ui/FloatingToolbar';
import { useSettingsStore } from '@/stores/settings.store';
import { useTasksStore } from '@/stores/tasks.store';
import {
  defaultTranscriptionProvider,
  getTranscriptionErrorMessage,
  TranscriptionError,
} from '@/services/transcription';
import { TranscriptionResult } from '@/types';
import { getLocalDateString } from '@/temporal/localCalendar';
import * as Haptics from 'expo-haptics';

type CaptureState =
  | 'idle'
  | 'requesting_permission'
  | 'preparing'
  | 'listening'
  | 'finalizing'
  | 'transcribing'
  | 'ready'
  | 'failed'
  | 'cancelled';

export default function TranscribeScreen() {
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activelyRecordingRef = useRef(false);

  const isDark = useIsDark();
  const openRouterApiKey = useSettingsStore((s) => s.openRouterApiKey);
  const addTasksBatch = useTasksStore((s) => s.addTasksBatch);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const isListening = captureState === 'listening';
  const isProcessing =
    captureState === 'finalizing' || captureState === 'transcribing';

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isListening) {
      timer = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isListening]);

  async function startRecording() {
    setErrorMessage(null);
    setTranscription(null);
    setRecordingDuration(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    setCaptureState('requesting_permission');
    let permission;
    try {
      permission = await AudioModule.requestRecordingPermissionsAsync();
    } catch {
      setCaptureState('failed');
      setErrorMessage(
        getTranscriptionErrorMessage(
          new TranscriptionError('AUDIO_UNAVAILABLE', 'Could not request microphone permission.')
        )
      );
      return;
    }

    if (permission.status !== 'granted') {
      setCaptureState('failed');
      setErrorMessage(
        getTranscriptionErrorMessage(
          new TranscriptionError('PERMISSION_DENIED', 'Microphone permission denied.')
        )
      );
      return;
    }

    setCaptureState('preparing');
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      activelyRecordingRef.current = true;
      setCaptureState('listening');
    } catch {
      activelyRecordingRef.current = false;
      setCaptureState('failed');
      setErrorMessage(
        getTranscriptionErrorMessage(
          new TranscriptionError(
            'AUDIO_UNAVAILABLE',
            'Audio recording is unavailable. Use a development build with native audio support.'
          )
        )
      );
      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch {
        // best-effort cleanup
      }
    }
  }

  async function stopRecording() {
    if (captureState !== 'listening') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCaptureState('finalizing');
    setErrorMessage(null);

    let uri: string | null = null;
    try {
      if (activelyRecordingRef.current || audioRecorder.isRecording) {
        await audioRecorder.stop();
        await setAudioModeAsync({ allowsRecording: false });
        uri = audioRecorder.uri ?? null;
      }
    } catch {
      activelyRecordingRef.current = false;
      setCaptureState('failed');
      setErrorMessage(
        getTranscriptionErrorMessage(
          new TranscriptionError('AUDIO_UNAVAILABLE', 'Failed to finalize the recording.')
        )
      );
      return;
    } finally {
      activelyRecordingRef.current = false;
    }

    if (!uri) {
      setCaptureState('failed');
      setErrorMessage(
        getTranscriptionErrorMessage(
          new TranscriptionError(
            'INVALID_AUDIO',
            'No recording was produced. Microphone capture may be unavailable.'
          )
        )
      );
      return;
    }

    setCaptureState('transcribing');
    try {
      const result = await defaultTranscriptionProvider.transcribeAudio(uri, openRouterApiKey);
      setTranscription(result);
      setCaptureState('ready');
    } catch (error) {
      setTranscription(null);
      setCaptureState('failed');
      setErrorMessage(getTranscriptionErrorMessage(error));
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
        dueDate: getLocalDateString(),
      }))
    );

    Alert.alert(
      'Tasks Added',
      `Added ${transcription.taskCandidates.length} task${transcription.taskCandidates.length === 1 ? '' : 's'} from your voice note.`
    );
    setTranscription(null);
    setCaptureState('idle');
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const statusLabel = (() => {
    switch (captureState) {
      case 'requesting_permission':
        return 'REQUESTING MICROPHONE…';
      case 'preparing':
        return 'PREPARING RECORDER…';
      case 'listening':
        return `RECORDING… (${formatTimer(recordingDuration)})`;
      case 'finalizing':
        return 'FINALIZING AUDIO…';
      case 'transcribing':
        return 'TRANSCRIBING…';
      case 'failed':
        return 'CAPTURE FAILED';
      case 'ready':
        return 'TRANSCRIPT READY';
      default:
        return 'TAP MIC TO START SPEAKING';
    }
  })();

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
        <View style={styles.header}>
          <Typography variant="caption" color={Colors.zinc500}>
            VOICE CAPTURE
          </Typography>
          <Typography variant="display">Transcribe</Typography>
        </View>

        <Card variant="elevated" style={styles.micCard}>
          <Typography variant="caption" color={Colors.zinc500} align="center">
            {statusLabel}
          </Typography>

          <WaveformView isRecording={isListening} barCount={18} />

          <View style={styles.micButtonWrapper}>
            <AnimatedPressable
              onPress={isListening ? stopRecording : startRecording}
              disabled={
                captureState === 'requesting_permission' ||
                captureState === 'preparing' ||
                captureState === 'finalizing' ||
                captureState === 'transcribing'
              }
              scaleTo={0.9}
              hapticStyle={Haptics.ImpactFeedbackStyle.Heavy}
              style={[
                styles.micCircle,
                {
                  backgroundColor: isListening
                    ? isDark
                      ? Colors.white
                      : Colors.black
                    : isDark
                    ? Colors.zinc900
                    : Colors.zinc100,
                  borderColor: isListening
                    ? isDark
                      ? Colors.white
                      : Colors.black
                    : isDark
                    ? Colors.zinc700
                    : Colors.zinc300,
                  opacity:
                    captureState === 'requesting_permission' ||
                    captureState === 'preparing' ||
                    captureState === 'finalizing' ||
                    captureState === 'transcribing'
                      ? 0.6
                      : 1,
                },
              ]}
            >
              {isListening ? (
                <MicOff size={32} color={isDark ? Colors.black : Colors.white} />
              ) : (
                <Mic size={32} color={isDark ? Colors.white : Colors.black} />
              )}
            </AnimatedPressable>
          </View>
        </Card>

        {errorMessage ? (
          <Card variant="outline" style={styles.errorCard}>
            <Typography variant="body" color={Colors.zinc400} align="center">
              {errorMessage}
            </Typography>
          </Card>
        ) : null}

        {isProcessing ? (
          <Card variant="elevated" style={styles.resultCard}>
            <Typography variant="body" align="center" color={Colors.zinc500}>
              {captureState === 'finalizing'
                ? 'Finalizing recording…'
                : 'Sending audio to OpenRouter for transcription…'}
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

            {transcription.taskCandidates.length > 0 ? (
              <View style={styles.actionRow}>
                <Button
                  label="Add All as Tasks"
                  onPress={handleCreateTasks}
                  variant="primary"
                  icon={<Plus size={16} color={isDark ? Colors.black : Colors.white} />}
                  fullWidth
                />
              </View>
            ) : (
              <Typography variant="caption" color={Colors.zinc500} style={{ marginTop: Spacing.sm }}>
                No task candidates found in this transcript.
              </Typography>
            )}
          </Card>
        ) : !errorMessage ? (
          <Card variant="outline" style={styles.hintCard}>
            <Typography variant="body" color={Colors.zinc500} align="center">
              Speak naturally like &quot;Remind me to submit product roadmap tomorrow&quot;.
              Voice is transcribed via OpenRouter — failures are shown, never simulated.
            </Typography>
          </Card>
        ) : null}
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
    boxShadow: '0px 6px 10px rgba(0, 0, 0, 0.2)',
    elevation: 4,
  },
  resultCard: {
    marginBottom: Spacing.lg,
  },
  errorCard: {
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
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
