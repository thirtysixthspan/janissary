import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentResult } from '../agent/execute.js';
import type { Managers } from '../managers.js';
import { createController } from '../controller.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import type { CommandInvocationContext } from './types.js';
import { parseRemoteAddress } from '../remote/address.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { command } from './agent.js';
import * as config from '../config.js';
import * as sandbox from '../sandbox/index.js';

const execute = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<AgentResult>>());
vi.mock('../agent/execute.js', () => {
  return {
    executeAgentRun: execute,
    agentFailure: (error: unknown) => ({
      status: 'failed', response: `Agent: ${error instanceof Error ? error.message : String(error)}`, cleanupWarnings: [],
    }),
  };
});

let controller: ReturnType<typeof createController>;
let workspace: string;
let cloneWorkspace: string;
let invocation: CommandInvocationContext;
let managers: Managers;
let callerAbort: AbortController;
let workspaceRelease: ReturnType<typeof vi.fn>;

beforeEach(() => {
  workspace = mkdtempSync(path.join(os.tmpdir(), 'janissary-agent-command-'));
  cloneWorkspace = mkdtempSync(path.join(os.tmpdir(), 'janissary-agent-clone-'));
  mkdirSync(path.join(workspace, 'ai', 'tasks'), { recursive: true });
  writeFileSync(path.join(workspace, 'ai', 'tasks', 'task.md'), 'Do the work.');
  mkdirSync(path.join(cloneWorkspace, 'ai', 'tasks'), { recursive: true });
  writeFileSync(path.join(cloneWorkspace, 'ai', 'tasks', 'task.md'), 'Cloned task.');
  controller = createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} });
  const tab = seedRootTab(controller.managers.tab);
  tab.runtime!.cwd = workspace;
  managers = controller.managers;
  workspaceRelease = vi.fn(async () => {});
  vi.spyOn(managers.workspace, 'acquireAgentLease').mockImplementation((dir) => {
    if (dir === cloneWorkspace) return workspaceRelease;
    throw new Error(`Cannot borrow untracked workspace: ${dir}`);
  });
  vi.spyOn(managers.workspace, 'create').mockReturnValue({ dir: cloneWorkspace, ready: Promise.resolve() });
  vi.spyOn(managers.workspace, 'release').mockImplementation(() => {});
  callerAbort = new AbortController();
  invocation = {
    runId: 'outer-run',
    invocationId: 'outer-invocation',
    caller: managers.agent.captureCaller(tab),
    signal: callerAbort.signal,
  };
  execute.mockReset();
});

afterEach(async () => {
  await controller.shutdown();
  rmSync(workspace, { recursive: true, force: true });
  rmSync(cloneWorkspace, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function run(line = 'agent execute task.md'): Promise<AgentResult> {
  return await command.run(line, { label: 'janus', index: 0 }, managers, invocation) as AgentResult;
}

describe('agent command', () => {
  it('runs headlessly and returns the structured result after cleanup', async () => {
    execute.mockImplementation(async (agentRun) => {
      expect(agentRun).toMatchObject({ executionDir: cloneWorkspace, snapshot: { taskText: 'Cloned task.' } });
      return { status: 'completed', response: 'Finished.', cleanupWarnings: [] };
    });

    await expect(run()).resolves.toEqual({ status: 'completed', response: 'Finished.', cleanupWarnings: [] });
    expect(managers.tab.tabs).toHaveLength(1);
    expect(managers.agent.runs.size).toBe(0);
    expect(execute.mock.calls[0]?.[1]).toMatchObject({ runId: expect.any(String), caller: invocation.caller });
    expect(execute.mock.calls[0]?.[1]).toHaveProperty('signal', expect.any(AbortSignal));
    expect(execute.mock.calls[0]?.[1]).toMatchObject({ caller: { cwd: workspace } });
    expect(managers.workspace.create).toHaveBeenCalledOnce();
    expect(workspaceRelease).toHaveBeenCalledOnce();
  });

  it('cancels provisioning and releases its workspace before a terminated result settles', async () => {
    const ready = Promise.withResolvers<void>();
    const cancel = vi.fn(() => ready.resolve());
    vi.mocked(managers.workspace.create).mockReturnValue({ dir: cloneWorkspace, ready: ready.promise, cancel });
    vi.spyOn(managers.workspace, 'cancel').mockImplementation(() => { cancel(); });
    execute.mockResolvedValue({ status: 'completed', response: 'unexpected', cleanupWarnings: [] });

    const pending = run();
    await Promise.resolve();
    callerAbort.abort();
    await expect(pending).resolves.toMatchObject({ status: 'terminated', response: 'Agent terminated.' });

    expect(cancel).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(workspaceRelease).toHaveBeenCalledOnce();
  });

  it('uses a tracked caller workspace and releases only the borrowed reference', async () => {
    const borrowedRelease = vi.fn(async () => {});
    vi.mocked(managers.workspace.acquireAgentLease).mockImplementation((dir) => {
      if (dir === workspace) return borrowedRelease;
      return workspaceRelease;
    });
    execute.mockResolvedValue({ status: 'completed', response: 'Finished.', cleanupWarnings: [] });

    await expect(run()).resolves.toMatchObject({ status: 'completed' });
    expect(managers.workspace.create).not.toHaveBeenCalled();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ executionDir: workspace });
    expect(borrowedRelease).toHaveBeenCalledOnce();
  });

  it('reports disabled sandboxing in notifications without adding caller output', async () => {
    vi.spyOn(config, 'getConfig').mockReturnValue({ ...config.getConfig(), sandboxWorkspaces: false });
    vi.spyOn(sandbox, 'sandboxAvailable').mockReturnValue(true);
    execute.mockResolvedValue({ status: 'completed', response: 'Finished.', cleanupWarnings: [] });

    await expect(run()).resolves.toMatchObject({ status: 'completed' });

    const notices = managers.notifications.all.filter(({ message }) => message === 'Agent: sandboxing is disabled.');
    expect(notices).toHaveLength(1);
    expect(notices[0]?.event).toBe('manual');
    expect(managers.tab.tabs[0]?.log.map(({ output }) => output).join('\n')).not.toContain('sandboxing is disabled');
  });

  it('releases a failed provisioning workspace and preserves cleanup warnings', async () => {
    vi.mocked(managers.workspace.create).mockReturnValue({
      dir: cloneWorkspace,
      ready: Promise.reject(new Error('clone failed')),
    });
    workspaceRelease.mockRejectedValueOnce(new Error('workspace removal failed'));

    await expect(run()).resolves.toMatchObject({
      status: 'failed',
      response: 'Agent: clone failed',
      cleanupWarnings: ['workspace removal failed'],
    });
    expect(workspaceRelease).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it('turns provider failures into failed results and still releases run resources', async () => {
    const released = vi.fn();
    execute.mockImplementation(async (agentRun) => {
      (agentRun as { addResource: (id: string, cleanup: () => void) => void }).addResource('owned', released);
      throw new Error('provider went away');
    });

    await expect(run()).resolves.toMatchObject({ status: 'failed', response: 'Agent: provider went away' });
    expect(released).toHaveBeenCalledOnce();
    expect(managers.agent.runs.size).toBe(0);
  });

  it('retains caller termination and reports cleanup failures separately', async () => {
    const cleanupError = vi.fn(() => { throw new Error('session close failed'); });
    execute.mockImplementation(async (agentRun) => {
      const runRecord = agentRun as { addResource: (id: string, cleanup: () => void) => void };
      runRecord.addResource('owned', cleanupError);
      managers.agent.closeCaller(managers.tab.byLabel('janus')!);
      return { status: 'terminated', response: 'Agent terminated.', cleanupWarnings: [] };
    });

    await expect(run()).resolves.toEqual({
      status: 'terminated', response: 'Agent terminated.', cleanupWarnings: ['session close failed'],
    });
    expect(cleanupError).toHaveBeenCalledOnce();
  });

  it('opens a run-bound monitor for headed local runs and detaches it when closed', async () => {
    const gate = Promise.withResolvers<AgentResult>();
    execute.mockReturnValue(gate.promise);
    const pending = run('agent in a tab execute task.md');
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
    const monitor = managers.tab.tabs.find((tab) => tab.plugin?.id === 'agent-monitor');
    expect(monitor).toBeDefined();
    expect(monitor?.title).toBe('Agent: task.md');
    const runId = monitor?.plugin?.agentRunId;
    expect(runId).toBeDefined();
    managers.tab.closeTab(managers.tab.tabs.indexOf(monitor!));
    expect(managers.agent.runs.has(runId!)).toBe(true);
    gate.resolve({ status: 'completed', response: 'Finished.', cleanupWarnings: [] });
    await expect(pending).resolves.toMatchObject({ status: 'completed' });
    expect(managers.tab.tabs.some((tab) => tab.plugin?.id === 'agent-monitor')).toBe(false);
  });

  it('refuses remote execution unless the host has an established workspace', async () => {
    await expect(run('agent on build-box execute task.md')).resolves.toMatchObject({
      status: 'failed', response: 'Agent: requested remote host must match an established remote workspace.',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('resolves remote task snapshots and holds a run-only workspace reference through cleanup', async () => {
    const parsed = parseRemoteAddress('devbox');
    if ('error' in parsed) throw new Error(parsed.error);
    const snapshot = { taskPath: '/remote/ai/tasks/task.md', taskText: 'Remote task.', skills: [], grants: [] };
    const channel = { attached: true, resolveAgentSnapshot: vi.fn(async () => snapshot) } as unknown as RemoteChannel;
    const release = vi.fn(async () => {});
    vi.spyOn(managers.remote, 'addressOf').mockReturnValue(parsed);
    vi.spyOn(managers.remote, 'get').mockReturnValue(channel);
    vi.spyOn(managers.remote, 'workspaceOf').mockReturnValue('/remote/workspace');
    vi.spyOn(managers.remote, 'acquireAgentLease').mockReturnValue(release);
    execute.mockImplementation(async (agentRun) => {
      (agentRun as { addResource: (id: string, cleanup: () => Promise<void>) => void }).addResource(
        'remote-close', async () => { throw new Error('Remote agent close was not acknowledged.'); },
      );
      return { status: 'completed', response: 'Remote done.', cleanupWarnings: [] };
    });

    await expect(run('agent on devbox execute task.md')).resolves.toMatchObject({
      status: 'completed', cleanupWarnings: ['Remote agent close was not acknowledged.'],
    });

    expect(channel.resolveAgentSnapshot).toHaveBeenCalledWith('task.md', []);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ snapshot });
    expect(execute.mock.calls[0]?.[6]).toEqual({ channel, offline: undefined });
    expect(release).toHaveBeenCalledOnce();
  });

  it('routes malformed agent syntax to the launch parser', async () => {
    await expect(run('agent worker')).resolves.toEqual({
      status: 'failed', response: 'Agent: expected launch clause or final execute, got "worker".', cleanupWarnings: [],
    });
  });
});
