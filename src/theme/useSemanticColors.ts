import { SemanticColors } from './tokens';
import { useIsDark } from './useResolvedTheme';

export function useSemanticColors() {
  return useIsDark() ? SemanticColors.dark : SemanticColors.light;
}
