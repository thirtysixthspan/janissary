import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { TabManager } from './tab/manager.js';
import { ShellManager } from './shell-manager.js';
import { loadConfig } from './config.js';
import { loadLearnedCommands, learnedCommands } from './interactive-learned.js';
import { messageBus, type Subscription } from './bus.js';
import type { Managers } from './managers.js';

const executeShellCmdMock = vi.fn();
const queryShellPwdMock = vi.fn();
const spawnShellMock = vi.fn();
const spawnTransportMock = vi.fn();
const createRemoteShellMock = vi.fn();

vi.mock('./remote/shell-session.js', () => ({
  createRemoteShell: (...args: unknown[]) => createRemoteShellMock(...args),
}));

vi.mock('./shell.js', () => ({
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
