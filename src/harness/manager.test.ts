import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HarnessManager } from './manager.js';
import { writeCaptureFile } from './capture-file.js';
import { notify } from '../notifications.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../types.js';

vi.mock('./capture-file.js', () => ({
  writeCaptureFile: vi.fn(() => '/project/.janissary/captures/claude-now.txt'),
}));

vi.mock('../notifications.js', () => ({ notify: vi.fn() }));

// Mock the recorder so the manager's lifecycle wiring can be asserted without touching the
// filesystem; each construction records a disposable stub.
const recorderMock = vi.hoisted(() => ({ instances: [] as { dispose: ReturnType<typeof vi.fn> }[] }));
vi.mock('./recorder.js', () => ({
  HarnessRecorder: vi.fn(function () {
    const instance = { dispose: vi.fn() };
    recorderMock.instances.push(instance);
    return instance;
  }),
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
      setCwd: () => {},
      insertTabInGroup: (tab: Tab) => { tabs.push(tab); },
      addBusy: () => {},
      findIndex: () => tabs.length - 1,
      append: () => {},
      activeTab: 0,
    },
    pty: {
      spawn: () => 'pty-1',
      spawnDimensions: () => ({ cols: 80, rows: 24 }),
      input: vi.fn(),
    },
    workspace: { create: () => ({ dir: '/workspace/claude' }) },
    openFile: { edit },
  } as unknown as Managers;
  return { managers, tabs, edit };
}

describe('HarnessManager.capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
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

describe('HarnessManager recorder lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('creates a recorder when a harness tab spawns', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    expect(recorderMock.instances).toHaveLength(1);
  });

  it('disposes the recorder when its PTY exits', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.run('harness claude');
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    expect(recorderMock.instances[0].dispose).toHaveBeenCalled();
  });
});

describe('HarnessManager.latestScreenText', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
  });

  afterEach(() => {
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns undefined for a missing tab', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.latestScreenText('nope')).toBeUndefined();
  });

  it('returns undefined for a non-harness tab', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.latestScreenText('janus')).toBeUndefined();
  });

  it('returns undefined for a harness tab with no capture yet', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.run('harness claude');
    expect(manager.latestScreenText('claude')).toBeUndefined();
  });

  it('returns the reader\'s latest capture once the harness has produced settled output', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.run('harness claude');
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: 'on screen' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(manager.latestScreenText('claude')?.text).toBe('on screen');
  });
});

describe('HarnessManager auto-approve', () => {
  const GATE = ' Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. No\r\n\r\n Esc to cancel';

  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
  });

  afterEach(() => {
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('injects the approval keystroke and notifies when a gate is detected with -y', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w -y')).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: GATE });
    await vi.advanceTimersByTimeAsync(1001);
    expect(managers.pty.input).toHaveBeenCalledWith('pty-1', '\r');
    expect(notify).toHaveBeenCalledWith(managers, 'auto-approve', 'claude', 'Auto-approved a permission prompt');
  });

  it('never injects into a gate when -y is not given', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w')).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: GATE });
    await vi.advanceTimersByTimeAsync(1001);
    expect(managers.pty.input).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith(managers, 'auto-approve', expect.anything(), expect.anything());
  });

  it('threads a profile entry\'s autoApprove into the auto-approver', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { label: 'claude', harness: 'claude', workspace: true, autoApprove: true }, 'claude', 2, '#fff',
    )).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: GATE });
    await vi.advanceTimersByTimeAsync(1001);
    expect(managers.pty.input).toHaveBeenCalledWith('pty-1', '\r');
  });

  it('threads a profile entry\'s offline flag onto the tab', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.openFromProfile(
      { label: 'claude', harness: 'claude', workspace: true, offline: true }, 'claude', 2, '#fff',
    );
    expect(tabs.at(-1)?.offline).toBe(true);
  });

  it('sets tab.autoApprove to match the autoApprove argument it was opened with', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.openFromProfile(
      { label: 'claude', harness: 'claude', workspace: true, autoApprove: true }, 'claude', 2, '#fff',
    );
    expect(tabs.at(-1)?.autoApprove).toBe(true);
  });

  it('registers the workspace clone dir as the tab\'s cwd, so `files` defaults to it', () => {
    const { managers } = makeManagers();
    const setCwd = vi.fn();
    (managers.tab as unknown as { setCwd: typeof setCwd }).setCwd = setCwd;
    const manager = new HarnessManager(managers);
    manager.openFromProfile(
      { label: 'claude', harness: 'claude', workspace: true }, 'claude', 2, '#fff',
    );
    expect(setCwd).toHaveBeenCalledWith('claude', '/workspace/claude');
  });
});
