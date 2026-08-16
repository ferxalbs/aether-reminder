import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import type {
  AttentionAlert,
  AttentionItem,
  AttentionPlan,
} from "@/domain/attentionPlanner";
import { Card } from "./Card";
import { Button } from "./Button";
import { Typography } from "./Typography";
import { Colors, LayoutTokens, Radius, Spacing } from "@/theme/tokens";
import { useIsDark } from "@/theme/useResolvedTheme";

export interface AttentionSurfaceProps {
  plan: AttentionPlan | null;
  onComplete: (taskId: string) => void;
  onFocus: (taskId: string) => void;
  onClearFocus: () => void;
  onNotNow: (taskId: string) => void;
  onReviewRecovery: () => void;
  onSwitchFocus: (taskId: string) => void;
  onOpenSettings: () => void;
}

function itemExplanation(item: AttentionItem): string {
  if (item.reasonCodes.includes("manual_focus")) return "Focused by you";
  if (item.reasonCodes.includes("due_now")) return "Due now";
  if (item.reasonCodes.includes("due_imminent")) {
    return item.dueTime ? `Due at ${item.dueTime}` : "Due soon";
  }
  if (item.reasonCodes.includes("adaptive_followup_due"))
    return "Good follow-up time";
  if (item.reasonCodes.includes("high_priority_today"))
    return "High priority today";
  if (item.reasonCodes.includes("due_today")) return "Scheduled today";
  if (item.reasonCodes.includes("recovered_recently"))
    return "Recovered for now";
  if (item.dueDate && item.dueTime)
    return `Scheduled ${item.dueDate} · ${item.dueTime}`;
  if (item.dueDate) return `Scheduled ${item.dueDate}`;
  return "Selected as a possible next step";
}

function ItemMeta({ item }: { item: AttentionItem }) {
  return (
    <Typography
      variant="caption"
      color={useIsDark() ? Colors.secondaryTextDark : Colors.secondaryTextLight}
    >
      {itemExplanation(item)}
    </Typography>
  );
}

function ChoiceRow({
  item,
  onFocus,
}: {
  item: AttentionItem;
  onFocus: (taskId: string) => void;
}) {
  return (
    <Card variant="outline" padding={Spacing.md} style={styles.choiceCard}>
      <View style={styles.choiceText}>
        <Typography variant="bodyBold" numberOfLines={2}>
          {item.title}
        </Typography>
        <ItemMeta item={item} />
      </View>
      <Button
        label="Focus now"
        size="sm"
        variant="secondary"
        onPress={() => onFocus(item.taskId)}
        accessibilityLabel={`Focus on ${item.title} now`}
      />
    </Card>
  );
}

function AlertRow({
  alert,
  onReviewRecovery,
  onSwitchFocus,
  onOpenSettings,
}: {
  alert: AttentionAlert;
  onReviewRecovery: () => void;
  onSwitchFocus: (taskId: string) => void;
  onOpenSettings: () => void;
}) {
  const action =
    alert.action === "review_recovery"
      ? onReviewRecovery
      : alert.action === "open_settings"
        ? onOpenSettings
        : () => {
            if (alert.taskId) onSwitchFocus(alert.taskId);
          };
  const label =
    alert.action === "review_recovery"
      ? "Review recovery"
      : alert.action === "open_settings"
        ? "Open settings"
        : "Switch focus";

  return (
    <Card variant="outline" padding={Spacing.md} style={styles.alertCard}>
      <View style={styles.alertText}>
        <Typography variant="bodyBold">{alert.title}</Typography>
        <Typography
          variant="caption"
          color={
            useIsDark() ? Colors.secondaryTextDark : Colors.secondaryTextLight
          }
        >
          {alert.message}
        </Typography>
      </View>
      <Button label={label} size="sm" variant="ghost" onPress={action} />
    </Card>
  );
}

export const AttentionSurface: React.FC<AttentionSurfaceProps> = ({
  plan,
  onComplete,
  onFocus,
  onClearFocus,
  onNotNow,
  onReviewRecovery,
  onSwitchFocus,
  onOpenSettings,
}) => {
  const { width } = useWindowDimensions();
  const isDark = useIsDark();
  if (!plan) return null;

  const isWide = width >= 720;
  const isFocused = plan.now?.reasonCodes.includes("manual_focus") ?? false;

  return (
    <View style={styles.root} accessibilityLabel="NOW and NEXT attention">
      <View style={isWide ? styles.columns : undefined}>
        <View style={isWide ? styles.nowColumn : undefined}>
          <Typography
            variant="caption"
            color={
              isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight
            }
            style={styles.sectionLabel}
          >
            {plan.selectionMode === "choose" ? "CHOOSE YOUR FOCUS" : "NOW"}
          </Typography>

          {plan.selectionMode === "choose" ? (
            <View style={styles.choiceList}>
              {plan.choices.map((item) => (
                <ChoiceRow key={item.taskId} item={item} onFocus={onFocus} />
              ))}
            </View>
          ) : plan.now ? (
            <Card
              variant="elevated"
              padding={Spacing.xl}
              style={styles.nowCard}
            >
              <Typography variant="headline" accessibilityRole="header">
                {plan.now.title}
              </Typography>
              <ItemMeta item={plan.now} />
              <View style={styles.actionRow}>
                <Button
                  label="Complete"
                  size="sm"
                  pill
                  onPress={() => onComplete(plan.now!.taskId)}
                  accessibilityLabel={`Complete ${plan.now.title}`}
                  style={styles.actionButton}
                />
                {!isFocused ? (
                  <Button
                    label="Focus now"
                    size="sm"
                    variant="secondary"
                    pill
                    onPress={() => onFocus(plan.now!.taskId)}
                    accessibilityLabel={`Keep ${plan.now.title} as focus`}
                    style={styles.actionButton}
                  />
                ) : null}
                <Button
                  label={isFocused ? "Clear focus" : "Not now"}
                  size="sm"
                  variant="ghost"
                  pill
                  onPress={
                    isFocused ? onClearFocus : () => onNotNow(plan.now!.taskId)
                  }
                  accessibilityLabel={
                    isFocused ? "Clear focus" : `Not now for ${plan.now.title}`
                  }
                  style={styles.actionButton}
                />
              </View>
            </Card>
          ) : (
            <Card
              variant="outline"
              padding={Spacing.xl}
              style={styles.clearCard}
            >
              <Typography variant="headline">
                You&apos;re clear for now.
              </Typography>
              <Typography
                variant="body"
                color={
                  isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight
                }
              >
                Nothing else needs your attention yet.
              </Typography>
            </Card>
          )}
        </View>

        {plan.next.length > 0 ? (
          <View style={isWide ? styles.nextColumn : styles.nextSection}>
            <Typography
              variant="caption"
              color={
                isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight
              }
              style={styles.sectionLabel}
            >
              NEXT
            </Typography>
            <View style={styles.nextList}>
              {plan.next.map((item) => (
                <Card
                  key={item.taskId}
                  variant="outline"
                  padding={Spacing.md}
                  style={styles.nextCard}
                >
                  <View style={styles.nextText}>
                    <Typography variant="bodyBold" numberOfLines={2}>
                      {item.title}
                    </Typography>
                    <ItemMeta item={item} />
                  </View>
                  <Button
                    label="Focus"
                    size="sm"
                    variant="ghost"
                    onPress={() => onFocus(item.taskId)}
                    accessibilityLabel={`Focus on ${item.title}`}
                  />
                </Card>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {plan.alerts.length > 0 ? (
        <View style={styles.alerts}>
          {plan.alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onReviewRecovery={onReviewRecovery}
              onSwitchFocus={onSwitchFocus}
              onOpenSettings={onOpenSettings}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    width: "100%",
    maxWidth: LayoutTokens.contentMaxWidth,
    alignSelf: "center",
    marginBottom: Spacing.xl,
  },
  columns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.lg,
  },
  nowColumn: {
    flex: 1.2,
    minWidth: 0,
  },
  nextColumn: {
    flex: 0.8,
    minWidth: 0,
  },
  nextSection: {
    marginTop: Spacing.xl,
  },
  sectionLabel: {
    letterSpacing: 1.2,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  nowCard: {
    minHeight: 150,
    justifyContent: "space-between",
  },
  clearCard: {
    minHeight: 124,
    justifyContent: "center",
    gap: Spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  actionButton: {
    minWidth: 108,
  },
  choiceList: {
    gap: Spacing.sm,
  },
  choiceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  choiceText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  nextList: {
    gap: Spacing.sm,
  },
  nextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
  },
  nextText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  alerts: {
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  alertText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
});
