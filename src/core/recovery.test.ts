import { describe, expect, test } from 'bun:test';
import { addLocalCalendarDays, getLocalDateString } from '@/temporal/localCalendar';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { NotificationError } from '@/services/notifications/errors';
import type { NotificationReconciliationResult } from '@/services/notifications/notificationReconciliation';
import { AetherCore } from './aetherCore';

async function ready() {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  return { db, core: new AetherCore({ db }) };
}

async function createOverdue(core: AetherCore, title: string, dueDate: string, priority = 'medium' as const) {
  return core.commands.createTask({ title, dueDate, dueTime: null, priority });
}

function failedReconciliation(): NotificationReconciliationResult {
  return {
    mode: 'incremental',
    reason: 'recovery',
    startedAt: '2026-08-11T12:00:00.000Z',
    completedAt: '2026-08-11T12:00:00.000Z',
    durationMs: 0,
    inspected: 1,
    dirtyProcessed: 1,
    repaired: 0,
    scheduled: 0,
    cancelled: 0,
    unchanged: 0,
    blocked: 0,
    missing: 0,
    stale: 0,
    orphanCancelled: 0,
    duplicateCancelled: 0,
    failed: 1,
    failures: [{
      kind: 'reminder_projection',
      error: new NotificationError('PROJECTION_FAILED', 'forced projection failure'),
    }],
  };
}

describe('Smart Recovery command path', () => {
  test('applies a batch once, reports duplicate apply as already applied, supports Undo, and regenerates from SQLite state', async () => {
    const { db, core } = await ready();
    const now = new Date('2026-08-11T12:00:00.000Z');
    const today = getLocalDateString(now);
    const overdue = addLocalCalendarDays(today, -1);
    const first = await createOverdue(core, 'First slipped', overdue, 'high');
    const second = await createOverdue(core, 'Second slipped', overdue, 'medium');

    const plan = await core.services.recovery.generatePlan(now);
    expect(plan.proposals.map((proposal) => proposal.taskId)).toEqual([first.value.id, second.value.id]);
    const selections = plan.proposals.map((proposal) => ({ proposal, schedule: proposal.proposed }));

    const applied = await core.commands.applyRecovery(plan.id, selections);
    expect(applied.applied).toEqual([first.value.id, second.value.id]);
    expect(applied.receipt?.risk).toBe('BULK_MUTATION');
    expect(applied.receipt?.undo?.kind).toBe('recovery.batch');

    const afterApply = await core.services.recovery.generatePlan(now);
    expect(afterApply.proposals).toHaveLength(0);

    const duplicate = await core.commands.applyRecovery(plan.id, selections);
    expect(duplicate.applied).toHaveLength(0);
    expect(duplicate.alreadyApplied).toEqual([first.value.id, second.value.id]);

    const undone = await core.commands.undoRecovery(applied.receipt!);
    expect(undone.applied).toEqual([first.value.id, second.value.id]);
    expect((await core.services.tasks.getTask(first.value.id))?.dueDate).toBe(overdue);
    expect((await core.services.tasks.getTask(second.value.id))?.dueDate).toBe(overdue);

    // Equivalent to an app restart: a new core recreates derived state from
    // authoritative SQLite without any persisted recovery plan.
    const restartedCore = new AetherCore({ db });
    const afterUndo = await restartedCore.services.recovery.generatePlan(now);
    expect(afterUndo.proposals.map((proposal) => proposal.taskId)).toEqual([first.value.id, second.value.id]);
    await db.closeAsync?.();
  });

  test('skips a stale entry while applying the rest of the batch', async () => {
    const { db, core } = await ready();
    const now = new Date('2026-08-11T12:00:00.000Z');
    const today = getLocalDateString(now);
    const overdue = addLocalCalendarDays(today, -1);
    const first = await createOverdue(core, 'Changed before apply', overdue);
    const second = await createOverdue(core, 'Still recoverable', overdue);
    const plan = await core.services.recovery.generatePlan(now);
    const staleProposal = plan.proposals.find((proposal) => proposal.taskId === first.value.id)!;
    await core.commands.updateTask(first.value.id, { dueDate: addLocalCalendarDays(today, 1) });

    const result = await core.commands.applyRecovery(
      plan.id,
      plan.proposals.map((proposal) => ({ proposal, schedule: proposal.proposed })),
    );
    expect(result.skippedStale).toEqual([staleProposal.taskId]);
    expect(result.applied).toEqual([second.value.id]);
    expect((await core.services.tasks.getTask(first.value.id))?.dueDate).toBe(addLocalCalendarDays(today, 1));
    await db.closeAsync?.();
  });

  test('keeps domain recovery successful when reliability projection repair fails', async () => {
    const { db, core } = await ready();
    const now = new Date('2026-08-11T12:00:00.000Z');
    const today = getLocalDateString(now);
    const overdue = addLocalCalendarDays(today, -1);
    const created = await createOverdue(core, 'Projection can repair later', overdue);
    const plan = await core.services.recovery.generatePlan(now);
    const originalReconcile = core.services.notifications.reconcile;
    core.services.notifications.reconcile = async () => failedReconciliation();

    const result = await core.commands.applyRecovery(
      plan.id,
      plan.proposals.map((proposal) => ({ proposal, schedule: proposal.proposed })),
    );
    core.services.notifications.reconcile = originalReconcile;

    expect(result.applied).toEqual([created.value.id]);
    expect(result.failed).toHaveLength(0);
    expect(result.projectionFailures).toHaveLength(1);
    expect((await core.services.tasks.getTask(created.value.id))?.dueDate).toBe(today);
    await db.closeAsync?.();
  });

  test('fixed recurrence preserves future cadence when the current occurrence is recovered', async () => {
    const { db, core } = await ready();
    const now = new Date('2026-08-11T12:00:00.000Z');
    const today = getLocalDateString(now);
    const startDate = addLocalCalendarDays(today, -2);
    const created = await core.commands.createRecurringTask({
      task: { title: 'Fixed cadence', dueDate: startDate, dueTime: null },
      recurrence: {
        id: 'fixed-recovery-rule',
        frequency: 'daily',
        interval: 1,
        startDate,
        mode: 'fixed',
      },
    });
    const plan = await core.services.recovery.generatePlan(now);
    const proposal = plan.proposals.find((item) => item.taskId === created.task.id)!;
    expect(proposal.recurrence?.mode).toBe('fixed');
    await core.commands.applyRecovery(plan.id, [{ proposal, schedule: proposal.proposed }]);

    await core.commands.completeTask(created.task.id);
    const next = await core.services.tasks.getTask('recurrence_fixed-recovery-rule_2');
    expect(next?.dueDate).toBe(addLocalCalendarDays(startDate, 1));
    await db.closeAsync?.();
  });

  test('after-completion recurrence still anchors from completion date', async () => {
    const { db, core } = await ready();
    const now = new Date('2026-08-11T12:00:00.000Z');
    const today = getLocalDateString(now);
    const startDate = addLocalCalendarDays(today, -2);
    const created = await core.commands.createRecurringTask({
      task: { title: 'Completion cadence', dueDate: startDate, dueTime: null },
      recurrence: {
        id: 'completion-recovery-rule',
        frequency: 'daily',
        interval: 1,
        startDate,
        mode: 'after_completion',
      },
    });
    const plan = await core.services.recovery.generatePlan(now);
    const proposal = plan.proposals.find((item) => item.taskId === created.task.id)!;
    await core.commands.applyRecovery(plan.id, [{ proposal, schedule: proposal.proposed }]);

    const recovered = await core.services.tasks.getTask(created.task.id);
    expect(recovered).not.toBeNull();
    await core.services.recurrence.advanceAfterCompletion({
      ...recovered!,
      completed: true,
      completedAt: now.toISOString(),
    });
    const completionDate = getLocalDateString(now);
    const next = await core.services.tasks.getTask('recurrence_completion-recovery-rule_2');
    expect(next?.dueDate).toBe(addLocalCalendarDays(completionDate, 1));
    await db.closeAsync?.();
  });
});
