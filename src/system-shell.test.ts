import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createController, type Controller } from './controller.js';
import type { Managers } from './managers.js';
import { loadConfig } from './config.js';
import { initNotificationRecord } from './notifications/record.js';
import { spawnPty, type PtySession } from './pty.js';
import type { PluginCallOutcome } from './plugins/invoke.js';
import { SHELL_PAYLOAD_SCHEMA_VERSION } from './plugins/shell/shared.js';
import { seedRootTab, seedTestTab } from './tab/root-tab-test-fixture.js';
import type { SystemShellManager } from './system-shell.js';
import { messageBus } from './bus.js';

vi.mock('./pty.js', () => ({ spawnPty: vi.fn() }));

describe('SystemShellManager', () => {
  let projectDir: string;
  let controller: Controller;
  let managers: Managers;
  let manager: SystemShellManager;
  let nextPty: number;
  let eventOrder: string[];
  let sendPtyExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'janus-system-shell-'));
    loadConfig(projectDir);
    initNotificationRecord(projectDir);
    nextPty = 0;
    eventOrder = [];
    sendPtyExit = vi.fn(() => { eventOrder.push('broadcast'); });
    vi.mocked(spawnPty).mockReset();
    vi.mocked(spawnPty).mockImplementation((program) => fakePty(`pty-${++nextPty}`, program));
    controller = createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit }, projectDir);
    managers = controller.managers;
    seedRootTab(managers.tab);
    manager = managers.systemShell;
  });

  afterEach(async () => {
    await controller.shutdown();
    initNotificationRecord();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('opens one unsandboxed project-root shell, hides it, and restores focus to janus', async () => {
    const result = await manager.ensure();

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected the system shell to open');
    expect(result.tab).toMatchObject({ label: 'system', systemShell: true, hidden: true, view: 'plugin' });
    expect(managers.tab.cur().label).toBe('janus');
    expect(result.tab.plugin?.id).toBe('shell');
    expect(result.tab.plugin?.payload).toMatchObject({
      ptyId: managers.pty.terminalIdFor('system'), cwd: projectDir, root: projectDir, workspace: false,
    });
    expect(spawnPty).toHaveBeenCalledOnce();
    expect(vi.mocked(spawnPty).mock.calls[0]?.[2]).toBe(projectDir);
    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({ workspaceDir: undefined, offline: undefined, tokens: undefined });
    expect(vi.mocked(spawnPty).mock.calls[0]?.[8]).toEqual({ shell: '/bin/zsh', args: [] });
  });

  it('returns an existing live managed shell without reopening, focusing, or hiding it', async () => {
    const opened = await manager.ensure();
    if (opened.status !== 'ok') throw new Error('expected the system shell to open');
    managers.tab.setActiveTab(managers.tab.findIndex('system'));
    managers.tab.setActiveTab(managers.tab.findIndex('janus'));
    const run = vi.spyOn(managers.plugins, 'runCommandResult');

    const result = await manager.ensure();

    expect(result).toEqual({ status: 'ok', tab: opened.tab });
    expect(run).not.toHaveBeenCalled();
    expect(opened.tab.hidden).toBeUndefined();
    expect(managers.tab.cur().label).toBe('janus');
  });

  it('replaces a server-exited shell in place after broadcasting its exit', async () => {
    const opened = await manager.ensure();
    if (opened.status !== 'ok') throw new Error('expected the system shell to open');
    const tab = opened.tab;
    const position = managers.tab.tabs.indexOf(tab);
    const oldPty = managers.pty.terminalIdFor('system');
    if (!oldPty) throw new Error('expected the system PTY');
    const runtimes = managers.harness as unknown as { runtimes: { get(id: string): unknown } };
    expect(runtimes.runtimes.get(oldPty)).toBeDefined();
    const oldPayload = tab.plugin?.payload;
    if (typeof oldPayload !== 'object' || oldPayload === null || !('hookNonce' in oldPayload)) {
      throw new Error('expected a shell payload');
    }
    tab.title = 'private shell';
    tab.group = 8;
    tab.dock = 'right';
    tab.runtime!.queue.push('git status');
    managers.schedule.add('system', {
      id: 'later', command: 'git status', spec: 'at 3pm', recurring: false, nextRun: Date.now() + 60_000,
    }, { removed: vi.fn() });
    const removed = vi.fn();
    managers.schedule.add('system', {
      id: 'owned', command: 'git diff', spec: 'at 4pm', recurring: false, nextRun: Date.now() + 60_000,
    }, { removed });
    managers.pty.closeTab('system');
    const handle = manager.handlePtyExit.bind(manager);
    const recovery = vi.spyOn(manager, 'handlePtyExit').mockImplementation(async (id) => {
      eventOrder.push('recovery');
      await handle(id);
    });
    messageBus.emit('pty', { type: 'exit', id: oldPty, exitCode: 0 });
    await vi.waitFor(() => expect(managers.pty.terminalIdFor('system')).not.toBe(oldPty));
    await vi.waitFor(() => expect(runtimes.runtimes.get(oldPty)).toBeUndefined());

    expect(tab).toMatchObject({ label: 'system', title: 'private shell', group: 8, dock: 'right', hidden: true });
    expect(managers.tab.tabs.indexOf(tab)).toBe(position);
    expect(tab.runtime?.queue).toEqual(['git status']);
    expect(tab.plugin?.payload).toMatchObject({
      ptyId: managers.pty.terminalIdFor('system'), cwd: projectDir, root: projectDir, workspace: false,
    });
    expect(tab.plugin?.payload).not.toHaveProperty('hookNonce', oldPayload.hookNonce);
    expect(removed).toHaveBeenCalledOnce();
    expect(managers.schedule.get('system')).toBeUndefined();
    expect(recovery).toHaveBeenCalledOnce();
    expect(eventOrder).toEqual(['broadcast', 'recovery']);
    expect(sendPtyExit).toHaveBeenCalledWith(oldPty, 0);
    expect(managers.tab.cur().label).toBe('janus');
    expect(spawnPty).toHaveBeenCalledTimes(2);
    await manager.handlePtyExit(oldPty);
    expect(spawnPty).toHaveBeenCalledTimes(2);
  });

  it('ignores stale, mismatched, duplicate, ordinary and closing-tab exit events', async () => {
    const opened = await manager.ensure();
    if (opened.status !== 'ok') throw new Error('expected the system shell to open');
    const tab = opened.tab;
    const oldPty = managers.pty.terminalIdFor('system');
    if (!oldPty) throw new Error('expected the system PTY');
    const initialSpawnCount = vi.mocked(spawnPty).mock.calls.length;

    await manager.handlePtyExit('stale');
    tab.systemShell = undefined;
    await manager.handlePtyExit(oldPty);
    tab.systemShell = true;
    tab.plugin!.id = 'image';
    await manager.handlePtyExit(oldPty);
    tab.plugin!.id = 'shell';
    tab.runtime!.closing = true;
    await manager.handlePtyExit(oldPty);

    expect(vi.mocked(spawnPty)).toHaveBeenCalledTimes(initialSpawnCount);
    expect(tab.hidden).toBe(true);
    expect(managers.tab.byLabel('system')).toBe(tab);
  });

  it('keeps a failed hidden generation for a later explicit ensure retry', async () => {
    const opened = await manager.ensure();
    if (opened.status !== 'ok') throw new Error('expected the system shell to open');
    const oldPty = managers.pty.terminalIdFor('system');
    if (!oldPty) throw new Error('expected the system PTY');
    managers.pty.closeTab('system');
    vi.spyOn(managers.plugins, 'intent').mockRejectedValueOnce(new Error('restart was refused'));

    await manager.handlePtyExit(oldPty);

    expect(opened.tab.hidden).toBe(true);
    expect(managers.tab.byLabel('system')).toBe(opened.tab);
    expect(opened.tab.runtime?.serverPtyExitId).toBe(oldPty);
    expect(systemNotices()).toHaveLength(1);
    const retry = await manager.ensure();

    expect(retry).toEqual({ status: 'ok', tab: opened.tab });
    expect(livePty('system')).not.toBe(oldPty);
    expect(systemNotices()).toHaveLength(1);
  });

  it('does not recover a closing or disposed shell, or a shell plugin disabled for a fault', async () => {
    const opened = await manager.ensure();
    if (opened.status !== 'ok') throw new Error('expected the system shell to open');
    const oldPty = managers.pty.terminalIdFor('system');
    if (!oldPty) throw new Error('expected the system PTY');
    const initialSpawnCount = vi.mocked(spawnPty).mock.calls.length;

    opened.tab.runtime!.closing = true;
    await manager.handlePtyExit(oldPty);
    opened.tab.runtime!.closing = undefined;
    managers.plugins.clientFailed('system', 'shell plugin fault');
    await manager.handlePtyExit(oldPty);
    await manager.dispose();
    await manager.handlePtyExit(oldPty);

    expect(managers.plugins.statusFor('shell')?.state).toBe('disabled');
    expect(managers.tab.byLabel('system')).toBeUndefined();
    expect(vi.mocked(spawnPty)).toHaveBeenCalledTimes(initialSpawnCount);
  });

  it('shares concurrent ensure calls and clears the in-flight result for later ensures', async () => {
    const first = manager.ensure();
    const concurrent = manager.ensure();
    expect(concurrent).toBe(first);

    const [left, right] = await Promise.all([first, concurrent]);

    expect(left).toEqual(right);
    expect(spawnPty).toHaveBeenCalledOnce();
  });

  it('preserves a rejected spawn reason, posts one notice, and retries after failure', async () => {
    vi.mocked(spawnPty).mockImplementationOnce(() => { throw new Error('zsh unavailable'); });

    const failed = await manager.ensure();
    const retried = await manager.ensure();

    expect(failed).toEqual({
      status: 'failed', reason: `Cannot start a terminal in ${projectDir}: zsh unavailable.`,
    });
    expect(retried.status).toBe('ok');
    expect(systemNotices()).toHaveLength(1);
    expect(systemNotices()[0]).toMatchObject({
      tabLabel: 'system',
      message: `System shell could not start: Cannot start a terminal in ${projectDir}: zsh unavailable.`,
      openTab: 'system',
    });
    expect(managers.tab.tabs.filter((tab) => tab.label === 'system')).toHaveLength(1);
  });

  it('preserves a failed plugin result and reports it once for the attempt', async () => {
    const error = new Error('shell plugin disabled');
    vi.spyOn(managers.plugins, 'runCommandResult').mockResolvedValue({ status: 'failed', error });

    const result = await manager.ensure();

    expect(result).toEqual({ status: 'failed', reason: error });
    expect(systemNotices()).toHaveLength(1);
    expect(systemNotices()[0]?.message).toBe('System shell could not start: shell plugin disabled.');
    expect(managers.tab.tabs.map((tab) => tab.label)).toEqual(['janus']);
  });

  it.each([
    { outcome: { status: 'rejected' as const, reason: 'shell command rejected' }, reason: 'shell command rejected' },
    { outcome: { status: 'failed' as const, error: new Error('shell command failed') }, reason: 'shell command failed' },
  ])('closes a created shell tab and its PTY after a $outcome.status result', async ({ outcome, reason }) => {
    const runCommandResult = managers.plugins.runCommandResult.bind(managers.plugins);
    let openedTab: (typeof managers.tab.tabs)[number] | undefined;
    let ptyId: string | undefined;
    let pty: PtySession | undefined;
    vi.spyOn(managers.plugins, 'runCommandResult').mockImplementation(async (id, command, origin) => {
      const completed = await runCommandResult(id, command, origin);
      expect(completed.status).toBe('ok');
      openedTab = managers.tab.byLabel('system');
      ptyId = managers.pty.terminalIdFor('system');
      pty = vi.mocked(spawnPty).mock.results[0]?.value;
      expect(openedTab?.plugin?.id).toBe('shell');
      expect(ptyId).toBeDefined();
      if (ptyId !== undefined) expect(managers.pty.isRunningFor(ptyId, ['system'])).toBe(true);
      return outcome;
    });

    const result = await manager.ensure();

    expect(result).toEqual({ status: 'failed', reason: outcome.status === 'rejected' ? outcome.reason : outcome.error });
    expect(openedTab).toBeDefined();
    expect(managers.tab.byLabel('system')).toBeUndefined();
    expect(ptyId).toBeDefined();
    expect(pty && managers.pty.isRunningFor(pty.id, ['system'])).toBe(false);
    expect(pty?.kill).toHaveBeenCalledOnce();
    expect(managers.tab.tabs.map((tab) => tab.label)).toEqual(['janus']);
    expect(systemNotices()).toHaveLength(1);
    expect(systemNotices()[0]?.message).toBe(`System shell could not start: ${reason}.`);
  });

  it('reports a completed command without a valid shell and cleans up only its invalid tab', async () => {
    vi.spyOn(managers.plugins, 'runCommandResult').mockImplementation(async () => {
      managers.tab.openPluginTab(
        'shell', 'shell', 'invalid-system', SHELL_PAYLOAD_SCHEMA_VERSION, 'janus',
        () => ({ title: 'shell', payload: { ptyId: 'missing' } }),
        { label: 'system', cwd: projectDir },
      );
      return { status: 'ok', value: undefined };
    });

    const result = await manager.ensure();

    expect(result).toEqual({ status: 'failed', reason: 'the shell plugin opened no valid system shell' });
    expect(managers.tab.tabs.map((tab) => tab.label)).toEqual(['janus']);
    expect(systemNotices()).toHaveLength(1);
    expect(systemNotices()[0]?.message).toBe('System shell could not start: the shell plugin opened no valid system shell.');
  });

  it('does not close a pre-existing tab that occupies the reserved system label', async () => {
    const occupant = seedTestTab(managers.tab, 'system');
    const run = vi.spyOn(managers.plugins, 'runCommandResult');

    const result = await manager.ensure();

    expect(result).toEqual({ status: 'failed', reason: 'the shell plugin opened no valid system shell' });
    expect(managers.tab.byLabel('system')).toBe(occupant);
    expect(run).not.toHaveBeenCalled();
    expect(systemNotices()).toHaveLength(1);
  });

  it('reports a dead existing managed shell without replacing or closing it', async () => {
    const opened = await manager.ensure();
    if (opened.status !== 'ok') throw new Error('expected the system shell to open');
    managers.pty.closeTab('system');
    const ptyCount = vi.mocked(spawnPty).mock.calls.length;

    const result = await manager.ensure();

    expect(result).toEqual({ status: 'failed', reason: 'the existing system shell has no valid live local terminal' });
    expect(managers.tab.byLabel('system')).toBe(opened.tab);
    expect(opened.tab.systemShell).toBe(true);
    expect(vi.mocked(spawnPty).mock.calls).toHaveLength(ptyCount);
    expect(systemNotices()).toHaveLength(1);
  });

  it('rejects a managed tab whose payload PTY does not match its registered terminal', async () => {
    const opened = await manager.ensure();
    if (opened.status !== 'ok') throw new Error('expected the system shell to open');
    const payload = opened.tab.plugin?.payload;
    if (typeof payload !== 'object' || payload === null || !('ptyId' in payload)) {
      throw new Error('expected a shell terminal payload');
    }
    opened.tab.plugin!.payload = { ...payload, ptyId: 'other-terminal' };

    const result = await manager.ensure();

    expect(result).toEqual({ status: 'failed', reason: 'the existing system shell has no valid live local terminal' });
    expect(managers.tab.byLabel('system')).toBe(opened.tab);
    expect(vi.mocked(spawnPty)).toHaveBeenCalledOnce();
    expect(systemNotices()).toHaveLength(1);
  });

  it('blocks new work after disposal and waits for the in-flight attempt', async () => {
    const deferred = Promise.withResolvers<PluginCallOutcome<void>>();
    const run = vi.spyOn(managers.plugins, 'runCommandResult').mockImplementation(() => deferred.promise);
    const pending = manager.ensure();
    const disposal = manager.dispose();
    const blocked = await manager.ensure();

    expect(blocked).toEqual({ status: 'failed', reason: 'system shell manager is disposed' });
    expect(run).toHaveBeenCalledOnce();
    const completed = (async () => { await disposal; return 'done'; })();
    const disposalState = await Promise.race([completed, Promise.resolve('waiting')]);
    expect(disposalState).toBe('waiting');

    deferred.resolve({ status: 'rejected', reason: 'held attempt finished' });
    expect(await pending).toEqual({ status: 'failed', reason: 'held attempt finished' });
    await disposal;
    expect(run).toHaveBeenCalledOnce();
  });

  function systemNotices() {
    return managers.notifications.all.filter((notice) => notice.event === 'system-schedule-fire');
  }

  function livePty(label: string): string | undefined {
    return managers.pty.terminalIdFor(label);
  }
});

function fakePty(id: string, program: string): PtySession {
  return { id, program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
}
