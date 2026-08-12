import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type {
  RecoveryAlternative,
  RecoveryApplyResult,
  RecoveryApplySelection,
  RecoveryPlan,
  RecoveryProposal,
  RecoverySchedule,
} from '@/domain/recovery';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Button } from './Button';
import { Card } from './Card';
import { Sheet } from './Sheet';
import { Typography } from './Typography';

interface RecoverySummaryProps {
  count: number;
  onPress: () => void;
}

export function RecoverySummary({ count, onPress }: RecoverySummaryProps) {
  const isDark = useIsDark();
  return (
    <Card
      variant="outline"
      padding={Spacing.md}
      onPress={onPress}
      accessibilityLabel="Recover slipped tasks"
      accessibilityHint="Opens the Smart Recovery review"
      style={styles.summary}
    >
      <View style={styles.summaryRow}>
        <View style={styles.summaryCopy}>
          <Typography variant="bodyBold">
            {count} {count === 1 ? 'thing slipped' : 'things slipped'}
          </Typography>
          <Typography
            variant="caption"
            color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
          >
            Review a safe recovery plan
          </Typography>
        </View>
        <Typography variant="caption" color={isDark ? Colors.white : Colors.black}>
          Recover your plan
        </Typography>
      </View>
    </Card>
  );
}

type RecoveryChoice = RecoverySchedule | 'keep_current' | 'exclude';

interface RecoverySheetProps {
  visible: boolean;
  plan: RecoveryPlan;
  onClose: () => void;
  onApply: (selections: readonly RecoveryApplySelection[]) => Promise<RecoveryApplyResult>;
}

function formatSchedule(schedule: RecoverySchedule | null): string {
  if (!schedule || !schedule.dueDate) return 'No schedule';
  return schedule.dueTime ? `${schedule.dueDate} at ${schedule.dueTime}` : schedule.dueDate;
}

function formatReason(proposal: RecoveryProposal): string {
  return proposal.reason === 'overdue'
    ? 'This task is overdue.'
    : 'This timed task was missed today.';
}

function choiceMatches(choice: RecoveryChoice, alternative: RecoveryAlternative): boolean {
  if (alternative.kind === 'keep_current' || alternative.kind === 'exclude') {
    return choice === alternative.kind;
  }
  return typeof choice === 'object'
    && alternative.schedule !== null
    && choice.dueDate === alternative.schedule.dueDate
    && choice.dueTime === alternative.schedule.dueTime
    && choice.dueTimezone === alternative.schedule.dueTimezone
    && choice.dueSemantics === alternative.schedule.dueSemantics;
}

export function RecoverySheet({ visible, plan, onClose, onApply }: RecoverySheetProps) {
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const [choices, setChoices] = useState<Record<string, RecoveryChoice>>(
    () => Object.fromEntries(plan.proposals.map((proposal) => [proposal.taskId, proposal.proposed])),
  );
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const large = width >= 700;

  const activeCount = useMemo(
    () => Object.values(choices).filter((choice) => typeof choice === 'object').length,
    [choices],
  );

  const choose = (proposal: RecoveryProposal, alternative: RecoveryAlternative) => {
    const choice: RecoveryChoice = alternative.schedule
      ?? (alternative.kind === 'keep_current' ? 'keep_current' : 'exclude');
    setChoices((current) => ({
      ...current,
      [proposal.taskId]: choice,
    }));
  };

  const apply = async () => {
    if (applying || activeCount === 0) return;
    setApplying(true);
    setMessage(null);
    try {
      const selections = plan.proposals.map((proposal) => {
        const choice = choices[proposal.taskId] ?? proposal.proposed;
        return {
          proposal,
          schedule: typeof choice === 'object' ? choice : null,
        };
      });
      const result = await onApply(selections);
      if (result.applied.length > 0) {
        onClose();
      } else if (result.alreadyApplied.length > 0) {
        setMessage('These changes are already applied. The plan was refreshed.');
      } else if (result.skippedStale.length > 0) {
        setMessage('Some tasks changed before Apply Recovery. Review the refreshed plan.');
      } else if (result.failed.length > 0) {
        setMessage('Recovery could not be applied. Your tasks were not changed.');
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onRequestClose={onClose}
      title="Recover your plan"
      subtitle="Review every change before it is applied."
      accessibilityLabel="Smart Recovery review"
      surfaceStyle={large ? styles.largeSurface : undefined}
      contentStyle={styles.sheetContent}
      footer={(
        <Button
          label="Apply Recovery"
          onPress={() => void apply()}
          loading={applying}
          disabled={activeCount === 0}
          fullWidth
        />
      )}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {message ? (
          <Typography
            variant="caption"
            color={isDark ? Colors.warningDark : Colors.warningLight}
            style={styles.message}
            accessibilityRole="alert"
          >
            {message}
          </Typography>
        ) : null}
        {plan.proposals.map((proposal) => {
          const choice = choices[proposal.taskId] ?? proposal.proposed;
          return (
            <Card key={proposal.id} variant="outline" padding={Spacing.md} style={styles.proposal}>
              <View style={styles.proposalHeader}>
                <Typography variant="bodyBold" style={styles.proposalTitle}>
                  {proposal.taskTitle}
                </Typography>
                <Typography variant="tiny" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  {proposal.priority}
                </Typography>
              </View>
              <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                {formatReason(proposal)}
              </Typography>
              <View style={styles.scheduleRows}>
                <Typography variant="caption">Previous · {formatSchedule(proposal.previous)}</Typography>
                <Typography variant="caption">Proposed · {formatSchedule(proposal.proposed)}</Typography>
              </View>
              {proposal.recurrence ? (
                <Typography variant="tiny" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
                  Current recurring occurrence only · future cadence stays anchored
                </Typography>
              ) : null}
              <View style={styles.alternatives}>
                {proposal.alternatives.map((alternative) => (
                  <Button
                    key={alternative.kind}
                    label={alternative.schedule ? `${alternative.label} · ${formatSchedule(alternative.schedule)}` : alternative.label}
                    variant={choiceMatches(choice, alternative) ? 'primary' : 'secondary'}
                    size="sm"
                    onPress={() => choose(proposal, alternative)}
                  />
                ))}
              </View>
            </Card>
          );
        })}
        <Typography
          variant="tiny"
          color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
          style={styles.disclaimer}
        >
          Recovery is local and deterministic. It does not use an AI service or infer a personal schedule.
        </Typography>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: {
    width: '100%',
    maxWidth: LayoutTokens.readingMaxWidth,
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  summaryCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  largeSurface: {
    alignSelf: 'center',
    width: '92%',
    maxWidth: 760,
    marginVertical: Spacing.xl,
    borderRadius: Radius.xl,
  },
  sheetContent: {
    paddingHorizontal: Spacing.lg,
  },
  scrollContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  message: {
    paddingVertical: Spacing.xs,
  },
  proposal: {
    gap: Spacing.sm,
  },
  proposalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  proposalTitle: {
    flex: 1,
  },
  scheduleRows: {
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  alternatives: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  disclaimer: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.lg,
  },
});
