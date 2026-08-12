import { describe, expect, test } from 'bun:test';
import type { RecurrenceRule, Task } from '@/domain/entities';
import {
  buildRecoveryPlan,
  RECOVERY_MISSED_GRACE_MINUTES,
} from './recoveryService';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Recoverable task',
    notes: null,
    completed: false,
    priority: 'medium',
    projectId: null,
    dueDate: '2026-08-10',
    dueTime: null,
    dueTimezone: null,
    dueSemantics: 'floating',
    source: 'manual',
    creationOrigin: 'manual',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: 'version-1',
    completedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function context(iso: string, deviceTimezone = 'UTC') {
  return {
    now: new Date(iso),
    deviceTimezone,
    generatedAt: iso,
  };
}

describe('Smart Recovery proposal generation', () => {
  test('returns no candidates for current date-only work, completed work, deleted work, or future work', () => {
    const plan = buildRecoveryPlan([
      task({ id: 'today', dueDate: '2026-08-11' }),
      task({ id: 'completed', dueDate: '2026-08-09', completed: true }),
      task({ id: 'deleted', dueDate: '2026-08-09', deletedAt: '2026-08-10T00:00:00.000Z' }),
      task({ id: 'future', dueDate: '2026-08-12' }),
    ], new Map(), context('2026-08-11T23:59:00.000Z'));
    expect(plan.proposals).toHaveLength(0);
  });

  test('recommends today for an overdue date-only task and preserves its null time', () => {
    const proposal = buildRecoveryPlan(
      [task({ dueDate: '2026-08-10', dueTime: null })],
      new Map(),
      context('2026-08-11T09:00:00.000Z'),
    ).proposals[0]!;
    expect(proposal.reason).toBe('overdue');
    expect(proposal.proposed).toMatchObject({ dueDate: '2026-08-11', dueTime: null });
  });

  test('keeps an overdue timed task today only when its original time has room', () => {
    const today = buildRecoveryPlan(
      [task({ id: 'today-time', dueTime: '11:00' })],
      new Map(),
      context('2026-08-11T09:00:00.000Z'),
    ).proposals[0]!;
    const tomorrow = buildRecoveryPlan(
      [task({ id: 'tomorrow-time', dueTime: '09:10' })],
      new Map(),
      context('2026-08-11T09:00:00.000Z'),
    ).proposals[0]!;
    expect(today.proposed).toMatchObject({ dueDate: '2026-08-11', dueTime: '11:00' });
    expect(tomorrow.proposed).toMatchObject({ dueDate: '2026-08-12', dueTime: '09:10' });
  });

  test('recommends tomorrow for a missed timed task and exposes a deterministic later-today choice', () => {
    const proposal = buildRecoveryPlan(
      [task({ dueDate: '2026-08-11', dueTime: '08:00' })],
      new Map(),
      context('2026-08-11T09:00:00.000Z'),
    ).proposals[0]!;
    expect(proposal.reason).toBe('missed_time');
    expect(proposal.proposed).toMatchObject({ dueDate: '2026-08-12', dueTime: '08:00' });
    expect(proposal.alternatives).toContainEqual(expect.objectContaining({
      kind: 'later_today',
      schedule: expect.objectContaining({ dueDate: '2026-08-11', dueTime: '10:00' }),
    }));

    const insideGrace = buildRecoveryPlan(
      [task({ dueDate: '2026-08-11', dueTime: '08:31' })],
      new Map(),
      context('2026-08-11T09:00:00.000Z'),
    );
    expect(insideGrace.proposals).toHaveLength(0);
    expect(RECOVERY_MISSED_GRACE_MINUTES).toBe(30);
  });

  test('orders same-day candidates by date, then priority', () => {
    const plan = buildRecoveryPlan([
      task({ id: 'low', priority: 'low' }),
      task({ id: 'high', priority: 'high' }),
      task({ id: 'medium', priority: 'medium' }),
    ], new Map(), context('2026-08-11T09:00:00.000Z'));
    expect(plan.proposals.map((proposal) => proposal.taskId)).toEqual(['high', 'medium', 'low']);
  });

  test('does not mark date-only work at local midnight as missed', () => {
    const plan = buildRecoveryPlan([
      task({ id: 'today-only', dueDate: '2026-08-11', dueTime: null }),
      task({ id: 'yesterday', dueDate: '2026-08-10', dueTime: null }),
    ], new Map(), context('2026-08-11T00:10:00.000Z'));
    expect(plan.proposals.map((proposal) => proposal.taskId)).toEqual(['yesterday']);
  });

  test('uses configured timezone for fixed semantics and device timezone for floating semantics', () => {
    const plan = buildRecoveryPlan([
      task({
        id: 'fixed',
        dueDate: '2026-08-10',
        dueTime: '19:00',
        dueTimezone: 'America/New_York',
        dueSemantics: 'fixed',
      }),
      task({
        id: 'floating',
        dueDate: '2026-08-10',
        dueTime: '19:00',
        dueTimezone: null,
        dueSemantics: 'floating',
      }),
    ], new Map(), context('2026-08-11T00:30:00.000Z', 'America/Los_Angeles'));
    expect(plan.proposals.map((proposal) => proposal.taskId)).toEqual(['fixed']);
  });

  test('re-evaluates floating eligibility when the device timezone changes', () => {
    const floating = task({ dueDate: '2026-08-11', dueTime: '23:00' });
    const utcPlan = buildRecoveryPlan(
      [floating],
      new Map(),
      context('2026-08-12T02:00:00.000Z', 'UTC'),
    );
    const newYorkPlan = buildRecoveryPlan(
      [floating],
      new Map(),
      context('2026-08-12T02:00:00.000Z', 'America/New_York'),
    );

    expect(utcPlan.proposals).toHaveLength(1);
    expect(newYorkPlan.proposals).toHaveLength(0);
  });

  test('keeps recurrence metadata in derived state without changing the rule', () => {
    const rule: RecurrenceRule = {
      id: 'rule-1',
      taskId: 'task-1',
      frequency: 'daily',
      interval: 1,
      weekdays: null,
      monthDays: null,
      startDate: '2026-08-01',
      endDate: null,
      maxOccurrences: null,
      occurrenceCount: 3,
      mode: 'fixed',
      timezone: 'UTC',
      active: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: 'rule-version-1',
    };
    const plan = buildRecoveryPlan(
      [task({ dueDate: '2026-08-10' })],
      new Map([['task-1', rule]]),
      context('2026-08-11T09:00:00.000Z'),
    );
    expect(plan.proposals[0]?.recurrence).toEqual({
      ruleId: 'rule-1',
      mode: 'fixed',
      occurrenceCount: 3,
      startDate: '2026-08-01',
    });
  });

  test('skips malformed schedules defensively', () => {
    const plan = buildRecoveryPlan([
      task({ id: 'bad-date', dueDate: 'not-a-date' }),
      task({ id: 'bad-time', dueTime: '25:99' }),
      task({ id: 'bad-zone', dueSemantics: 'fixed', dueTimezone: 'Not/AZone' }),
    ], new Map(), context('2026-08-11T09:00:00.000Z'));
    expect(plan.proposals).toHaveLength(0);
  });
});
