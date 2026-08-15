import { useEffect, useState } from 'react';
import type { MotionDiagnostics } from '../core/types';
import {
  getMotionDiagnosticsSnapshot,
  subscribeMotionDiagnostics,
} from './diagnosticsStore';

export function useMotionDiagnostics(): MotionDiagnostics {
  const [diagnostics, setDiagnostics] = useState(getMotionDiagnosticsSnapshot);
  useEffect(() => subscribeMotionDiagnostics(setDiagnostics), []);
  return diagnostics;
}

export { getMotionDiagnosticsSnapshot };
