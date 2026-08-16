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
import { Colors, Radius, Spacing } from "@/theme/tokens";
import { useIsDark } from "@/theme/useResolvedTheme";
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
  const isDark = useIsDark();
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
        color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
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
              backgroundColor: isDark
                ? Colors.surfaceRaisedDark
                : Colors.surfaceRaisedLight,
              borderColor: isDark ? Colors.borderDark : Colors.borderLight,
            },
          ]}
        >
          <Search
            size={16}
            color={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search models or providers…"
            placeholderTextColor={
              isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight
            }
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            style={[
              styles.searchInput,
              { color: isDark ? Colors.textDark : Colors.textLight },
            ]}
          />
        </View>

        {loading ? (
          <ActivityIndicator
            style={styles.centerLoader}
            color={isDark ? Colors.white : Colors.black}
          />
        ) : error ? (
          <Typography
            variant="caption"
            color={
              isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight
            }
            style={styles.errorText}
          >
            {error}
          </Typography>
        ) : filteredModels.length === 0 ? (
          <Typography
            variant="caption"
            color={
              isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight
            }
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
                        ? isDark
                          ? Colors.surfaceRaisedDark
                          : Colors.surfaceRaisedLight
                        : "transparent",
                      borderColor: isSelected
                        ? isDark
                          ? Colors.white
                          : Colors.black
                        : isDark
                          ? Colors.borderDark
                          : Colors.borderLight,
                      opacity: isSelectable || isSelected ? 1 : 0.45,
                    },
                  ]}
                >
                  <View style={styles.modelInfo}>
                    <Typography variant="bodyBold">{model.name}</Typography>
                    <View style={styles.modelMetadataRow}>
                      <Typography
                        variant="tiny"
                        color={
                          isDark
                            ? Colors.secondaryTextDark
                            : Colors.secondaryTextLight
                        }
                      >
                        {model.provider}
                      </Typography>
                      <Typography
                        variant="tiny"
                        color={
                          isDark
                            ? Colors.tertiaryTextDark
                            : Colors.tertiaryTextLight
                        }
                      >
                        • {formatContextLength(model.contextLength)}
                      </Typography>
                      <View
                        style={[
                          styles.capabilityPill,
                          {
                            backgroundColor: isDark
                              ? Colors.surfaceRaisedDark
                              : Colors.surfaceRaisedLight,
                            borderColor: isDark
                              ? Colors.borderDark
                              : Colors.borderLight,
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <Typography
                          variant="tiny"
                          style={{
                            color: isDark ? Colors.white : Colors.black,
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
                      color={isDark ? Colors.white : Colors.black}
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
