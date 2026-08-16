import React from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Typography } from "@/components/ui/Typography";
import { Spacing } from "@/theme/tokens";
import { useSemanticColors } from "@/theme/useSemanticColors";
import { useMotionDiagnostics } from "./useMotionDiagnostics";

export function MotionDiagnosticsCard() {
  const diagnostics = useMotionDiagnostics();
  const colors = useSemanticColors();
  const color = colors.textSecondary;
  const rows: [string, string][] = [
    ["Tier", diagnostics.profile.tier],
    ["Ceiling", diagnostics.profile.effectiveCeiling],
    [
      "Refresh",
      diagnostics.refreshRateHz == null
        ? "unknown"
        : `${diagnostics.refreshRateHz} Hz`,
    ],
    ["Thermal", diagnostics.thermalState],
    ["Low power", diagnostics.lowPowerMode ? "yes" : "no"],
    ["Memory pressure", diagnostics.memoryPressureActive ? "yes" : "no"],
    [
      "Jank ratio",
      diagnostics.jankRatio == null ? "n/a" : diagnostics.jankRatio.toFixed(3),
    ],
    [
      "Cadence interval",
      diagnostics.cadenceIntervalMs == null
        ? "n/a"
        : `${diagnostics.cadenceIntervalMs.toFixed(2)} ms`,
    ],
    ["Samples", String(diagnostics.sampleCount)],
    ["Downgrade", diagnostics.lastDowngradeReason ?? "none"],
    ["Upgrade", diagnostics.lastUpgradeReason ?? "none"],
    ["Blur", diagnostics.blurEnabled ? "enabled" : "disabled"],
    ["Native", diagnostics.nativeTelemetryAvailable ? "yes" : "unavailable"],
  ];

  return (
    <Card variant="outline" style={styles.card}>
      <Typography variant="caption" color={color} style={styles.heading}>
        MOTION DIAGNOSTICS
      </Typography>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Typography variant="tiny" color={color}>
            {label}
          </Typography>
          <Typography variant="tiny">{value}</Typography>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.lg,
    gap: 6,
  },
  heading: {
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
});
