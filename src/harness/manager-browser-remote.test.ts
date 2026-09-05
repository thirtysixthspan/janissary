import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import {
  createHarnessManager, harnessBrowserMocks, makeBrowserManagers, resetHarnessBrowserFixture,
} from './manager-browser-test-fixture.js';

type RemoteHandlers = {
  onReady: (dir: string, notice?: string) => void;
  onFailed: (message: string) => void;
  onClosed: () => void;
};

function remoteBrowserLaunch(): {
  managers: Managers;
  registerRemotePty: ReturnType<typeof vi.fn>;
  ready: (dir: string, notice?: string) => void;
} {
  const { managers } = makeBrowserManagers();
  const channel = { ptyId: 'ssh-pty-1', attached: true, send: vi.fn() };
  let handlers: RemoteHandlers | undefined;
  const registerRemotePty = vi.fn(() => 'rpty1');
  (managers.pty as unknown as { registerRemotePty: unknown }).registerRemotePty = registerRemotePty;
  (managers as unknown as { remote: unknown }).remote = {
    open: vi.fn((_label: string, _address: unknown, _cwd: string, next: RemoteHandlers) => {
      handlers = next;
      return channel;
    }),
    get: vi.fn(() => channel),
    transcriptSource: vi.fn(() => ({ poll: () => [], resolved: () => false })),
  };
  return {
    managers,
    registerRemotePty,
    ready: (dir, notice) => handlers!.onReady(dir, notice),
  };
}

describe('HarnessManager remote e2e browser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHarnessBrowserFixture();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts nothing locally and sets browser on the remote spawn', async () => {
    const { managers, ready, registerRemotePty } = remoteBrowserLaunch();
    expect(createHarnessManager(managers).run('harness claude on devbox -b')).toBeUndefined();
    ready('/srv/ws');
    await vi.advanceTimersByTimeAsync(0);
    expect(registerRemotePty).toHaveBeenCalledWith('claude', expect.anything(), expect.objectContaining({
      browser: true,
    }));
    expect(harnessBrowserMocks().handles).toHaveLength(0);
  });

  it('sets browser false on remote spawn options without -b', async () => {
    const { managers, ready, registerRemotePty } = remoteBrowserLaunch();
    expect(createHarnessManager(managers).run('harness claude on devbox')).toBeUndefined();
    ready('/srv/ws');
    await vi.advanceTimersByTimeAsync(0);
    expect(registerRemotePty).toHaveBeenCalledWith('claude', expect.anything(), expect.objectContaining({
      browser: false,
    }));
  });
});
