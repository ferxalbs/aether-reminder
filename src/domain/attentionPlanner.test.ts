import { describe, expect, test } from 'bun:test';
import type {
  AttentionCandidateFacts,
  AttentionFocusIntent,
  AttentionTemporalContext,
} from './attentionPlanner';
import { AttentionPlanner } from './attentionPlanner';

const now = new Date('2030-01-02T10:00:00.000Z');
const temporalContext: AttentionTemporalContext = {
  now,
  localDate: '2030-01-02',
  nextDateBoundaryAtMs: new Date('2030-01-03T00:00:00.000Z').getTime(),
};

function candidate(overrides: Partial<AttentionCandidateFacts> = {}): AttentionCandidateFacts {
  return {
    taskId: 'task-1',
    title: 'Task 1',
    priority: 'medium',
    dueDate: '2030-01-02',
    dueTime: '12:00',
    dueTimezone: null,
    dueSemantics: 'floating',
    createdAt: '2030-01-01T09:00:00.000Z',
    temporal: {
      status: 'timed',
      dueAtMs: new Date('2030-01-02T12:00:00.000Z').getTime(),
      relevantDueDate: '2030-01-02',
      isToday: true,
      isDueNow: false,
      minutesUntilDue: 120,
      daysUntilDue: 0,
      isInNearFuture: false,
      nextMeaningfulAtMs: new Date('2030-01-02T11:30:00.000Z').getTime(),
    },
    explicitFocus: false,
    adaptiveNudge: 'no_nudge',
    recoveryOwned: false,
    recoveredRecently: false,
    ...overrides,
  };
}

function plan(
  candidates: readonly AttentionCandidateFacts[],
  overrides: Partial<Parameters<typeof AttentionPlanner.plan>[0]> = {},
) {
  return AttentionPlanner.plan({
    candidates,
    explicitFocus: null,
    temporalContext,
    ...overrides,
  });
}

function focused(taskId: string): AttentionFocusIntent {
  return { taskId, createdAt: now.toISOString(), source: 'manual' };
}

describe('AttentionPlanner', () => {
  test('returns a clear plan when there are no eligible tasks', () => {
    const result = plan([]);
    expect(result.selectionMode).toBe('clear');
    expect(result.now).toBeNull();
    expect(result.next).toEqual([]);
  });

  test('recommends one imminent task', () => {
    const result = plan([
      candidate({
        temporal: {
          ...candidate().temporal,
          minutesUntilDue: 20,
          nextMeaningfulAtMs: new Date('2030-01-02T10:20:00.000Z').getTime(),
        },
      }),
    ]);
    expect(result.selectionMode).toBe('recommended');
    expect(result.now?.rankTier).toBe('B');
    expect(result.now?.confidence).toBe('high');
    expect(result.now?.reasonCodes).toContain('due_imminent');
  });

  test('temporal imminence outranks a later high-priority task', () => {
    const result = plan([
      candidate({ taskId: 'later-high', priority: 'high' }),
      candidate({
        taskId: 'soon-medium',
        priority: 'medium',
        dueTime: '10:15',
        temporal: {
          ...candidate().temporal,
          minutesUntilDue: 15,
        },
      }),
    ]);
    expect(result.now?.taskId).toBe('soon-medium');
    expect(result.next.map((item) => item.taskId)).toContain('later-high');
  });

  test('date-only work scheduled today can be recommended', () => {
    const result = plan([
      candidate({
        dueTime: null,
        temporal: {
          status: 'date_only',
          dueAtMs: null,
          relevantDueDate: '2030-01-02',
          isToday: true,
          isDueNow: false,
          minutesUntilDue: null,
          daysUntilDue: 0,
          isInNearFuture: false,
          nextMeaningfulAtMs: null,
        },
      }),
    ]);
    expect(result.now?.rankTier).toBe('D');
    expect(result.now?.scheduledContext).toBe('due_today');
  });

  test('undated work is not arbitrarily selected', () => {
    const result = plan([
      candidate({
        dueDate: null,
        dueTime: null,
        priority: 'high',
        temporal: {
          status: 'undated',
          dueAtMs: null,
          relevantDueDate: null,
          isToday: false,
          isDueNow: false,
          minutesUntilDue: null,
          daysUntilDue: null,
          isInNearFuture: false,
          nextMeaningfulAtMs: null,
        },
      }),
    ]);
    expect(result.selectionMode).toBe('clear');
    expect(result.now).toBeNull();
  });

  test('near-future work is exposed only as NEXT, not manufactured NOW', () => {
    const result = plan([
      candidate({
        dueDate: '2030-01-04',
        dueTime: '09:00',
        temporal: {
          ...candidate().temporal,
          relevantDueDate: '2030-01-04',
          isToday: false,
          daysUntilDue: 2,
          minutesUntilDue: 2_820,
          isInNearFuture: true,
        },
      }),
    ]);
    expect(result.selectionMode).toBe('clear');
    expect(result.now).toBeNull();
    expect(result.next[0]?.taskId).toBe('task-1');
  });

  test('ambiguous equivalent candidates return choose mode', () => {
    const result = plan([
      candidate({ taskId: 'alpha', dueTime: null, temporal: {
        ...candidate().temporal,
        status: 'date_only',
        dueAtMs: null,
        minutesUntilDue: null,
      } }),
      candidate({ taskId: 'beta', dueTime: null, temporal: {
        ...candidate().temporal,
        status: 'date_only',
        dueAtMs: null,
        minutesUntilDue: null,
      } }),
    ]);
    expect(result.selectionMode).toBe('choose');
    expect(result.now).toBeNull();
    expect(result.choices.map((item) => item.taskId)).toEqual(['alpha', 'beta']);
    expect(result.choices.every((item) => item.confidence === 'low')).toBe(true);
  });

  test('manual focus wins and remains visible when an imminent task conflicts', () => {
    const result = plan([
      candidate({ taskId: 'focused', title: 'Write proposal', explicitFocus: true }),
      candidate({
        taskId: 'due-now',
        title: 'Call bank',
        dueTime: '10:00',
        temporal: {
          ...candidate().temporal,
          minutesUntilDue: 0,
          isDueNow: true,
        },
      }),
    ], { explicitFocus: focused('focused') });
    expect(result.now?.taskId).toBe('focused');
    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'focus_conflict', taskId: 'due-now' }),
    ]));
    expect(result.next[0]?.taskId).toBe('due-now');
  });

  test('a focused task is not displaced by an ordinary candidate', () => {
    const result = plan([
      candidate({ taskId: 'focused', explicitFocus: true }),
      candidate({ taskId: 'new-task', priority: 'high', temporal: {
        ...candidate().temporal,
        minutesUntilDue: 45,
      } }),
    ], { explicitFocus: focused('focused') });
    expect(result.now?.taskId).toBe('focused');
  });

  test('nudge_due raises a candidate without ranking suppressed nudges', () => {
    const result = plan([
      candidate({
        taskId: 'nudge',
        dueDate: null,
        dueTime: null,
        adaptiveNudge: 'nudge_due',
        temporal: {
          ...candidate().temporal,
          status: 'undated',
          dueAtMs: null,
          relevantDueDate: null,
          isToday: false,
          minutesUntilDue: null,
          daysUntilDue: null,
          isInNearFuture: false,
          nextMeaningfulAtMs: null,
        },
      }),
      candidate({ taskId: 'today', priority: 'high' }),
      candidate({ taskId: 'suppressed', adaptiveNudge: 'nudge_suppressed' }),
    ]);
    expect(result.now?.taskId).toBe('nudge');
    expect(result.now?.rankTier).toBe('C');
    expect(result.next.some((item) => item.taskId === 'suppressed')).toBe(false);
  });

  test('Recovery produces one alert and keeps recovery-owned tasks out of the queue', () => {
    const result = plan([
      candidate({ taskId: 'slipped', recoveryOwned: true, temporal: {
        ...candidate().temporal,
        minutesUntilDue: -20,
        isDueNow: true,
      } }),
      candidate({ taskId: 'healthy' }),
    ], {
      recoveryState: { proposalCount: 1, taskIds: ['slipped'] },
    });
    expect(result.now?.taskId).toBe('healthy');
    expect(result.next.some((item) => item.taskId === 'slipped')).toBe(false);
    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'recovery_available', count: 1 }),
    ]));
  });

  test('reliability is a separate actionable alert', () => {
    const result = plan([], {
      reliabilityState: { degraded: true, activeReminderCount: 2 },
    });
    expect(result.now).toBeNull();
    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'reliability_degraded', action: 'open_settings' }),
    ]));
  });

  test('hysteresis keeps the current automatic NOW through a small ranking change', () => {
    const first = plan([
      candidate({ taskId: 'current', temporal: { ...candidate().temporal, minutesUntilDue: 120 } }),
      candidate({ taskId: 'other', temporal: { ...candidate().temporal, minutesUntilDue: 130 } }),
    ]);
    expect(first.now?.taskId).toBe('current');

    const second = plan([
      candidate({ taskId: 'current', temporal: { ...candidate().temporal, minutesUntilDue: 100 } }),
      candidate({ taskId: 'other', temporal: { ...candidate().temporal, minutesUntilDue: 90 } }),
    ], { previousPlan: first });
    expect(second.now?.taskId).toBe('current');
  });

  test('same facts and clock produce the same plan without mutation', () => {
    const input = [candidate({ taskId: 'b' }), candidate({ taskId: 'a', priority: 'low' })];
    const before = JSON.stringify(input);
    const first = plan(input);
    const second = plan(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });

  test('NEXT remains bounded and has deterministic tie ordering', () => {
    const nextCandidates = Array.from({ length: 8 }, (_, index) => candidate({
      taskId: `next-${String(8 - index).padStart(2, '0')}`,
      temporal: {
        ...candidate().temporal,
        minutesUntilDue: 2_000,
        isToday: false,
        daysUntilDue: 1,
        isInNearFuture: true,
        relevantDueDate: '2030-01-03',
      },
    }));
    const result = plan([
      candidate({ taskId: 'focused', explicitFocus: true }),
      ...nextCandidates,
    ], { explicitFocus: focused('focused') });
    expect(result.next).toHaveLength(4);
    expect(result.next.map((item) => item.taskId)).toEqual(['next-01', 'next-02', 'next-03', 'next-04']);
  });
});
