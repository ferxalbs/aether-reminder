import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView, SafeAreaView, StatusBar, ActivityIndicator } from 'react-native';
import { Sparkles, AlertTriangle, ArrowRight, RefreshCw, Cpu } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { FloatingToolbar } from '@/components/ui/FloatingToolbar';
import { useTasksStore } from '@/stores/tasks.store';
import { useSettingsStore } from '@/stores/settings.store';
import { generateTaskSummary } from '@/services/ai/openrouter';
import { AIResponse } from '@/types';
import * as Haptics from 'expo-haptics';

export default function AIScreen() {
  const [loading, setLoading] = useState(false);
  const [aiData, setAiData] = useState<AIResponse | null>(null);

  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);

  const openRouterApiKey = useSettingsStore((s) => s.openRouterApiKey);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const tasks = useTasksStore((s) => s.tasks);

  const fetchAnalysis = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const result = await generateTaskSummary(tasks, selectedModel, openRouterApiKey);
      setAiData(result);
    } catch {
      // Handled via internal fallback in openrouter.ts
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const runAnalysis = async () => {
      setLoading(true);
      try {
        const result = await generateTaskSummary(tasks, selectedModel, openRouterApiKey);
        if (isMounted) setAiData(result);
      } catch {
        // Handled via fallback
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    runAnalysis();
    return () => {
      isMounted = false;
    };
  }, [tasks, selectedModel, openRouterApiKey]);

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
          <View>
            <Typography variant="caption" color={Colors.zinc500}>
              TASKFLOW CO-PILOT
            </Typography>
            <Typography variant="display">AI Overview</Typography>
          </View>
          <IconButton
            icon={
              loading ? (
                <ActivityIndicator size="small" color={isDark ? Colors.white : Colors.black} />
              ) : (
                <RefreshCw size={18} color={isDark ? Colors.white : Colors.black} />
              )
            }
            onPress={fetchAnalysis}
            disabled={loading}
            variant="glass"
            size={44}
          />
        </View>

        {/* Model info banner */}
        <View
          style={[
            styles.modelBanner,
            {
              backgroundColor: isDark ? Colors.zinc900 : Colors.zinc100,
              borderColor: isDark ? Colors.zinc800 : Colors.zinc200,
            },
          ]}
        >
          <Cpu size={14} color={Colors.zinc400} />
          <Typography variant="caption" color={Colors.zinc400}>
            Active Model:{' '}
            <Typography variant="caption" color={isDark ? Colors.white : Colors.black}>
              {selectedModel}
            </Typography>
          </Typography>
        </View>

        {/* Workload Executive Summary */}
        <Card variant="elevated" style={styles.summaryCard}>
          <View style={styles.cardHeaderRow}>
            <Sparkles size={18} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="title">Daily Executive Brief</Typography>
          </View>
          {loading ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color={isDark ? Colors.white : Colors.black} />
          ) : (
            <Typography variant="body" color={isDark ? Colors.zinc200 : Colors.zinc800} style={styles.summaryBody}>
              {aiData?.summary || 'Analyzing your tasks with AI...'}
            </Typography>
          )}
        </Card>

        {/* Overdue Alerts if any */}
        {aiData?.overdueAlerts && aiData.overdueAlerts.length > 0 ? (
          <Card variant="elevated" style={styles.alertCard}>
            <View style={styles.cardHeaderRow}>
              <AlertTriangle size={18} color={Colors.zinc300} />
              <Typography variant="title">Overdue Alerts</Typography>
            </View>
            {aiData.overdueAlerts.map((alert, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <View style={[styles.bulletDot, { backgroundColor: Colors.zinc400 }]} />
                <Typography variant="body" style={styles.bulletText}>
                  {alert}
                </Typography>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Suggested Priorities */}
        <Card variant="elevated" style={styles.sectionCard}>
          <Typography variant="title" style={styles.cardTitle}>
            Suggested Priorities
          </Typography>
          {aiData?.priorities && aiData.priorities.length > 0 ? (
            aiData.priorities.map((item, idx) => (
              <View key={idx} style={styles.priorityRow}>
                <View style={styles.priorityIndex}>
                  <Typography variant="tiny" color={isDark ? Colors.black : Colors.white}>
                    0{idx + 1}
                  </Typography>
                </View>
                <Typography variant="bodyBold" style={{ flex: 1 }}>
                  {item}
                </Typography>
              </View>
            ))
          ) : (
            <Typography variant="body" color={Colors.zinc500}>
              No specific priority recommendations right now.
            </Typography>
          )}
        </Card>

        {/* Productivity Insights */}
        <Card variant="elevated" style={styles.sectionCard}>
          <Typography variant="title" style={styles.cardTitle}>
            Productivity Insights
          </Typography>
          {aiData?.insights && aiData.insights.length > 0 ? (
            aiData.insights.map((insight, idx) => (
              <View key={idx} style={styles.insightRow}>
                <ArrowRight size={14} color={Colors.zinc500} style={{ marginTop: 3 }} />
                <Typography variant="body" color={isDark ? Colors.zinc300 : Colors.zinc700} style={{ flex: 1 }}>
                  {insight}
                </Typography>
              </View>
            ))
          ) : (
            <Typography variant="body" color={Colors.zinc500}>
              Gathering activity telemetry for insights...
            </Typography>
          )}
        </Card>

        <Button
          label="Re-Analyze Workload"
          onPress={fetchAnalysis}
          variant="secondary"
          loading={loading}
          fullWidth
          style={{ marginTop: Spacing.md }}
        />
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  modelBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
    gap: 6,
    borderWidth: 1,
  },
  summaryCard: {
    marginBottom: Spacing.md,
  },
  alertCard: {
    marginBottom: Spacing.md,
    borderColor: Colors.zinc700,
  },
  sectionCard: {
    marginBottom: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  summaryBody: {
    lineHeight: 23,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.sm,
  },
  bulletText: {
    flex: 1,
  },
  cardTitle: {
    marginBottom: Spacing.md,
  },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: 12,
  },
  priorityIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.zinc500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: Spacing.sm,
  },
});
