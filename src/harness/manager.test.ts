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

vi.mock('./scratch-dir.js', () => ({
  claudeTmpDir: vi.fn((cwd: string) => `${cwd}/.janissary/temp`),
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
      addBusy: vi.fn(),
      deleteBusy: vi.fn(),
      markUnread: vi.fn(),
      findIndex: () => tabs.length - 1,
      append: () => {},
      activeTab: 0,
    },
    pty: {
      spawn: vi.fn(() => 'pty-1'),
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

describe('HarnessManager.registerScreenReader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
  });

  afterEach(() => {
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('lets latestScreenText read a PTY not spawned via run/spawnTab (the ssh case)', async () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'ssh', harness: { name: 'ssh', program: 'ssh', ptyId: 'pty-1', status: 'running' } } as unknown as Tab);
    manager.registerScreenReader('pty-1');
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: 'ssh screen' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(manager.latestScreenText('ssh')?.text).toBe('ssh screen');
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
    expect(notify).toHaveBeenCalledWith(managers, 'auto-approve', 'claude', 'Auto-approved a permission prompt', undefined);
  });

  it('writes a capture file and links it on the notification when the notifications tab is open', async () => {
    const { managers, tabs } = makeManagers();
    tabs.push({ label: 'notifications', view: 'notifications' } as unknown as Tab);
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w -y')).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: GATE });
    await vi.advanceTimersByTimeAsync(1001);
    expect(writeCaptureFile).toHaveBeenCalledWith('claude', expect.any(Number), expect.any(String));
    expect(notify).toHaveBeenCalledWith(
      managers, 'auto-approve', 'claude', 'Auto-approved a permission prompt',
      '/project/.janissary/captures/claude-now.txt',
    );
  });

  it('writes no capture file when the notifications tab is closed', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w -y')).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: GATE });
    await vi.advanceTimersByTimeAsync(1001);
    expect(writeCaptureFile).not.toHaveBeenCalled();
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

describe('HarnessManager model/effort', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
  });

  afterEach(() => {
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('rejects an unknown --model for a harness with a populated catalog before spawning', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness opencode --model not-a-real-model')).toBe(
      'Unknown model "not-a-real-model" for harness "opencode" — add it to harness-models.json.',
    );
    expect(managers.pty.spawn).not.toHaveBeenCalled();
  });

  it('passes a valid --model and --effort through to the spawned command', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness opencode --model opencode-go/glm-5.2 --effort high')).toBeUndefined();
    expect(managers.pty.spawn).toHaveBeenCalledWith(
      'opencode', 'opencode', "opencode --model 'opencode-go/glm-5.2' --effort 'high'",
      '/project', undefined, false, undefined,
    );
  });

  it('passes --effort through without --model when only --effort is given', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude --effort high')).toBeUndefined();
    expect(managers.pty.spawn).toHaveBeenCalledWith(
      'claude', 'claude', "claude --effort 'high'", '/project', undefined, false,
      { CLAUDE_CODE_TMPDIR: '/project/.janissary/temp' },
    );
  });

  it('threads a profile entry\'s effort through to the spawned command', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { label: 'claude', harness: 'claude', effort: 'high' }, 'claude', 2, '#fff',
    )).toBeUndefined();
    expect(managers.pty.spawn).toHaveBeenCalledWith(
      'claude', 'claude', "claude --effort 'high'", expect.any(String), undefined, false,
      { CLAUDE_CODE_TMPDIR: expect.any(String) },
    );
  });
});

describe('HarnessManager busy/ready status', () => {
  const CLAUDE_BUSY = '\u{1B}]0;⠂ Write a haiku\u{7}';
  const CLAUDE_READY = '\u{1B}]0;✳ Claude Code\u{7}';
  const CLEAR = '\u{1B}[2J\u{1B}[H';
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

  // Emit PTY data and advance past the reader's 1s capture delay so the capture fires.
  async function settle(data: string): Promise<void> {
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data });
    await vi.advanceTimersByTimeAsync(1001);
  }

  it('tracks claude busy/ready from the title with no -y, debouncing the ready transition', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    vi.clearAllMocks();
    await settle(`${CLAUDE_BUSY}thinking`);
    expect(managers.tab.addBusy).toHaveBeenCalledWith('claude');
    await settle(CLAUDE_READY);
    expect(managers.tab.deleteBusy).not.toHaveBeenCalled();
    await settle(CLAUDE_READY);
    expect(managers.tab.deleteBusy).toHaveBeenCalledWith('claude');
    await settle(`${CLAUDE_BUSY}more work`);
    expect(managers.tab.addBusy).toHaveBeenCalledTimes(2);
  });

  it('clears busy and marks unread when a gate shows without auto-approve', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    vi.clearAllMocks();
    await settle(GATE);
    expect(managers.tab.deleteBusy).toHaveBeenCalledWith('claude');
    expect(managers.tab.markUnread).toHaveBeenCalledWith('claude');
  });

  it('with -y, badges the tab only once auto-approve stands down on a stuck gate', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w -y')).toBeUndefined();
    vi.clearAllMocks();
    await settle(CLEAR + GATE);
    expect(managers.pty.input).toHaveBeenCalledWith('pty-1', '\r');
    expect(managers.tab.deleteBusy).toHaveBeenCalledWith('claude');
    expect(managers.tab.markUnread).not.toHaveBeenCalled();
    await settle(CLEAR + GATE);
    expect(managers.tab.markUnread).toHaveBeenCalledWith('claude');
  });

  it('drives opencode busy/ready from screen text, with no badge on its permission prompt', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness opencode')).toBeUndefined();
    vi.clearAllMocks();
    await settle('⬝⬝⬝⬝■■■■');
    expect(managers.tab.addBusy).toHaveBeenCalledWith('opencode');
    await settle(`${CLEAR} △ Permission required`);
    await settle(`${CLEAR} △ Permission required`);
    expect(managers.tab.deleteBusy).toHaveBeenCalledWith('opencode');
    expect(managers.tab.markUnread).not.toHaveBeenCalled();
  });

  it('drives codex busy/ready from its spinner-led title with no -y', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness codex')).toBeUndefined();
    vi.clearAllMocks();
    await settle('\u{1B}]0;⠹ scratchpad\u{7}working');
    expect(managers.tab.addBusy).toHaveBeenCalledWith('codex');
    await settle('\u{1B}]0;scratchpad\u{7}');
    await settle('\u{1B}]0;scratchpad\u{7}');
    expect(managers.tab.deleteBusy).toHaveBeenCalledWith('codex');
  });

  it('builds no busy/ready callback for a harness with no detector, leaving busy set', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile({ label: 'mystery', harness: 'mystery' }, 'mystery', 2, '#fff')).toBeUndefined();
    vi.clearAllMocks();
    await settle('idle-looking output');
    await settle('still idle');
    expect(managers.tab.addBusy).not.toHaveBeenCalled();
    expect(managers.tab.deleteBusy).not.toHaveBeenCalled();
  });
});
