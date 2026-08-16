import React from "react";
import { Lock } from "lucide-react-native";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { SettingsCard } from "./SettingsCard";
import { SettingsHeaderRow } from "./SettingsHeaderRow";

export const SettingsSecurityCard: React.FC = React.memo(() => {
  const { colors } = useAetherTheme();

  return (
    <SettingsCard>
      <SettingsHeaderRow
        icon={<Lock size={20} color={colors.accent} />}
        title="Expo SecureStore Encrypted"
        subtitle="API keys are isolated in local hardware Keychain / Keystore and never written to AsyncStorage or cloud backups."
      />
    </SettingsCard>
  );
});

SettingsSecurityCard.displayName = "SettingsSecurityCard";
