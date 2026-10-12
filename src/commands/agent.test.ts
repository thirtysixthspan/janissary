import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentResult } from '../agent/execute.js';
import type { AgentSnapshot } from '../agent/types.js';
import type { Managers } from '../managers.js';
import { createController } from '../controller.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import type { CommandInvocationContext } from './types.js';
import { parseRemoteAddress } from '../remote/address.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { command } from './agent.js';
import { makeTab } from '../tab/index.js';

const execute = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<AgentResult>>());
vi.mock('../agent/execute.js', () => {
  return {
    executeAgentRun: execute,
    agentFailure: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'failed', response: message.startsWith('Agent:') ? message : `Agent: ${message}`, cleanupWarnings: [] };
    },
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

async function run(line = 'agent execute task.md', context = invocation): Promise<AgentResult> {
  return await command.run(line, { label: 'janus', index: 0 }, managers, context) as AgentResult;
}

function nestedContext(snapshot: AgentSnapshot): CommandInvocationContext {
  const parent = managers.agent.create({ caller: invocation.caller, snapshot });
  return { ...invocation, runId: parent.id, signal: parent.abortController.signal };
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
    expect(managers.agent.runs.get(runId!)?.view()).toMatchObject({ host: 'Local', workspace: cloneWorkspace });
    managers.tab.closeTab(managers.tab.tabs.indexOf(monitor!));
    expect(managers.agent.runs.has(runId!)).toBe(true);
    gate.resolve({ status: 'completed', response: 'Finished.', cleanupWarnings: [] });
    await expect(pending).resolves.toMatchObject({ status: 'completed' });
    expect(managers.tab.tabs.some((tab) => tab.plugin?.id === 'agent-monitor')).toBe(false);
  });

  it.each([
    ['Review', 4],
    ['4', 4],
  ])('places a headed monitor in existing group selector %s', async (selector, groupId) => {
    managers.tab.tabs.push(makeTab('review-member', '#444', 2, [], [], undefined, groupId, '#444', 'Review'));
    execute.mockResolvedValue({ status: 'completed', response: 'Finished.', cleanupWarnings: [] });

    await expect(run(`agent in a tab in group "${selector}" execute task.md`)).resolves.toMatchObject({ status: 'completed' });

    expect(managers.tab.tabs.find((tab) => tab.plugin?.id === 'agent-monitor')).toMatchObject({
      group: groupId, groupName: 'Review',
    });
  });

  it.each(['missing', '0', '9007199254740992'])('rejects invalid group %s before creating headed or headless runs', async (selector) => {
    for (const launch of [`agent in group "${selector}" execute task.md`, `agent in a tab in group "${selector}" execute task.md`]) {
      await expect(run(launch)).resolves.toMatchObject({
        status: 'failed', response: `Agent: group "${selector}" does not exist.`,
      });
    }

    expect(managers.agent.runs.size).toBe(0);
    expect(managers.workspace.create).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('defaults a headed monitor to the caller group when no group is selected', async () => {
    const callerTab = managers.tab.byLabel('janus');
    if (!callerTab) throw new Error('Caller tab not found.');
    callerTab.group = 4;
    callerTab.groupName = 'Review';
    execute.mockResolvedValue({ status: 'completed', response: 'Finished.', cleanupWarnings: [] });

    await expect(run('agent in a tab execute task.md')).resolves.toMatchObject({ status: 'completed' });

    expect(managers.tab.tabs.find((tab) => tab.plugin?.id === 'agent-monitor')).toMatchObject({
      group: 4, groupName: 'Review',
    });
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
      const activeRun = [...managers.agent.runs.values()][0];
      expect(activeRun?.view()).toMatchObject({ host: 'devbox', workspace: '/remote/workspace' });
      expect(agentRun).toMatchObject({ executionDir: workspace });
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

  it.each([
    ['unselected', { source: 'project', name: 'other', instructions: 'same instructions' }],
    ['different source', { source: 'janissary', name: 'allowed', instructions: 'same instructions' }],
    ['changed instructions', { source: 'project', name: 'allowed', instructions: 'changed instructions' }],
  ] as const)('rejects a nested skill that is %s', async (_reason, selected) => {
    const skillsDir = path.join(cloneWorkspace, 'skills', 'allowed');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(path.join(skillsDir, 'SKILL.md'), 'same instructions');
    const context = nestedContext({
      taskPath: '/parent.md', taskText: 'parent',
      skills: [{ source: selected.source, name: selected.name, path: '/parent/SKILL.md', instructions: selected.instructions }],
      grants: ['agent'],
    });

    await expect(run('agent with skill allowed execute task.md', context)).resolves.toMatchObject({
      status: 'failed', response: 'Agent: nested skill "allowed" is outside the parent policy.',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('intersects nested skill grants with the parent effective grants', async () => {
    const skillsDir = path.join(cloneWorkspace, 'skills', 'allowed');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(path.join(skillsDir, 'SKILL.md'), 'same instructions');
    writeFileSync(path.join(skillsDir, 'janissary.json'), '{"version":1,"commands":["agent","question"]}');
    const context = nestedContext({
      taskPath: '/parent.md', taskText: 'parent',
      skills: [{ source: 'project', name: 'allowed', path: '/parent/SKILL.md', instructions: 'same instructions' }],
      grants: ['agent'],
    });
    execute.mockImplementation(async (agentRun) => {
      expect(agentRun).toMatchObject({ snapshot: { grants: ['agent'] } });
      return { status: 'completed', response: 'Child done.', cleanupWarnings: [] };
    });

    await expect(run('agent with skill allowed execute task.md', context)).resolves.toMatchObject({ status: 'completed' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('does not trust a live run id with an unrelated abort signal', async () => {
    const skillsDir = path.join(cloneWorkspace, 'skills', 'added');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(path.join(skillsDir, 'SKILL.md'), 'unselected instructions');
    const context = nestedContext({ taskPath: '/parent.md', taskText: 'parent', skills: [], grants: [] });
    const untrusted = { ...context, signal: new AbortController().signal };
    execute.mockResolvedValue({ status: 'completed', response: 'Ran without parent identity.', cleanupWarnings: [] });

    await expect(run('agent with skill added execute task.md', untrusted)).resolves.toMatchObject({ status: 'completed' });
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ snapshot: { skills: [{ name: 'added' }] } });
  });

  it('parent termination aborts and awaits nested execution cleanup', async () => {
    const context = nestedContext({ taskPath: '/parent.md', taskText: 'parent', skills: [], grants: ['agent'] });
    const parent = managers.agent.runs.get(context.runId);
    if (!parent) throw new Error('Parent run not found.');
    execute.mockImplementation(async (agentRun) => new Promise((resolve) => {
      const child = agentRun as { abortController: AbortController };
      child.abortController.signal.addEventListener('abort', () => {
        resolve({ status: 'terminated', response: 'Agent terminated.', cleanupWarnings: [] });
      }, { once: true });
    }));

    const child = run('agent execute task.md', context);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    const cleanup = managers.agent.finish(parent.id, 'terminated');
    await expect(cleanup).resolves.toBeUndefined();
    await expect(child).resolves.toMatchObject({ status: 'terminated' });
    expect(managers.agent.runs.size).toBe(0);
  });
});
