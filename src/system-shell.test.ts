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

vi.mock('./pty.js', () => ({ spawnPty: vi.fn() }));

describe('SystemShellManager', () => {
  let projectDir: string;
  let controller: Controller;
  let managers: Managers;
  let manager: SystemShellManager;
  let nextPty: number;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'janus-system-shell-'));
    loadConfig(projectDir);
    initNotificationRecord(projectDir);
    nextPty = 0;
    vi.mocked(spawnPty).mockReset();
    vi.mocked(spawnPty).mockImplementation((program) => fakePty(`pty-${++nextPty}`, program));
    controller = createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} }, projectDir);
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
});

function fakePty(id: string, program: string): PtySession {
  return { id, program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
}
