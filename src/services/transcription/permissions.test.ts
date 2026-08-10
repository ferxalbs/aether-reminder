import { describe, expect, test } from 'bun:test';
import { ensureMicrophonePermission, type MicrophonePermissionGateway } from './permissions';

const response = (granted: boolean, canAskAgain: boolean) => ({
  granted,
  canAskAgain,
  status: granted ? 'granted' : 'denied',
});

describe('microphone permission ownership', () => {
  test('continues immediately when already granted', async () => {
    let requests = 0;
    const gateway: MicrophonePermissionGateway = {
      get: async () => response(true, true),
      request: async () => { requests += 1; return response(true, true); },
    };
    await expect(ensureMicrophonePermission(gateway)).resolves.toBe('granted');
    expect(requests).toBe(0);
  });

  test('requests only after an intentional check finds askable denial', async () => {
    const calls: string[] = [];
    await ensureMicrophonePermission({
      get: async () => { calls.push('check'); return response(false, true); },
      request: async () => { calls.push('request'); return response(true, true); },
    });
    expect(calls).toEqual(['check', 'request']);
  });

  test('classifies permanent denial without opening another prompt', async () => {
    let requests = 0;
    await expect(ensureMicrophonePermission({
      get: async () => response(false, false),
      request: async () => { requests += 1; return response(false, false); },
    })).rejects.toMatchObject({ code: 'MIC_PERMISSION_BLOCKED' });
    expect(requests).toBe(0);
  });
});
