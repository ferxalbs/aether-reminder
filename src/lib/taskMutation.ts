import { getDatabaseErrorMessage } from '@/db/errors';
import { reportNonFatalError } from './nonFatalError';

export type TaskMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/**
 * Converts a local task mutation failure into safe UI feedback and a
 * redacted diagnostic log. Callers receive an explicit result and can keep
 * their form open for retry.
 */
export async function runTaskMutation<T>(
  operation: () => Promise<T>,
  scope: string,
  onError: (message: string) => void,
): Promise<TaskMutationResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    const message = getDatabaseErrorMessage(error);
    onError(message);
    reportNonFatalError(scope, error);
    return { ok: false, message };
  }
}
