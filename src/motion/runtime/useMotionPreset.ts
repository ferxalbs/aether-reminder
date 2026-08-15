import { useMemo } from 'react';
import { resolveMotionPreset } from '../presets/catalog';
import type { MotionPresetId } from '../core/types';
import { useMotionProfile } from './useMotionProfile';

export function useMotionPreset(id: MotionPresetId) {
  const profile = useMotionProfile();
  return useMemo(() => resolveMotionPreset(id, profile.tier), [id, profile.tier]);
}
