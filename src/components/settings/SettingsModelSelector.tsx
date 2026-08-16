import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Typography } from "@/components/ui/Typography";
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  type AIModel,
} from "@/services/ai/models";
import { useSettingsStore } from "@/stores/settings.store";
import { Hairline, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { ChevronDown, Cpu, RotateCcw } from "lucide-react-native";
import { SettingsCard } from "./SettingsCard";
import { SettingsHeaderRow } from "./SettingsHeaderRow";

export interface SettingsModelSelectorProps {
  models: AIModel[];
  onOpenModelCatalog: () => void;
}

export const SettingsModelSelector: React.FC<SettingsModelSelectorProps> = React.memo(
  ({ models, onOpenModelCatalog }) => {
    const { colors } = useAetherTheme();
    const selectedModel = useSettingsStore((s) => s.selectedModel);
    const setModel = useSettingsStore((s) => s.setModel);

    const activeModelDetails = useMemo(() => {
      const found = models.find((m) => m.id === selectedModel);
      if (found) return found;
      return {
        id: selectedModel,
        name: selectedModel.split("/").pop() || selectedModel,
        provider: selectedModel.split("/")[0] || "OpenRouter",
        availability: "available" as const,
      };
    }, [models, selectedModel]);

    const isDefaultModel = selectedModel === DEFAULT_OPENROUTER_MODEL_ID;

    return (
      <SettingsCard>
        <SettingsHeaderRow
          icon={<Cpu size={20} color={colors.accent} />}
          title="Tool-Enabled Model"
          subtitle={`Active: ${activeModelDetails.name}`}
        />

        {/* Active Model Details Box */}
        <View
          style={[
            styles.activeModelCard,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.borderDefault,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Typography
              variant="tiny"
              color={colors.textSecondary}
              style={{ letterSpacing: 0.5 }}
            >
              SELECTED MODEL ID
            </Typography>
            <Typography
              variant="bodyBold"
              style={{ marginTop: 2, color: colors.textPrimary }}
            >
              {selectedModel}
            </Typography>
            <Typography
              variant="tiny"
              color={colors.textTertiary}
              style={{ marginTop: 2 }}
            >
              Provider: {activeModelDetails.provider}
            </Typography>
          </View>

          {!isDefaultModel ? (
            <AnimatedPressable
              onPress={() => setModel(DEFAULT_OPENROUTER_MODEL_ID)}
              scaleTo={0.94}
              style={[
                styles.resetButton,
                {
                  borderColor: colors.borderDefault,
                  backgroundColor: colors.surface,
                },
              ]}
              android_ripple={{ color: colors.ripple, foreground: true }}
              interactionRadius={Radius.pill}
              accessibilityRole="button"
              accessibilityLabel="Reset model to default"
            >
              <RotateCcw size={13} color={colors.textPrimary} />
              <Typography
                variant="tiny"
                style={{ color: colors.textPrimary, fontWeight: "600" }}
              >
                Reset
              </Typography>
            </AnimatedPressable>
          ) : (
            <View
              style={[
                styles.defaultBadge,
                {
                  backgroundColor: colors.borderDefault,
                },
              ]}
            >
              <Typography variant="tiny" color={colors.textPrimary}>
                Default
              </Typography>
            </View>
          )}
        </View>

        {/* Change Model Trigger Button */}
        <AnimatedPressable
          onPress={onOpenModelCatalog}
          scaleTo={0.98}
          style={[
            styles.pullDownButton,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.borderDefault,
            },
          ]}
          android_ripple={{ color: colors.ripple, foreground: true }}
          interactionRadius={Radius.lg}
          accessibilityRole="button"
          accessibilityLabel="Change Reasoning Model"
        >
          <Typography
            variant="bodyBold"
            style={{ flex: 1, color: colors.textPrimary }}
          >
            Change Reasoning Model…
          </Typography>
          <ChevronDown size={18} color={colors.textSecondary} />
        </AnimatedPressable>
      </SettingsCard>
    );
  },
);

SettingsModelSelector.displayName = "SettingsModelSelector";

const styles = StyleSheet.create({
  activeModelCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: Hairline.width,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: Hairline.width,
  },
  defaultBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pullDownButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: Hairline.width,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
});
