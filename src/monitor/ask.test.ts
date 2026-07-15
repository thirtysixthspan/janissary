import { describe, it, expect, vi } from 'vitest';
import type { MonitorSub } from './manager.js';
import type { Managers } from '../managers.js';
import type { MonitorContextEntry } from './context.js';
import { askMonitor } from './ask.js';

describe('askMonitor', () => {
  it('calls onRespawn and finishRunning on session error', () => {
    const onRespawn = vi.fn();
    const finishRunning = vi.fn();
    const reg = {
      inFlight: false,
      contextBytes: 0,
      contextText: [] as MonitorContextEntry[],
      session: {
        prompt: (_text: string, handlers: { onError: (msg: string) => void }) => {
          handlers.onError('test error');
        },
      },
    };
    const managers = {
      tab: { startRunning: vi.fn(), finishRunning },
    };

    askMonitor(
      reg as unknown as MonitorSub,
      'owner-tab',
      'test-persona',
      'test question',
      managers as unknown as Managers,
      onRespawn,
    );

    expect(managers.tab.startRunning).toHaveBeenCalledWith(
      'owner-tab',
      'monitor ask test-persona test question',
    );
    expect(finishRunning).toHaveBeenCalledWith(
      'owner-tab',
      'monitor test-persona: test error — restarting monitor session',
    );
    expect(onRespawn).toHaveBeenCalledOnce();
  });
});
