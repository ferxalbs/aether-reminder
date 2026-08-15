import type { MotionDiagnostics } from '../core/types';
import { defaultMotionDiagnostics } from './motionContext';

let current = defaultMotionDiagnostics;
const listeners = new Set<(value: MotionDiagnostics) => void>();

export function publishMotionDiagnostics(value: MotionDiagnostics): void {
  current = value;
  listeners.forEach((listener) => listener(value));
}

export function getMotionDiagnosticsSnapshot(): MotionDiagnostics {
  return current;
}

export function subscribeMotionDiagnostics(
  listener: (value: MotionDiagnostics) => void,
): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
