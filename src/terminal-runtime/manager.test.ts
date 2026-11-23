import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import type { HarnessRuntime } from '../harness/runtime.js';
import { TerminalRuntimeManager } from './manager.js';
import * as config from '../config.js';

const RECORDING = '/project/.janissary/recordings/shell.cast';

describe('TerminalRuntimeManager', () => {
  let manager: TerminalRuntimeManager;

  afterEach(() => {
    manager?.dispose();
    messageBus.clear();
    vi.restoreAllMocks();
  });

  it('finds a live shell recording through the shell tab terminal id', () => {
    const managers = {
      tab: { tabs: [{ label: 'shell', view: 'plugin' }] },
      pty: { terminalIdFor: vi.fn(() => 'pty-shell') },
    } as unknown as Managers;
    manager = new TerminalRuntimeManager(managers);
    manager.install('pty-shell', 'shell', {
      recorder: { recordingPath: () => RECORDING },
      dispose: vi.fn(),
    } as unknown as HarnessRuntime);

    expect(manager.liveRecordingPathOf('shell')).toBe(RECORDING);
    expect(managers.pty.terminalIdFor).toHaveBeenCalledWith('shell');
  });

  it('installs no shell runtime and marks the tab not recording when logEnabled is false', () => {
    vi.spyOn(config, 'getConfig').mockReturnValue({ ...config.getConfig(), logEnabled: false });
    const tab: { label: string; recordingOff?: true } = { label: 'shell' };
    const managers = {
      tab: { byLabel: vi.fn(() => tab) },
      pty: { spawnDimensions: () => ({ cols: 80, rows: 24 }) },
    } as unknown as Managers;
    manager = new TerminalRuntimeManager(managers);

    manager.registerShellObservers('pty-shell', 'shell');

    expect(manager.get('pty-shell')).toBeUndefined();
    expect(tab.recordingOff).toBe(true);
  });

  it('installs a shell runtime when logEnabled is true', () => {
    vi.spyOn(config, 'getConfig').mockReturnValue({ ...config.getConfig(), logEnabled: true });
    const tab: { label: string; recordingOff?: true } = { label: 'shell' };
    const managers = {
      tab: { byLabel: vi.fn(() => tab) },
      pty: { spawnDimensions: () => ({ cols: 80, rows: 24 }) },
    } as unknown as Managers;
    manager = new TerminalRuntimeManager(managers);

    manager.registerShellObservers('pty-shell', 'shell');

    expect(manager.get('pty-shell')?.recorder).toBeDefined();
    expect(tab.recordingOff).toBeUndefined();
  });

  it('forwards terminal colors to the runtime recorder', () => {
    const setColors = vi.fn();
    manager = new TerminalRuntimeManager({} as Managers);
    manager.install('pty-shell', 'shell', {
      recorder: { setColors },
      dispose: vi.fn(),
    } as unknown as HarnessRuntime);
    const colors = { fg: '#fff', bg: '#000' };

    manager.reportTerminalColors('pty-shell', colors);

    expect(setColors).toHaveBeenCalledWith(colors);
  });

  it('releases a runtime only after PTY exit listeners have run', async () => {
    manager = new TerminalRuntimeManager({} as Managers);
    const dispose = vi.fn();
    manager.install('pty-shell', 'shell', { dispose } as unknown as HarnessRuntime);
    const observeExit = vi.fn(() => { expect(dispose).not.toHaveBeenCalled(); });
    const subscription = messageBus.on('pty', 'exit', observeExit);

    try {
      messageBus.emit('pty', { type: 'exit', id: 'pty-shell', exitCode: 0 });
      expect(observeExit).toHaveBeenCalledOnce();
      expect(dispose).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      subscription.unsubscribe();
    }
  });
});
