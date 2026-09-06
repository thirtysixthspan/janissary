import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HarnessManager } from './manager.js';
import { HarnessScreenReader } from './screen.js';
import { HarnessRecorder } from './recorder.js';
import { writeCaptureFile } from './capture-file.js';
import { notify } from '../notifications.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

vi.mock('./capture-file.js', () => ({
  writeCaptureFile: vi.fn(() => '/project/.janissary/captures/claude-now.txt'),
}));

vi.mock('./scratch-dir.js', () => ({
  claudeTmpDir: vi.fn((cwd: string) => `${cwd}/.janissary/temp`),
  harnessEnv: vi.fn((name: string, cwd: string) => (name === 'claude'
    ? { CLAUDE_CODE_TMPDIR: `${cwd}/.janissary/temp`, DISABLE_AUTOUPDATER: '1' }
    : undefined)),
  harnessSpawnEnv: vi.fn((options: { name: string; cwd: string }) => ({
    env: options.name === 'claude'
      ? { CLAUDE_CODE_TMPDIR: `${options.cwd}/.janissary/temp`, DISABLE_AUTOUPDATER: '1' }
      : undefined,
  })),
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

// Mock the transcript tailer for the same reason as the recorder: the manager's lifecycle wiring is
// what's under test here, not the tailing itself (that lives in `transcript/tailer.test.ts`).
const tailerMock = vi.hoisted(() => ({ instances: [] as { dispose: ReturnType<typeof vi.fn>; transcriptFile: ReturnType<typeof vi.fn> }[] }));
vi.mock('./transcript/tailer.js', () => ({
  HarnessTranscriptTailer: vi.fn(function () {
    const instance = { dispose: vi.fn(), transcriptFile: vi.fn(), entriesAfter: vi.fn(() => []) };
    tailerMock.instances.push(instance);
    return instance;
  }),
}));

function makeManagers(): { managers: Managers; tabs: Tab[]; edit: ReturnType<typeof vi.fn>; scheduleSet: ReturnType<typeof vi.fn> } {
  const tabs: Tab[] = [];
  const creator = { label: 'janus', log: [] } as unknown as Tab;
  tabs.push(creator);
  const edit = vi.fn();
  const scheduleSet = vi.fn();
  const busy = new Set<string>();
  const managers = {
    tab: {
      tabs,
      cur: () => creator,
      cwdOf: () => '/project',
      setCwd: () => {},
      insertTabInGroup: (tab: Tab) => { tabs.push(tab); },
      isBusy: (label: string) => busy.has(label),
      addBusy: vi.fn((label: string) => { busy.add(label); }),
      deleteBusy: vi.fn((label: string) => { busy.delete(label); }),
      markUnread: vi.fn(),
      findIndex: () => tabs.length - 1,
      setActiveTab: vi.fn((index: number) => { managers.tab.activeTab = index; }),
      append: () => {},
      activeTab: 0,
      closeTab: vi.fn((index: number) => { tabs.splice(index, 1); }),
    },
    pty: {
      spawn: vi.fn(() => 'pty-1'),
      spawnDimensions: () => ({ cols: 80, rows: 24 }),
      input: vi.fn(),
    },
    workspace: { create: () => ({ dir: '/workspace/claude' }) },
    openFile: { edit },
    schedule: { set: scheduleSet },
  } as unknown as Managers;
  return { managers, tabs, edit, scheduleSet };
}

describe('harness capture', () => {
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
    expect(manager.run('harness capture nope')).toBe('No tab labeled "nope".');
  });

  it('errors when the tab is not a harness tab', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'plain' } as unknown as Tab);
    expect(manager.run('harness capture plain')).toBe('"plain" is not a harness tab.');
  });

  it('reports no capture for a harness-payload tab with no reader (the ssh case)', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'ssh', harness: { name: 'ssh', program: 'ssh', ptyId: 'pty-ssh', status: 'running' } } as unknown as Tab);
    expect(manager.run('harness capture ssh')).toBe('No capture available for "ssh" yet.');
  });

  it('reports no capture before the harness has produced settled output', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    expect(manager.run('harness capture claude')).toBe('No capture available for "claude" yet.');
  });

  it('writes the latest capture to a file and opens it in the editor', async () => {
    const { managers, edit } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: 'screen contents' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(manager.run('harness capture claude')).toBeUndefined();
    expect(writeCaptureFile).toHaveBeenCalledWith('claude', expect.any(Number), 'screen contents');
    expect(edit).toHaveBeenCalledWith('harness capture claude', '/project/.janissary/captures/claude-now.txt', 'janus');
  });
});

describe('harness transcript', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tailerMock.instances.length = 0;
  });

  afterEach(() => {
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('errors when no tab has the label', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness transcript nope')).toBe('No tab labeled "nope".');
  });

  it('errors when the tab is not a harness tab', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'plain' } as unknown as Tab);
    expect(manager.run('harness transcript plain')).toBe('"plain" is not a harness tab.');
  });

  it('reports no transcript for an ssh tab, which has a harness payload but no tailer', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'ssh', harness: { name: 'ssh', program: 'ssh', ptyId: 'pty-ssh', status: 'running' } } as unknown as Tab);
    expect(manager.run('harness transcript ssh')).toBe('No transcript available for "ssh" yet.');
  });

  it('reports no transcript before the tailer has written a file', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    expect(manager.run('harness transcript claude')).toBe('No transcript available for "claude" yet.');
  });

  it('opens the transcript file in the editor once one exists', () => {
    const { managers, edit } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    tailerMock.instances[0].transcriptFile.mockReturnValue('/project/.janissary/harness-transcripts/claude-now.txt');
    expect(manager.run('harness transcript claude')).toBeUndefined();
    expect(edit).toHaveBeenCalledWith(
      'harness transcript claude',
      '/project/.janissary/harness-transcripts/claude-now.txt',
      'janus',
    );
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

describe('HarnessManager transcript tailer lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tailerMock.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('creates a tailer when a harness tab spawns and exposes it by label', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    expect(tailerMock.instances).toHaveLength(1);
    expect(manager.transcriptTailer('claude')).toBe(tailerMock.instances[0]);
  });

  it('has no tailer for an ssh tab, which shares the harness-view shape but runs no harness', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'ssh', harness: { name: 'ssh', program: 'ssh', ptyId: 'pty-ssh', status: 'running' } } as unknown as Tab);
    expect(manager.transcriptTailer('ssh')).toBeUndefined();
    expect(tailerMock.instances).toHaveLength(0);
  });

  it('disposes the tailer when its PTY exits', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.run('harness claude');
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    expect(tailerMock.instances[0].dispose).toHaveBeenCalled();
    expect(manager.transcriptTailer('claude')).toBeUndefined();
  });
});

describe('HarnessManager PTY runtime lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
    tailerMock.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('disposes every resource owned by a PTY runtime when the PTY exits', () => {
    const { managers } = makeManagers();
    const readerDispose = vi.spyOn(HarnessScreenReader.prototype, 'dispose');
    const manager = new HarnessManager(managers);
    manager.run('harness claude');

    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });

    expect(readerDispose).toHaveBeenCalled();
    expect(recorderMock.instances[0].dispose).toHaveBeenCalledOnce();
    expect(tailerMock.instances[0].dispose).toHaveBeenCalledOnce();
    expect(manager.transcriptTailer('claude')).toBeUndefined();
  });
});

describe('HarnessManager disposal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
    tailerMock.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('disposes every observer, clears lookups, and ignores later PTY activity', async () => {
    const { managers } = makeManagers();
    const readerDispose = vi.spyOn(HarnessScreenReader.prototype, 'dispose');
    const manager = new HarnessManager(managers);
    manager.run('harness claude -w -y');
    vi.clearAllMocks();

    manager.dispose();
    manager.dispose();

    expect(readerDispose).toHaveBeenCalledOnce();
    expect(recorderMock.instances[0].dispose).toHaveBeenCalledOnce();
    expect(tailerMock.instances[0].dispose).toHaveBeenCalledOnce();
    expect(manager.latestScreenText('claude')).toBeUndefined();
    expect(manager.transcriptTailer('claude')).toBeUndefined();

    messageBus.emit('pty', {
      type: 'data',
      id: 'pty-1',
      data: 'Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. No\r\n\r\n Esc to cancel',
    });
    await vi.advanceTimersByTimeAsync(1001);
    expect(managers.pty.input).not.toHaveBeenCalled();
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

describe('HarnessManager.registerSshObservers', () => {
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
    manager.registerSshObservers('pty-1', 'ssh', 'ssh host');
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: 'ssh screen' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(manager.latestScreenText('ssh')?.text).toBe('ssh screen');
  });

  it('records the session, passing the label and the verbatim invocation to the recorder', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'devbox', harness: { name: 'ssh', program: 'ssh', ptyId: 'pty-1', status: 'running' } } as unknown as Tab);

    manager.registerSshObservers('pty-1', 'devbox', 'ssh -p 2222 admin@host');

    expect(recorderMock.instances).toHaveLength(1);
    expect(vi.mocked(HarnessRecorder).mock.calls[0].slice(0, 5))
      .toEqual(['pty-1', 'devbox', 'ssh -p 2222 admin@host', 80, 24]);
  });

  it('disposes both observers and drops the runtime when the ssh PTY exits', async () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'devbox', harness: { name: 'ssh', program: 'ssh', ptyId: 'pty-1', status: 'running' } } as unknown as Tab);
    manager.registerSshObservers('pty-1', 'devbox', 'ssh devbox');
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: 'ssh screen' });
    await vi.advanceTimersByTimeAsync(1001);

    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });

    expect(recorderMock.instances[0].dispose).toHaveBeenCalled();
    expect(manager.latestScreenText('devbox')).toBeUndefined();
  });

  it('creates no transcript tailer, so an ssh tab stays distinguishable from a harness tab', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    tabs.push({ label: 'devbox', harness: { name: 'ssh', program: 'ssh', ptyId: 'pty-1', status: 'running' } } as unknown as Tab);

    manager.registerSshObservers('pty-1', 'devbox', 'ssh devbox');

    expect(manager.transcriptTailer('devbox')).toBeUndefined();
  });
});

describe('HarnessManager auto-approve', () => {
  const GATE = ' Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. No\r\n\r\n Esc to cancel';
  const CODEX_GATE = ' Would you like to run the following command?\r\n\r\n   npm test\r\n\r\n › 1. Yes, proceed\r\n   2. No\r\n\r\n Press Enter to confirm · Esc to cancel';

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

  it('injects the approval keystroke and notifies when a codex overlay is detected with -y', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness codex -w -y')).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: CODEX_GATE });
    await vi.advanceTimersByTimeAsync(1001);
    expect(managers.pty.input).toHaveBeenCalledWith('pty-1', '\r');
    expect(notify).toHaveBeenCalledWith(managers, 'auto-approve', 'codex', 'Auto-approved a permission prompt', undefined);
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
    expect(manager.run('harness claude -w --no-auto-approve')).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: GATE });
    await vi.advanceTimersByTimeAsync(1001);
    expect(managers.pty.input).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith(managers, 'auto-approve', expect.anything(), expect.anything());
  });

  it('threads a profile entry\'s autoApprove into the auto-approver', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude', workspace: true, autoApprove: true }, 'claude', 2, '#fff',
    )).toBeUndefined();
    messageBus.emit('pty', { type: 'data', id: 'pty-1', data: GATE });
    await vi.advanceTimersByTimeAsync(1001);
    expect(managers.pty.input).toHaveBeenCalledWith('pty-1', '\r');
  });

  it('threads a profile entry\'s offline flag onto the tab', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.openFromProfile(
      { name: 'claude', tool: 'claude', workspace: true, offline: true }, 'claude', 2, '#fff',
    );
    expect(tabs.at(-1)?.offline).toBe(true);
  });

  it('sets tab.autoApprove to match the autoApprove argument it was opened with', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.openFromProfile(
      { name: 'claude', tool: 'claude', workspace: true, autoApprove: true }, 'claude', 2, '#fff',
    );
    expect(tabs.at(-1)?.autoApprove).toBe(true);
  });

  it('registers the workspace clone dir as the tab\'s cwd, so `files` defaults to it', () => {
    const { managers } = makeManagers();
    const setCwd = vi.fn();
    (managers.tab as unknown as { setCwd: typeof setCwd }).setCwd = setCwd;
    const manager = new HarnessManager(managers);
    manager.openFromProfile(
      { name: 'claude', tool: 'claude', workspace: true }, 'claude', 2, '#fff',
    );
    expect(setCwd).toHaveBeenCalledWith('claude', '/workspace/claude');
  });
});

describe('HarnessManager launch dialog view', () => {
  it('returns null while the dialog is closed', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.harnessLaunchView()).toBeNull();
  });

  it('returns the harness names and per-harness model catalog while open', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.openLaunchDialog();
    const view = manager.harnessLaunchView();
    expect(view).not.toBeNull();
    expect(view!.names).toEqual(['claude', 'opencode', 'codex']);
    // Every name has a (possibly empty) model list, built from the catalog.
    expect(Object.keys(view!.models)).toEqual(['claude', 'opencode', 'codex']);
    for (const name of view!.names) expect(Array.isArray(view!.models[name])).toBe(true);
  });

  it('returns null again after the dialog is closed', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    manager.openLaunchDialog();
    manager.closeLaunchDialog();
    expect(manager.harnessLaunchView()).toBeNull();
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

  it('passes a valid --model through and drops effort for opencode in the spawned command', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness opencode --no-workspace --model opencode-go/glm-5.2 --effort high')).toBeUndefined();
    expect(managers.pty.spawn).toHaveBeenCalledWith(
      'opencode', 'opencode', "opencode --model 'opencode-go/glm-5.2'",
      '/project', undefined, false, undefined,
    );
  });

  it('passes --effort through without --model when only --effort is given', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude --no-workspace --no-auto-approve --effort high')).toBeUndefined();
    expect(managers.pty.spawn).toHaveBeenCalledWith(
      'claude', 'claude', "claude --effort 'high'", '/project', undefined, false,
      { CLAUDE_CODE_TMPDIR: '/project/.janissary/temp', DISABLE_AUTOUPDATER: '1' },
    );
  });

  it('disables Claude Code autoupdates for a plain Claude launch', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude --no-workspace --no-auto-approve')).toBeUndefined();
    expect(managers.pty.spawn).toHaveBeenCalledWith(
      'claude', 'claude', 'claude', '/project', undefined, false,
      { CLAUDE_CODE_TMPDIR: '/project/.janissary/temp', DISABLE_AUTOUPDATER: '1' },
    );
  });

  it('threads a profile entry\'s effort through to the spawned command', () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude', effort: 'high', workspace: false }, 'claude', 2, '#fff',
    )).toBeUndefined();
    expect(managers.pty.spawn).toHaveBeenCalledWith(
      'claude', 'claude', "claude --effort 'high'", expect.any(String), undefined, false,
      { CLAUDE_CODE_TMPDIR: expect.any(String), DISABLE_AUTOUPDATER: '1' },
    );
  });

  it('carries the launch model and effort onto the harness payload', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness opencode --model opencode-go/glm-5.2 --effort high')).toBeUndefined();
    expect(tabs.at(-1)!.harness).toMatchObject({ model: 'opencode-go/glm-5.2', effort: 'high' });
  });

  it('leaves model and effort undefined on the payload when neither is given', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude --no-workspace --no-auto-approve')).toBeUndefined();
    const { harness } = tabs.at(-1)!;
    expect(harness!.model).toBeUndefined();
    expect(harness!.effort).toBeUndefined();
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
    expect(manager.run('harness claude --no-workspace --no-auto-approve')).toBeUndefined();
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

  it('drives opencode busy/ready from screen text, badging unread once idle (no distinct gate detection)', async () => {
    const { managers } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness opencode')).toBeUndefined();
    vi.clearAllMocks();
    await settle('⬝⬝⬝⬝■■■■');
    expect(managers.tab.addBusy).toHaveBeenCalledWith('opencode');
    await settle(`${CLEAR} △ Permission required`);
    expect(managers.tab.markUnread).not.toHaveBeenCalled();
    await settle(`${CLEAR} △ Permission required`);
    expect(managers.tab.deleteBusy).toHaveBeenCalledWith('opencode');
    expect(managers.tab.markUnread).toHaveBeenCalledWith('opencode');
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
    expect(manager.openFromProfile({ name: 'mystery', tool: 'mystery' }, 'mystery', 2, '#fff')).toBeUndefined();
    vi.clearAllMocks();
    await settle('idle-looking output');
    await settle('still idle');
    expect(managers.tab.addBusy).not.toHaveBeenCalled();
    expect(managers.tab.deleteBusy).not.toHaveBeenCalled();
  });
});

describe('HarnessManager launch with prompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
  });

  afterEach(() => {
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('sets one one-shot schedule entry carrying the prompt on the new tab', () => {
    const { managers, scheduleSet } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude with fix the failing tests')).toBeUndefined();
    expect(scheduleSet).toHaveBeenCalledTimes(1);
    expect(scheduleSet).toHaveBeenCalledWith('claude', [
      { id: 'run-1', command: 'fix the failing tests', spec: 'once', nextRun: expect.any(Number), recurring: false },
    ]);
  });

  it('sets no schedule entry when the launch has no prompt', () => {
    const { managers, scheduleSet } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude')).toBeUndefined();
    expect(scheduleSet).not.toHaveBeenCalled();
  });

  it('attaches the one-shot to the de-duplicated label', () => {
    const { managers, tabs, scheduleSet } = makeManagers();
    tabs.push({ label: 'claude' } as unknown as Tab);
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude with say hi')).toBeUndefined();
    expect(scheduleSet).toHaveBeenCalledWith('claude-2', [
      expect.objectContaining({ id: 'run-1', command: 'say hi' }),
    ]);
  });
});

// A `-w` launch whose workspace clone is still pending — asserted against directly via the
// returned `resolve`/`reject`, rather than letting `makeManagers()`'s default synchronous stub
// resolve it immediately (as every other describe block in this file relies on).
function pendingWorkspaceLaunch(): { managers: Managers; tabs: Tab[]; resolve: () => void; reject: (message: string) => void } {
  const { managers, tabs } = makeManagers();
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  (managers.workspace as unknown as { create: () => { dir: string; ready: Promise<void> } }).create =
    () => ({ dir: '/workspace/claude', ready: promise });
  return { managers, tabs, resolve, reject: (message) => reject(new Error(message)) };
}

describe('HarnessManager workspace provisioning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
  });

  afterEach(() => {
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('creates the tab immediately as a provisioning placeholder with no PTY while the clone is pending', () => {
    const { managers, tabs } = pendingWorkspaceLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w')).toBeUndefined();
    expect(tabs.at(-1)!.harness).toMatchObject({ ptyId: '', status: 'provisioning' });
    expect(managers.pty.spawn).not.toHaveBeenCalled();
  });

  it('spawns the PTY and marks the tab running once the clone resolves', async () => {
    const { managers, tabs, resolve } = pendingWorkspaceLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w')).toBeUndefined();
    resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(managers.pty.spawn).toHaveBeenCalledTimes(1);
    expect(tabs.at(-1)!.harness).toMatchObject({ ptyId: 'pty-1', status: 'running' });
  });

  it('does not spawn a PTY once the tab has been removed before the clone resolves', async () => {
    const { managers, tabs, resolve } = pendingWorkspaceLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w')).toBeUndefined();
    tabs.splice(tabs.findIndex((t) => t.label === 'claude'), 1);
    resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(managers.pty.spawn).not.toHaveBeenCalled();
  });

  it('sets provisionError and does not spawn a PTY when the clone rejects', async () => {
    const { managers, tabs, reject } = pendingWorkspaceLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w')).toBeUndefined();
    reject('no origin remote');
    await vi.advanceTimersByTimeAsync(0);
    expect(tabs.at(-1)!.harness?.provisionError).toBe('no origin remote');
    expect(managers.pty.spawn).not.toHaveBeenCalled();
  });

  it('closes the tab after the fixed delay once the clone rejects', async () => {
    const { managers, tabs, reject } = pendingWorkspaceLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w')).toBeUndefined();
    reject('boom');
    await vi.advanceTimersByTimeAsync(0);
    expect(managers.tab.closeTab).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(managers.tab.closeTab).toHaveBeenCalledTimes(1);
    expect(tabs.some((t) => t.label === 'claude')).toBe(false);
  });

  it('creates a profile-launched (`openFromProfile`) harness tab as a placeholder too', () => {
    const { managers, tabs } = pendingWorkspaceLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude', workspace: true }, 'claude', 2, '#fff',
    )).toBeUndefined();
    expect(tabs.at(-1)!.harness).toMatchObject({ ptyId: '', status: 'provisioning' });
    expect(managers.pty.spawn).not.toHaveBeenCalled();
  });

  it('spawns the PTY for a profile-launched harness tab once its clone resolves', async () => {
    const { managers, tabs, resolve } = pendingWorkspaceLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude', workspace: true }, 'claude', 2, '#fff',
    )).toBeUndefined();
    resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(managers.pty.spawn).toHaveBeenCalledTimes(1);
    expect(tabs.at(-1)!.harness).toMatchObject({ ptyId: 'pty-1', status: 'running' });
  });
});

// The tab-creation options travel as one object, so each of these pins a field that shares a type
// with its neighbour — the pairs a positional argument list could once have transposed silently.
describe('HarnessManager spawn options', () => {
  it('defaults omitted profile booleans to workspace and supported auto-approve', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude' }, 'claude', 2, '#fff',
    )).toBeUndefined();
    expect(tabs.at(-1)).toMatchObject({ workspaceDir: '/workspace/claude', autoApprove: true });
  });

  it('preserves explicit false profile booleans', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude', workspace: false, autoApprove: false }, 'claude', 2, '#fff',
    )).toBeUndefined();
    expect(tabs.at(-1)).toMatchObject({ workspaceDir: undefined, autoApprove: false });
  });

  it('keeps offline and autoApprove apart when only offline is given', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w --offline --no-auto-approve')).toBeUndefined();
    expect(tabs.at(-1)).toMatchObject({ offline: true, autoApprove: false });
  });

  it('keeps offline and autoApprove apart when only autoApprove is given', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude -w -y')).toBeUndefined();
    expect(tabs.at(-1)).toMatchObject({ offline: false, autoApprove: true });
  });

  it('does not swap a profile entry\'s model and effort', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude', model: 'opus', effort: 'high' }, 'claude', 2, '#fff',
    )).toBeUndefined();
    expect(tabs.at(-1)!.harness).toMatchObject({ model: 'opus', effort: 'high' });
  });

  it('lands a profile launch\'s group, group color, and dot color on their own tab fields', () => {
    const { managers, tabs } = makeManagers();
    const manager = new HarnessManager(managers);
    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude', dotColor: '#abcdef' }, 'claude', 7, '#123456',
    )).toBeUndefined();
    expect(tabs.at(-1)).toMatchObject({ group: 7, groupColor: '#123456', dotColor: '#abcdef' });
  });
});

// A remote launch: no local clone is created at all, the tab opens immediately attached to the ssh
// session's PTY (so ssh's own prompts are answerable in it), and the harness process is registered
// as a remote `PtySession` once the far side reports its workspace ready.
type RemoteHandlers = {
  onReady: (dir: string, notice?: string) => void;
  onFailed: (message: string) => void;
  onClosed: () => void;
};

function remoteLaunch(): {
  managers: Managers; tabs: Tab[]; append: ReturnType<typeof vi.fn>;
  createWorkspace: ReturnType<typeof vi.fn>; registerRemotePty: ReturnType<typeof vi.fn>;
  ready: (dir: string, notice?: string) => void; fail: (message: string) => void; drop: () => void;
} {
  const { managers, tabs } = makeManagers();
  const channel = { ptyId: 'ssh-pty-1', attached: true, send: vi.fn() };
  let handlers: RemoteHandlers | undefined;
  const createWorkspace = vi.fn(() => ({ dir: '/workspace/claude', ready: Promise.resolve() }));
  const registerRemotePty = vi.fn(() => 'rpty1');
  const append = vi.fn();
  (managers.workspace as unknown as { create: unknown }).create = createWorkspace;
  (managers.pty as unknown as { registerRemotePty: unknown }).registerRemotePty = registerRemotePty;
  (managers.tab as unknown as { append: unknown }).append = append;
  (managers as unknown as { remote: unknown }).remote = {
    open: vi.fn((_label: string, _address: unknown, _cwd: string, h: RemoteHandlers) => { handlers = h; return channel; }),
    get: vi.fn(() => channel),
    transcriptSource: vi.fn(() => ({ poll: () => [], resolved: () => false })),
  };
  return {
    managers, tabs, append, createWorkspace, registerRemotePty,
    ready: (dir, notice) => handlers!.onReady(dir, notice),
    fail: (message) => handlers!.onFailed(message),
    drop: () => handlers!.onClosed(),
  };
}

describe('HarnessManager remote launch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recorderMock.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('inserts a provisioning placeholder immediately, with no local workspace created', () => {
    const { managers, tabs, createWorkspace } = remoteLaunch();
    const manager = new HarnessManager(managers);

    expect(manager.run('harness claude on admin@devbox:/srv/proj')).toBeUndefined();

    expect(createWorkspace).not.toHaveBeenCalled();
    expect(managers.pty.spawn).not.toHaveBeenCalled();
    expect(tabs.at(-1)!.harness).toMatchObject({ status: 'provisioning', ptyId: 'ssh-pty-1' });
  });

  it('marks the tab remote and leaves workspaceDir unset, so nothing local is ever deleted', () => {
    const { managers, tabs } = remoteLaunch();
    const manager = new HarnessManager(managers);

    expect(manager.run('harness claude on admin@devbox:/srv/proj')).toBeUndefined();

    expect(tabs.at(-1)).toMatchObject({
      remote: { address: 'admin@devbox:/srv/proj', host: 'devbox' },
      workspaceDir: undefined,
    });
  });

  it('promotes the tab to running with a remote PtySession once the workspace is ready', async () => {
    const { managers, tabs, ready, registerRemotePty } = remoteLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude on devbox')).toBeUndefined();

    ready('/srv/proj/.janissary/workspace/claude');
    await vi.advanceTimersByTimeAsync(0);

    expect(registerRemotePty).toHaveBeenCalledWith('claude', expect.anything(), expect.objectContaining({
      program: 'claude', harness: 'claude',
    }));
    expect(managers.pty.spawn).not.toHaveBeenCalled();
    expect(tabs.at(-1)!.harness).toMatchObject({ ptyId: 'rpty1', status: 'running' });
  });

  it('shows the remote host\'s own isolation notice rather than this machine\'s', async () => {
    const { managers, ready, append } = remoteLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude on devbox')).toBeUndefined();

    ready('/srv/ws', 'workspace isolation off: sandbox-exec unavailable');
    await vi.advanceTimersByTimeAsync(0);

    expect(append).toHaveBeenCalledWith('claude', {
      input: '', output: 'workspace isolation off: sandbox-exec unavailable',
    });
  });

  it('appends nothing when the remote reports no notice', async () => {
    const { managers, ready, append } = remoteLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude on devbox')).toBeUndefined();

    ready('/srv/ws');
    await vi.advanceTimersByTimeAsync(0);

    expect(append).not.toHaveBeenCalled();
  });

  it('sets provisionError and closes the tab after the existing delay when provisioning fails', async () => {
    const { managers, tabs, fail } = remoteLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude on devbox')).toBeUndefined();

    fail('/srv/proj is not a git repository.');
    await vi.advanceTimersByTimeAsync(0);
    expect(tabs.at(-1)!.harness?.provisionError).toBe('/srv/proj is not a git repository.');
    expect(managers.tab.closeTab).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(managers.tab.closeTab).toHaveBeenCalledTimes(1);
  });

  it('closes the tab when the channel drops before the workspace is ready', async () => {
    const { managers, tabs, drop } = remoteLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude on devbox')).toBeUndefined();

    drop();
    await vi.advanceTimersByTimeAsync(0);
    expect(tabs.at(-1)!.harness?.provisionError).toContain('devbox');

    await vi.advanceTimersByTimeAsync(3000);
    expect(managers.tab.closeTab).toHaveBeenCalledTimes(1);
  });

  it('closes the tab when the channel drops after the harness is running', async () => {
    const { managers, ready, drop } = remoteLaunch();
    const manager = new HarnessManager(managers);
    expect(manager.run('harness claude on devbox')).toBeUndefined();
    ready('/srv/ws');
    await vi.advanceTimersByTimeAsync(0);

    drop();

    expect(managers.tab.closeTab).toHaveBeenCalledTimes(1);
  });

  it('opens a profile entry\'s remote tab against the same host', () => {
    const { managers, tabs, createWorkspace } = remoteLaunch();
    const manager = new HarnessManager(managers);

    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude', workspace: true, remote: 'admin@devbox:/srv/proj' }, 'claude', 2, '#fff',
    )).toBeUndefined();

    expect(createWorkspace).not.toHaveBeenCalled();
    expect(tabs.at(-1)).toMatchObject({ remote: { host: 'devbox' }, workspaceDir: undefined });
  });

  it('reports and skips a profile entry whose remote address is unusable', () => {
    const { managers } = remoteLaunch();
    const manager = new HarnessManager(managers);

    expect(manager.openFromProfile(
      { name: 'claude', tool: 'claude', remote: 'devbox;id' }, 'claude', 2, '#fff',
    )).toContain('devbox;id');
  });

});
