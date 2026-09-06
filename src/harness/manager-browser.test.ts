import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageBus } from '../bus.js';
import {
  browserNotificationMock, createHarnessManager, harnessBrowserMocks, makeBrowserManagers,
  resetHarnessBrowserFixture,
} from './manager-browser-test-fixture.js';

const browserMock = harnessBrowserMocks();
const notify = browserNotificationMock();

describe('HarnessManager e2e browser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHarnessBrowserFixture();
  });

  afterEach(() => {
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reaches the PTY spawn with only the guarded environment for a -b launch', () => {
    const { managers } = makeBrowserManagers();
    const manager = createHarnessManager(managers);
    expect(manager.run('harness claude --no-workspace --no-auto-approve -b')).toBeUndefined();
    expect(managers.pty.spawn).toHaveBeenCalledWith(
      'claude', 'claude', 'claude', '/project', undefined, false,
      {
        CLAUDE_CODE_TMPDIR: '/project/.janissary/temp',
        DISABLE_AUTOUPDATER: '1',
        JANISSARY_BROWSER_WS_ENDPOINT: 'ws://127.0.0.1:50000/tok',
        JANISSARY_PLAYWRIGHT: '/pw/index.js',
      },
    );
  });

  it('sets neither browser variable without -b', () => {
    const { managers } = makeBrowserManagers();
    const manager = createHarnessManager(managers);
    expect(manager.run('harness claude --no-workspace --no-auto-approve')).toBeUndefined();
    const spawnArgs = (managers.pty.spawn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(spawnArgs[6]).toEqual({ CLAUDE_CODE_TMPDIR: '/project/.janissary/temp', DISABLE_AUTOUPDATER: '1' });
    expect(browserMock.handles).toHaveLength(0);
  });

  it('records the flag on the tab so profile save can read it back', () => {
    const { managers, tabs } = makeBrowserManagers();
    expect(createHarnessManager(managers).run('harness claude --no-workspace -b')).toBeUndefined();
    expect(tabs.at(-1)).toMatchObject({ browser: true });
  });

  it('closes the browser when the runtime is disposed on PTY exit', () => {
    const { managers } = makeBrowserManagers();
    const manager = createHarnessManager(managers);
    expect(manager.run('harness claude --no-workspace -b')).toBeUndefined();
    expect(browserMock.handles).toHaveLength(1);
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    expect(browserMock.handles[0].close).toHaveBeenCalledTimes(1);
  });

  it('does not close the browser twice when disposed again', () => {
    const { managers } = makeBrowserManagers();
    const manager = createHarnessManager(managers);
    expect(manager.run('harness claude --no-workspace -b')).toBeUndefined();
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    manager.dispose();
    expect(browserMock.handles[0].close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser on manager shutdown without a PTY exit', () => {
    const { managers } = makeBrowserManagers();
    const manager = createHarnessManager(managers);
    expect(manager.run('harness claude --no-workspace -b')).toBeUndefined();
    manager.dispose();
    expect(browserMock.handles[0].close).toHaveBeenCalledTimes(1);
  });

  it('notifies against the tab when the browser reports it is gone', () => {
    const { managers } = makeBrowserManagers();
    const manager = createHarnessManager(managers);
    expect(manager.run('harness claude --no-workspace -b')).toBeUndefined();
    browserMock.onGone[0]('e2e browser exited');
    expect(notify).toHaveBeenCalledWith(managers, 'e2e-browser-gone', 'claude', 'e2e browser exited');
  });

  it('closes the browser when PTY spawn throws before runtime ownership', () => {
    const { managers } = makeBrowserManagers();
    (managers.pty.spawn as unknown as { mockImplementation: (callback: () => never) => void })
      .mockImplementation(() => { throw new Error('pty refused'); });
    const manager = createHarnessManager(managers);
    expect(() => manager.run('harness claude --no-workspace -b')).toThrow('pty refused');
    expect(browserMock.handles).toHaveLength(1);
    expect(browserMock.handles[0].close).toHaveBeenCalledTimes(1);
  });

  it('leaves the browser open when PTY spawn succeeds', () => {
    const { managers } = makeBrowserManagers();
    const manager = createHarnessManager(managers);
    expect(manager.run('harness claude --no-workspace -b')).toBeUndefined();
    expect(browserMock.handles[0].close).not.toHaveBeenCalled();
  });
});
