import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { TabManager } from '../tab/manager.js';
import { ShellManager } from './manager.js';
import { loadConfig } from '../config.js';
import { messageBus, type BusEvent, type Subscription } from '../bus.js';
import { makeTab } from '../tab/index.js';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';

const executeShellCmdMock = vi.fn();
const queryShellPwdMock = vi.fn();
const spawnShellMock = vi.fn();
const spawnTransportMock = vi.fn();
const createRemoteShellMock = vi.fn();

vi.mock('../remote/shell-session.js', () => ({
  createRemoteShell: (...args: unknown[]) => createRemoteShellMock(...args),
}));

vi.mock('./index.js', () => ({
  spawnShell: (...args: unknown[]) => spawnShellMock(...args),
  executeShellCmd: (...args: unknown[]) => executeShellCmdMock(...args),
  queryShellPwd: (...args: unknown[]) => queryShellPwdMock(...args),
}));

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  seedRootTab(managers.tab);
  managers.pty = {
    spawnTransport: spawnTransportMock,
  } as unknown as Managers['pty'];
  managers.schedule = { get: vi.fn() } as unknown as Managers['schedule'];
  return managers;
}

// Feed a command's streamed output to whatever `run` registered, then complete it.
function streamOutput(chunks: string[]): void {
  const onProgress = executeShellCmdMock.mock.calls.at(-1)?.[3] as (buffer: string) => void;
  let buffer = '';
  for (const chunk of chunks) { buffer += chunk; onProgress(buffer); }
}

function completeCommand(result: string): void {
  const onComplete = executeShellCmdMock.mock.calls.at(-1)?.[4] as (result: string) => void;
  onComplete(result);
}

// The restored sink the manager handed the adopted remote shell: where a replayed session's output
// and retained history land.

function resetShellMocks(): void {
  executeShellCmdMock.mockReset();
  queryShellPwdMock.mockReset();
  spawnShellMock.mockReset().mockReturnValue({ stdin: { writable: true, write: vi.fn() } });
  createRemoteShellMock.mockReset().mockReturnValue({ stdin: { writable: true, write: vi.fn() } });
  spawnTransportMock.mockReset().mockImplementation(() => ({
    id: 'pty1', program: 'bash', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
  }));
}

describe('ShellManager — serializes shell interactions', () => {
  beforeEach(() => {
    resetShellMocks();
  });

  it('does not start the next queued command until the previous command\'s pwd query resolves', async () => {
    const managers = makeManagers();
    const shellManager = new ShellManager(managers);

    shellManager.run('janus', 'cmd1');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    // cmd1 completes; this fires its trailing pwd query, which is left unresolved.
    const onComplete1 = executeShellCmdMock.mock.calls[0][4] as (result: string) => void;
    onComplete1('cmd1 output');
    await vi.waitFor(() => { expect(queryShellPwdMock).toHaveBeenCalledTimes(1); });

    // Queue cmd2 while cmd1's pwd query is still in flight — it must not start yet, or its
    // listener would be live on the same shell stream as cmd1's still-pending pwd query.
    shellManager.run('janus', 'cmd2');
    expect(executeShellCmdMock).toHaveBeenCalledTimes(1);

    // Resolve cmd1's pwd query — only now should cmd2 actually start.
    const onPwdResult1 = queryShellPwdMock.mock.calls[0][2] as (pwd: string) => void;
    onPwdResult1('/some/dir');

    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(2); });
    expect(executeShellCmdMock.mock.calls[1][1]).toBe('cmd2');
  });
});

describe('ShellManager — which shell a tab gets', () => {
  let tmpDir: string;

  beforeEach(() => {
    resetShellMocks();
    tmpDir = mkdtempSync(path.join(tmpdir(), 'shell-select-'));
    mkdirSync(path.join(tmpDir, '.janissary'), { recursive: true });
    loadConfig(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs a local tab in a piped shell when detection is off', async () => {
    writeFileSync(path.join(tmpDir, '.janissary', 'config.json'), JSON.stringify({ interactiveShellDetection: false }));
    loadConfig(tmpDir);

    const managers = makeManagers();
    new ShellManager(managers).run('janus', 'ls');

    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    expect(spawnShellMock).toHaveBeenCalledTimes(1);
    expect(spawnTransportMock).not.toHaveBeenCalled();
  });

  it('cds a piped shell into the project directory when the tab\'s cwd is not a directory', async () => {
    writeFileSync(path.join(tmpDir, '.janissary', 'config.json'), JSON.stringify({ interactiveShellDetection: false }));
    loadConfig(tmpDir);
    const managers = makeManagers();
    managers.tab = new TabManager(managers, tmpDir);
    seedRootTab(managers.tab);
    managers.tab.setCwd('janus', path.join(tmpDir, 'missing'));
    new ShellManager(managers).run('janus', 'ls');

    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    const shell = spawnShellMock.mock.results[0].value as { stdin: { write: ReturnType<typeof vi.fn> } };
    expect(shell.stdin.write).toHaveBeenCalledExactlyOnceWith(`cd "${tmpDir}"\n`);
  });

  it('leaves a remote tab on its channel shell whatever the setting says', async () => {
    const managers = makeManagers();
    managers.remote = { get: () => ({}) } as unknown as Managers['remote'];
    managers.tab.cur().remote = 'host';

    new ShellManager(managers).run(managers.tab.cur().label, 'ls');

    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    expect(createRemoteShellMock).toHaveBeenCalledTimes(1);
    expect(spawnTransportMock).not.toHaveBeenCalled();
  });
});

// A shell command's entry is started and finished by the same transcript choreography every other
// long-running command uses, so the bus sees one start event and one trailing output event.
describe('ShellManager — transcript events', () => {
  let tmpDir: string;
  let managers: Managers;
  let shellManager: ShellManager;
  let subscription: Subscription;
  const events: BusEvent[] = [];
  const label = 'janus';

  const appended = (): BusEvent[] => events.filter((event) => event.type === 'entry:appended');
  const tab = (name = label): Tab => managers.tab.tabs.find((t) => t.label === name)!;

  beforeEach(() => {
    resetShellMocks();
    events.length = 0;
    tmpDir = mkdtempSync(path.join(tmpdir(), 'shell-events-'));
    mkdirSync(path.join(tmpDir, '.janissary'), { recursive: true });
    loadConfig(tmpDir);
    subscription = messageBus.on('transcript', ['entry:appended', 'entries:trimmed'], (event) => { events.push(event); });
    managers = makeManagers();
    managers.tab.setCwd(label, '/work');
    shellManager = new ShellManager(managers);
  });

  afterEach(() => {
    subscription.unsubscribe();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits one start event carrying the cwd and one trailing output event', async () => {
    shellManager.run(label, 'ls');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    expect(appended()).toEqual([
      expect.objectContaining({ tabLabel: label, entry: { input: 'ls', output: '', running: true, cwd: '/work' } }),
    ]);

    streamOutput(['file-a\n']);
    completeCommand('file-a');

    expect(appended()).toEqual([
      expect.objectContaining({ entry: { input: 'ls', output: '', running: true, cwd: '/work' } }),
      expect.objectContaining({ tabLabel: label, entry: { input: '', output: 'file-a' } }),
    ]);
    expect(tab().log.at(-1)).toEqual({ input: 'ls', output: 'file-a', running: false, cwd: '/work' });
    expect(managers.tab.isBusy(label)).toBe(false);
  });

  it('returns a scrolled-up transcript to the bottom when a command starts', () => {
    tab().scrollOffset = 12;

    shellManager.run(label, 'ls');

    expect(tab().scrollOffset).toBe(0);
  });

  it('marks an inactive tab unread when a command starts there', () => {
    managers.tab.tabs.push(makeTab('bob', 'red'));

    shellManager.run('bob', 'ls');

    expect(tab('bob').hasUnread).toBe(true);
  });

  it('trims the log to the configured length when a command starts', () => {
    writeFileSync(path.join(tmpDir, '.janissary', 'config.json'), JSON.stringify({ transcriptMaxLines: 2 }));
    loadConfig(tmpDir);
    tab().log = [{ input: 'a', output: '' }, { input: 'b', output: '' }];

    shellManager.run(label, 'ls');

    expect(tab().log.map((entry) => entry.input)).toEqual(['b', 'ls']);
    expect(events).toContainEqual({ type: 'entries:trimmed', tabLabel: label, count: 1 });
  });
});
