import { describe, it, expect, vi } from 'vitest';
import type { MonitorSub } from './manager.js';
import type { Managers } from '../managers.js';
import type { MonitorContextEntry } from './context.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
}));

vi.mock('../notifications.js', () => ({
  notify: mocks.notify,
}));

import { askMonitor } from './ask.js';

function makeReg(errorMessage: string) {
  return {
    inFlight: false,
    contextBytes: 0,
    contextText: [] as MonitorContextEntry[],
    session: {
      prompt: (_text: string, handlers: { onError: (msg: string) => void }) => {
        handlers.onError(errorMessage);
      },
    },
  };
}

describe('askMonitor', () => {
  it('calls onRespawn and finishRunning on session error', () => {
    const onRespawn = vi.fn();
    const finishRunning = vi.fn();
    const reg = makeReg('test error');
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

  it('fires a rate-limited notification on a rate-limit-shaped error', () => {
    mocks.notify.mockClear();
    const reg = makeReg('429 too many requests');
    const managers = {
      tab: { startRunning: vi.fn(), finishRunning: vi.fn() },
    };

    askMonitor(
      reg as unknown as MonitorSub,
      'owner-tab',
      'test-persona',
      'test question',
      managers as unknown as Managers,
      vi.fn(),
    );

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'rate-limited', 'owner-tab');
  });

  it('does not fire a rate-limited notification on an unrelated error', () => {
    mocks.notify.mockClear();
    const reg = makeReg('connection refused');
    const managers = {
      tab: { startRunning: vi.fn(), finishRunning: vi.fn() },
    };

    askMonitor(
      reg as unknown as MonitorSub,
      'owner-tab',
      'test-persona',
      'test question',
      managers as unknown as Managers,
      vi.fn(),
    );

    expect(mocks.notify).not.toHaveBeenCalledWith(managers, 'rate-limited', 'owner-tab');
  });
});
