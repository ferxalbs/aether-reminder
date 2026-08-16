import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Check, RefreshCw, Search } from "lucide-react-native";
import { canRunAsAgent } from "@/services/ai/inference";
import type { AIModel } from "@/services/ai/models";
import { Radius, Spacing } from "@/theme/tokens";
import { useSemanticColors } from "@/theme/useSemanticColors";
import { AnimatedPressable } from "./AnimatedPressable";
import { Sheet } from "./Sheet";
import { Typography } from "./Typography";

export interface ModelCatalogSheetProps {
  visible: boolean;
  onClose: () => void;
  models: AIModel[];
  loading: boolean;
  error: string | null;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  onRefresh: () => void;
}

function formatContextLength(contextLength?: number): string {
  if (!contextLength) return "Context unknown";
  if (contextLength >= 1000000)
    return `${(contextLength / 1000000).toFixed(1)}M context`;
  if (contextLength >= 1000)
    return `${Math.round(contextLength / 1000)}k context`;
  return `${contextLength} tokens`;
}

export function ModelCatalogSheet({
  visible,
  onClose,
  models,
  loading,
  error,
  selectedModelId,
  onSelectModel,
  onRefresh,
}: ModelCatalogSheetProps) {
  const colors = useSemanticColors();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query
      ? models.filter((model) =>
          `${model.name} ${model.provider} ${model.id}`
            .toLowerCase()
            .includes(query),
        )
      : models;
  }, [models, searchQuery]);

  const handleSelect = (model: AIModel) => {
    const isSelectable =
      model.availability === "available" && canRunAsAgent(model.capabilities);
    if (isSelectable) {
      onSelectModel(model.id);
      onClose();
    }
  };

  const headerAction = (
    <AnimatedPressable
      onPress={onRefresh}
      accessibilityLabel="Force refresh model catalog"
      accessibilityRole="button"
      style={styles.iconPressable}
    >
      <RefreshCw
        size={18}
        color={colors.textSecondary}
      />
    </AnimatedPressable>
  );

  return (
    <Sheet
      visible={visible}
      onRequestClose={onClose}
      title="OpenRouter Model Catalog"
      subtitle="Select a tool-capable reasoning model"
      headerAction={headerAction}
      snapPoints={["90%"]}
      accessibilityLabel="OpenRouter Model Catalog"
    >
      <View style={styles.container}>
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.borderDefault,
            },
          ]}
        >
          <Search
            size={16}
            color={colors.textTertiary}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search models or providers…"
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            style={[
              styles.searchInput,
              { color: colors.textPrimary },
            ]}
          />
        </View>

        {loading ? (
          <ActivityIndicator
            style={styles.centerLoader}
            color={colors.accent}
          />
        ) : error ? (
          <Typography
            variant="caption"
            color={colors.textSecondary}
            style={styles.errorText}
          >
            {error}
          </Typography>
        ) : filteredModels.length === 0 ? (
          <Typography
            variant="caption"
            color={colors.textSecondary}
            style={styles.errorText}
          >
            No models match &quot;{searchQuery}&quot;.
          </Typography>
        ) : (
          <FlatList
            style={styles.list}
            data={filteredModels}
            keyExtractor={(model) => model.id}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item: model }) => {
              const isSelected = selectedModelId === model.id;
              const isSelectable =
                model.availability === "available" &&
                canRunAsAgent(model.capabilities);
              const statusLabel =
                model.availability !== "available"
                  ? "Unavailable"
                  : isSelectable
                    ? "Agent-Ready"
                    : "No Tool Support";

              return (
                <AnimatedPressable
                  onPress={() => handleSelect(model)}
                  disabled={!isSelectable}
                  scaleTo={0.98}
                  accessibilityRole="radio"
                  accessibilityLabel={`${model.name}, ${model.provider}, ${formatContextLength(model.contextLength)}, ${statusLabel}`}
                  accessibilityState={{
                    selected: isSelected,
                    disabled: !isSelectable,
                  }}
                  style={[
                    styles.modelCardItem,
                    {
                      backgroundColor: isSelected
                        ? colors.accentContainer
                        : "transparent",
                      borderColor: isSelected
                        ? colors.accent
                        : colors.borderDefault,
                      opacity: isSelectable || isSelected ? 1 : 0.45,
                    },
                  ]}
                >
                  <View style={styles.modelInfo}>
                    <Typography variant="bodyBold">{model.name}</Typography>
                    <View style={styles.modelMetadataRow}>
                      <Typography
                        variant="tiny"
                        color={colors.textSecondary}
                      >
                        {model.provider}
                      </Typography>
                      <Typography
                        variant="tiny"
                        color={colors.textTertiary}
                      >
                        • {formatContextLength(model.contextLength)}
                      </Typography>
                      <View
                        style={[
                          styles.capabilityPill,
                          {
                            backgroundColor: colors.surfaceRaised,
                            borderColor: colors.borderDefault,
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <Typography
                          variant="tiny"
                          style={{
                            color: colors.textPrimary,
                          }}
                        >
                          {statusLabel}
                        </Typography>
                      </View>
                    </View>
                  </View>
                  {isSelected ? (
                    <Check
                      size={18}
                      color={colors.onAccentContainer}
                    />
                  ) : null}
                </AnimatedPressable>
              );
            }}
          />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  iconPressable: {
    padding: 6,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: 8,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
  },
  centerLoader: {
    marginVertical: Spacing.xl,
  },
  errorText: {
    marginVertical: Spacing.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.lg,
  },
  modelCardItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  modelInfo: {
    flex: 1,
  },
  modelMetadataRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  capabilityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
});
