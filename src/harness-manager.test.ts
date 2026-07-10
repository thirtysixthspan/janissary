import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HarnessManager } from './harness-manager.js';
import { writeCaptureFile } from './harness-capture-file.js';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';
import type { Tab } from './types.js';

vi.mock('./harness-capture-file.js', () => ({
  writeCaptureFile: vi.fn(() => '/project/.janissary/captures/claude-now.txt'),
}));

function makeManagers(): { managers: Managers; tabs: Tab[]; edit: ReturnType<typeof vi.fn> } {
  const tabs: Tab[] = [];
  const creator = { label: 'janus', log: [] } as unknown as Tab;
  tabs.push(creator);
  const edit = vi.fn();
  const managers = {
    tab: {
      tabs,
      cur: () => creator,
      cwdOf: () => '/project',
      insertTabInGroup: (tab: Tab) => { tabs.push(tab); },
      addBusy: () => {},
      findIndex: () => tabs.length - 1,
      append: () => {},
      activeTab: 0,
    },
    pty: {
      spawn: () => 'pty-1',
      spawnDimensions: () => ({ cols: 80, rows: 24 }),
    },
    openFile: { edit },
  } as unknown as Managers;
  return { managers, tabs, edit };
}

describe('HarnessManager.capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('errors when no tab has the label', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.capture('harness capture nope', 'nope')).toBe('No tab labeled "nope".');
  });

  it('errors when the tab is not a harness tab', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'plain' } as unknown as Tab);
    expect(manager.capture('harness capture plain', 'plain')).toBe('"plain" is not a harness tab.');
  });

  it('reports no capture for a harness-payload tab with no reader (the ssh case)', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'ssh', harness: { name: 'ssh', program: 'ssh', ptyId: 'pty-ssh', status: 'running' } } as unknown as Tab);
    expect(manager.capture('harness capture ssh', 'ssh')).toBe('No capture available for "ssh" yet.');
  });

  it('reports no capture before the harness has produced settled output', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    expect(manager.capture('harness capture claude', 'claude')).toBe('No capture available for "claude" yet.');
  });

  it('writes the latest capture to a file and opens it in the editor', async () => {
    const { managers, edit } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: 'screen contents' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(manager.capture('harness capture claude', 'claude')).toBeUndefined();
    expect(writeCaptureFile).toHaveBeenCalledWith('claude', expect.any(Number), 'screen contents');
    expect(edit).toHaveBeenCalledWith('harness capture claude', '/project/.janissary/captures/claude-now.txt', 'janus');
  });
});
