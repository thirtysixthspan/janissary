import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { TabManager } from '../tab/manager.js';
import { ShellManager } from './manager.js';
import { loadConfig } from '../config.js';
import { loadLearnedCommands, learnedCommands } from '../interactive/learned.js';
import { messageBus, type BusEvent, type Subscription } from '../bus.js';
import { makeTab } from '../tab/index.js';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';
import type { RestoredSink } from '../remote/shell-session.js';

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

// Release the trailing pwd query that gates the next command on the same shell.
function resolvePwd(): void {
  const onResult = queryShellPwdMock.mock.calls.at(-1)?.[2] as (pwd: string) => void;
  onResult('/tmp');
}

// The restored sink the manager handed the adopted remote shell: where a replayed session's output
// and retained history land.
function restoredSink(): RestoredSink {
  return createRemoteShellMock.mock.calls[0][6] as RestoredSink;
}

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

  it('runs a local tab in a pty when detection is on', async () => {
    const managers = makeManagers();
    new ShellManager(managers).run('janus', 'ls');

    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    expect(spawnTransportMock).toHaveBeenCalledTimes(1);
    expect(spawnShellMock).not.toHaveBeenCalled();
    expect(spawnTransportMock.mock.calls[0][5]).toMatchObject({ shellArgs: expect.any(Array) });
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

  it('leaves a remote tab on its channel shell whatever the setting says', async () => {
    const managers = makeManagers();
    managers.remote = { get: () => ({}) } as unknown as Managers['remote'];
    managers.tab.cur().remote = 'host';

    new ShellManager(managers).run(managers.tab.cur().label, 'ls');

    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    expect(createRemoteShellMock).toHaveBeenCalledTimes(1);
    expect(spawnTransportMock).not.toHaveBeenCalled();
  });

  // An attached agent tab's shell is created lazily, so the recorded spawn id is parked here first
  // — and only the channel the adoption was recorded against may claim it.
  it('binds a remote tab\'s first shell to the adopted spawn id its channel still holds', async () => {
    const managers = makeManagers();
    managers.remote = { get: () => ({ sessionId: 'sess-1' }) } as unknown as Managers['remote'];
    managers.tab.cur().remote = 'devbox';
    const shellManager = new ShellManager(managers);
    shellManager.adoptRemoteShell('janus', 'rsh9', 'sess-1');

    shellManager.run('janus', 'ls');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    expect(createRemoteShellMock.mock.calls[0][1]).toBe('rsh9');
    expect(createRemoteShellMock.mock.calls[0][5]).toBe(true);
  });

  // Closing the tab frees the adoption with it: a later tab granted the same label starts its own
  // shell instead of binding to a spawn id nobody recorded for it.
  it('drops an adopted spawn id when the tab closes', async () => {
    const managers = makeManagers();
    managers.remote = { get: () => ({ sessionId: 'sess-1' }) } as unknown as Managers['remote'];
    managers.tab.cur().remote = 'devbox';
    const shellManager = new ShellManager(managers);
    shellManager.adoptRemoteShell('janus', 'rsh9', 'sess-1');
    shellManager.closeTab('janus');

    shellManager.run('janus', 'ls');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    expect(createRemoteShellMock.mock.calls[0][1]).toMatch(/^rsh\d+/);
    expect(createRemoteShellMock.mock.calls[0][1]).not.toBe('rsh9');
  });

  // The label a tab holds is freed the moment it closes, and a fresh session that reuses it talks
  // over a different channel — the adoption belongs to the old session and must not be claimed.
  it('refuses an adoption whose recorded session no longer matches the tab\'s channel', async () => {
    const managers = makeManagers();
    managers.remote = { get: () => ({ sessionId: 'sess-2' }) } as unknown as Managers['remote'];
    managers.tab.cur().remote = 'devbox';
    const shellManager = new ShellManager(managers);
    shellManager.adoptRemoteShell('janus', 'rsh9', 'sess-1');

    shellManager.run('janus', 'ls');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    expect(createRemoteShellMock.mock.calls[0][1]).toMatch(/^rsh\d+/);
    expect(createRemoteShellMock.mock.calls[0][1]).not.toBe('rsh9');
  });

  it('releases an adopted spawn id when the attach says there is no shell to come back to', async () => {
    const managers = makeManagers();
    managers.remote = { get: () => ({ sessionId: 'sess-1' }) } as unknown as Managers['remote'];
    managers.tab.cur().remote = 'devbox';
    const shellManager = new ShellManager(managers);
    shellManager.adoptRemoteShell('janus', 'rsh9', 'sess-1');
    shellManager.releaseAdoptedShell('janus');

    shellManager.run('janus', 'ls');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    expect(createRemoteShellMock.mock.calls[0][1]).toMatch(/^rsh\d+/);
    expect(createRemoteShellMock.mock.calls[0][1]).not.toBe('rsh9');
  });

  it('publishes restored output immediately and applies transcript retention', () => {
    writeFileSync(path.join(tmpDir, '.janissary', 'config.json'), JSON.stringify({ transcriptMaxLines: 2 }));
    loadConfig(tmpDir);
    const managers = makeManagers();
    managers.remote = { get: () => ({ sessionId: 'sess-1' }) } as unknown as Managers['remote'];
    const tab = managers.tab.cur();
    tab.remote = { address: 'devbox', host: 'devbox' };
    const shellManager = new ShellManager(managers);
    shellManager.adoptRemoteShell(tab.label, 'rsh9', 'sess-1');
    shellManager.ensure(tab.label);
    const restored = restoredSink();
    const dirty = vi.fn();
    const subscription = messageBus.on('state', 'dirty', dirty);
    try {
      restored.output('\u{1B}c');
      expect(dirty).not.toHaveBeenCalled();
      restored.output('\u{1B}cearlier output');
      expect(tab.log).toEqual([{ input: '', output: 'earlier output' }]);
      expect(dirty).toHaveBeenCalledOnce();
      restored.output('later output');
      restored.output('latest output');
      expect(tab.log.map((entry) => entry.output)).toEqual(['later output', 'latest output']);
      expect(dirty).toHaveBeenCalledTimes(3);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('strips shell sentinel lines from restored output', () => {
    const managers = makeManagers();
    managers.remote = { get: () => ({ sessionId: 'sess-1' }) } as unknown as Managers['remote'];
    const tab = managers.tab.cur();
    tab.remote = { address: 'devbox', host: 'devbox' };
    const shellManager = new ShellManager(managers);
    shellManager.adoptRemoteShell(tab.label, 'rsh9', 'sess-1');
    shellManager.ensure(tab.label);
    const restored = restoredSink();

    restored.output('tsconfig.json\nvitest.config.ts\nweb\n__JS_END_3_1789964749418__\n');
    restored.output('/remote/workspace/harun\n__PWD_3_1789964749468__\npwd\n/remote/workspace/harun\n__PWD_3_1789964749502__\n');
    restored.output('zsh: operation not permitted: ps\n__JS_END_3_1789964752762__\n');

    expect(tab.log.map((entry) => entry.output)).toEqual([
      'tsconfig.json\nvitest.config.ts\nweb\n',
      'zsh: operation not permitted: ps\n',
    ]);
  });

  it('rebuilds a restored transcript from retained history runs, commands included', () => {
    const managers = makeManagers();
    managers.remote = { get: () => ({ sessionId: 'sess-1' }) } as unknown as Managers['remote'];
    const tab = managers.tab.cur();
    tab.remote = { address: 'devbox', host: 'devbox' };
    const shellManager = new ShellManager(managers);
    shellManager.adoptRemoteShell(tab.label, 'rsh9', 'sess-1');
    shellManager.ensure(tab.label);
    const restored = restoredSink();

    restored.history([
      { source: 'input', text: '{ :; ls\n} 2>&1; echo "__JS_END_3_1__"\n' },
      { source: 'output', text: 'web\n__JS_END_3_1__\n' },
      { source: 'input', text: 'pwd\necho "__PWD_3_2__"\n' },
      { source: 'output', text: '/remote/workspace/harun\n__PWD_3_2__\n' },
      { source: 'input', text: '{ :; ps\n} 2>&1; echo "__JS_END_3_3__"\n' },
      { source: 'output', text: 'operation not permitted\n__JS_END_3_3__\n' },
    ]);

    expect(tab.log).toEqual([
      { input: 'ls', output: 'web' },
      { input: 'ps', output: 'operation not permitted' },
    ]);
  });
});

describe('ShellManager — promotion to a terminal', () => {
  let tmpDir: string;
  let managers: Managers;
  let shellManager: ShellManager;
  const ptyEvents: unknown[] = [];

  const ESC = String.fromCodePoint(27);
  const label = 'janus';
  let ptySubscription: Subscription;

  beforeEach(() => {
    resetShellMocks();
    ptyEvents.length = 0;
    tmpDir = mkdtempSync(path.join(tmpdir(), 'shell-promote-'));
    mkdirSync(path.join(tmpDir, '.janissary'), { recursive: true });
    loadConfig(tmpDir);
    loadLearnedCommands(tmpDir);
    ptySubscription = messageBus.on('pty', 'data', (event) => { ptyEvents.push(event); });
    managers = makeManagers();
    shellManager = new ShellManager(managers);
  });

  afterEach(() => {
    ptySubscription.unsubscribe();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const tab = (): { activePty?: string; log: { output: string; running?: boolean }[] } =>
    managers.tab.tabs.find((t) => t.label === label)!;

  it('takes over the tab when output shows a program claiming the screen', async () => {
    shellManager.run(label, 'mytui');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    streamOutput(['starting', `${ESC}[?1049h`]);

    expect(tab().activePty).toBe('pty1');
    expect(ptyEvents).toContainEqual({ type: 'data', id: 'pty1', data: `starting${ESC}[?1049h` });
    expect(tab().log.at(-1)?.running).toBe(true);
  });

  it('restores the transcript with a note when the command finishes', async () => {
    shellManager.run(label, 'mytui');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    streamOutput([`${ESC}[?1049h`]);
    completeCommand('ignored screen bytes');

    expect(tab().activePty).toBeUndefined();
    expect(tab().log.at(-1)?.output).toBe('(ran in terminal)');
    expect(tab().log.at(-1)?.running).toBe(false);
  });

  it('leaves an ordinary command in the transcript', async () => {
    shellManager.run(label, 'ls');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    streamOutput(['file-a\nfile-b\n']);
    completeCommand('file-a\nfile-b');

    expect(tab().activePty).toBeUndefined();
    expect(tab().log.at(-1)?.output).toBe('file-a\nfile-b');
  });

  it('never promotes a command that asked not to be detected, and still captures its output', async () => {
    const onComplete = vi.fn();
    shellManager.run(label, 'mytui', { detect: false, onComplete });
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    streamOutput([`${ESC}[?1049h`]);
    expect(tab().activePty).toBeUndefined();

    completeCommand('captured output');
    expect(onComplete).toHaveBeenCalledWith('captured output');
  });

  it('promotes on request, for a program that never announced itself', async () => {
    shellManager.run(label, 'sudo -S true');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    streamOutput(['Password:']);
    expect(tab().activePty).toBeUndefined();

    shellManager.promoteRunning(label);
    expect(tab().activePty).toBe('pty1');
  });

  it('no-ops a promotion request when nothing is running', () => {
    expect(() => { shellManager.promoteRunning(label); }).not.toThrow();
    expect(tab().activePty).toBeUndefined();
  });

  it('learns a detected command but not one the user promoted by hand', async () => {
    shellManager.run(label, 'mytui');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    streamOutput([`${ESC}[?1049h`]);
    completeCommand('');
    expect(learnedCommands().has('mytui')).toBe(true);

    await vi.waitFor(() => { expect(queryShellPwdMock).toHaveBeenCalledTimes(1); });
    resolvePwd();

    shellManager.run(label, 'othertui');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(2); });
    shellManager.promoteRunning(label);
    completeCommand('');
    expect(learnedCommands().has('othertui')).toBe(false);
  });

  it('streams post-promotion chunks to the bus as deltas in order', async () => {
    shellManager.run(label, 'mytui');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    streamOutput(['starting', `${ESC}[?1049h`]);
    expect(ptyEvents).toEqual([{ type: 'data', id: 'pty1', data: `starting${ESC}[?1049h` }]);

    streamOutput([`starting${ESC}[?1049hframe one`, 'frame two']);

    expect(ptyEvents).toEqual([
      { type: 'data', id: 'pty1', data: `starting${ESC}[?1049h` },
      { type: 'data', id: 'pty1', data: 'frame one' },
      { type: 'data', id: 'pty1', data: 'frame two' },
    ]);
  });

  it('emits no PTY data before the command is promoted', async () => {
    shellManager.run(label, 'sudo -S true');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    streamOutput(['Password:', 'Password:prompt ack']);
    expect(ptyEvents).toEqual([]);
  });

  it('streams deltas after a manual promotion too', async () => {
    shellManager.run(label, 'sudo -S true');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    streamOutput(['Password:']);
    shellManager.promoteRunning(label);
    expect(ptyEvents).toEqual([{ type: 'data', id: 'pty1', data: 'Password:' }]);

    streamOutput(['Password:prompt ack', 'done']);

    expect(ptyEvents).toEqual([
      { type: 'data', id: 'pty1', data: 'Password:' },
      { type: 'data', id: 'pty1', data: 'prompt ack' },
      { type: 'data', id: 'pty1', data: 'done' },
    ]);
  });
});

describe('ShellManager — a pty shell that exits', () => {
  let tmpDir: string;
  let managers: Managers;
  let shellManager: ShellManager;
  const label = 'janus';
  const ESC = String.fromCodePoint(27);

  // The exit hook the manager handed the pty manager for the `call`th transport it spawned.
  const transportExit = (call: number): (() => void) =>
    (spawnTransportMock.mock.calls[call][4] as { onExit: () => void }).onExit;

  const tab = (): { activePty?: string; log: { input: string; output: string; running?: boolean }[] } =>
    managers.tab.tabs.find((t) => t.label === label)!;

  beforeEach(() => {
    resetShellMocks();
    let spawned = 0;
    spawnTransportMock.mockImplementation(() => ({
      id: `pty${++spawned}`, program: 'bash', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    }));
    tmpDir = mkdtempSync(path.join(tmpdir(), 'shell-exit-'));
    mkdirSync(path.join(tmpDir, '.janissary'), { recursive: true });
    loadConfig(tmpDir);
    managers = makeManagers();
    shellManager = new ShellManager(managers);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finishes the running command and respawns the shell on the next one', async () => {
    const onComplete = vi.fn();
    shellManager.run(label, 'exit', { onComplete });
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    const firstShell = executeShellCmdMock.mock.calls[0][0] as { stdin: { writable: boolean } };

    transportExit(0)();
    expect(firstShell.stdin.writable).toBe(false);
    completeCommand('(shell exited)');

    expect(onComplete).toHaveBeenCalledWith('(shell exited)');
    expect(tab().log.at(-1)).toMatchObject({ input: 'exit', output: '(shell exited)', running: false });
    expect(managers.tab.isBusy(label)).toBe(false);

    await vi.waitFor(() => { expect(queryShellPwdMock).toHaveBeenCalledTimes(1); });
    resolvePwd();

    shellManager.run(label, 'ls');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(2); });
    expect(spawnTransportMock).toHaveBeenCalledTimes(2);
    expect(executeShellCmdMock.mock.calls[1][0]).not.toBe(firstShell);
  });

  // `connection close shell` retires the first shell and the next command starts a second; the first
  // pty's exit lands only afterwards and must not strip the second shell's id, or promotion breaks.
  it('keeps the replacement shell\'s pty id when the old shell\'s exit arrives late', async () => {
    shellManager.run(label, 'ls');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });
    shellManager.close(label);

    shellManager.run(label, 'mytui');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(2); });
    expect(spawnTransportMock).toHaveBeenCalledTimes(2);

    transportExit(0)();
    streamOutput([`${ESC}[?1049h`]);

    expect(tab().activePty).toBe('pty2');
  });

  // Killing a shell ends its streams too, which completes its command — but the tab it would report
  // to may be gone, so a command on a shell the manager retired itself stays silent.
  it('drops the completion of a command whose shell the manager killed', async () => {
    const onComplete = vi.fn();
    shellManager.run(label, 'sleep 100', { onComplete });
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    shellManager.closeTab(label);
    completeCommand('(shell exited)');

    expect(onComplete).not.toHaveBeenCalled();
    expect(queryShellPwdMock).not.toHaveBeenCalled();
    expect(tab().log.at(-1)).toMatchObject({ input: 'sleep 100', running: true });
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
  const ESC = String.fromCodePoint(27);

  const appended = (): BusEvent[] => events.filter((event) => event.type === 'entry:appended');
  const tab = (name = label): Tab => managers.tab.tabs.find((t) => t.label === name)!;

  beforeEach(() => {
    resetShellMocks();
    events.length = 0;
    tmpDir = mkdtempSync(path.join(tmpdir(), 'shell-events-'));
    mkdirSync(path.join(tmpDir, '.janissary'), { recursive: true });
    loadConfig(tmpDir);
    loadLearnedCommands(tmpDir);
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

  it('emits no trailing output event for a command promoted to a terminal', async () => {
    shellManager.run(label, 'mytui');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    streamOutput([`${ESC}[?1049h`]);
    completeCommand('screen bytes');

    expect(appended()).toHaveLength(1);
    expect(tab().log.at(-1)).toMatchObject({ input: 'mytui', output: '(ran in terminal)', running: false });
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
