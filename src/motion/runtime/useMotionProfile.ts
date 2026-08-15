import { useContext } from 'react';
import { MotionProfileContext, defaultMotionProfile } from './motionContext';

export function useMotionProfile() {
  return useContext(MotionProfileContext) ?? defaultMotionProfile;
}
