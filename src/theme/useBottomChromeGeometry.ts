import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutTokens } from '@/theme/tokens';

export function useBottomChromeGeometry() {
  const insets = useSafeAreaInsets();
  
  const systemBottomInset = Math.max(12, insets.bottom + 4);
  const navigationHeight = LayoutTokens.navigationHeight;
  const navigationBottom = systemBottomInset;
  
  const composerNavigationGap = 12;
  const composerHeight = LayoutTokens.composerHeight;
  
  const composerBottom = navigationBottom + navigationHeight + composerNavigationGap;
  const contentBottomInset = composerBottom + composerHeight + 16;
  const settingsContentBottomInset = navigationBottom + navigationHeight + 16;
  
  return {
    systemBottomInset,
    navigationHeight,
    navigationBottom,
    composerHeight,
    composerBottom,
    contentBottomInset,
    settingsContentBottomInset,
  };
}
