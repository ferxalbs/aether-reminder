import { describe, expect, test } from 'bun:test';
import { VoiceError } from './errors';
import { VoiceStateMachine } from './stateMachine';

describe('voice state machine', () => {
  test('allows the permission-to-review happy path', () => {
    const machine = new VoiceStateMachine();
    machine.resetForStart();
    machine.transition('connecting', { permission: 'granted' });
    machine.transition('listening');
    machine.transition('committing');
    machine.transition('finalizing');
    machine.transition('parsing');
    machine.transition('review');
    expect(machine.snapshot.state).toBe('review');
    expect(machine.snapshot.error).toBeNull();
  });

  test('prevents illegal idle to parsing transitions', () => {
    const machine = new VoiceStateMachine();
    expect(() => machine.transition('parsing')).toThrow('Illegal voice transition');
  });

  test('maps permanent permission denial to an explicit failure state', () => {
    const machine = new VoiceStateMachine();
    machine.resetForStart();
    machine.fail(new VoiceError('MIC_PERMISSION_BLOCKED', 'blocked'));
    expect(machine.snapshot.state).toBe('permission_denied');
    expect(machine.snapshot.error?.code).toBe('MIC_PERMISSION_BLOCKED');
  });
});
