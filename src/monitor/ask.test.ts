import { describe, it, expect, vi } from 'vitest';
import type { MonitorSub } from './live-monitors.js';
import type { Managers } from '../managers.js';
import type { MonitorContextEntry } from './context.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
}));

vi.mock('../notifications/index.js', () => ({
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
      { command: 'monitor ask test-persona test question' },
    );
    expect(onRespawn).toHaveBeenCalledOnce();
  });

  it('finishes the running entry for an error that arrives after the monitor stopped, leaving the respawn to onRespawn', () => {
    let fail: (message: string) => void = () => {};
    const reg = {
      inFlight: false,
      contextBytes: 0,
      contextText: [] as MonitorContextEntry[],
      session: {
        prompt: (_text: string, handlers: { onError: (msg: string) => void }) => { fail = handlers.onError; },
      },
    };
    const onRespawn = vi.fn();
    const finishRunning = vi.fn();
    const managers = { tab: { startRunning: vi.fn(), finishRunning } };

    askMonitor(
      reg as unknown as MonitorSub,
      'owner-tab',
      'test-persona',
      'test question',
      managers as unknown as Managers,
      onRespawn,
    );
    expect(finishRunning).not.toHaveBeenCalled();

    // The monitor is stopped here; its killed local session still reports the pending prompt's error.
    fail('ACP connection closed');

    expect(finishRunning).toHaveBeenCalledWith(
      'owner-tab',
      'monitor test-persona: ACP connection closed — restarting monitor session',
      { command: 'monitor ask test-persona test question' },
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
