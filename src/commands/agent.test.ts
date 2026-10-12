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

function establishedRemoteEntry(
  destination: string,
  channel: RemoteChannel,
  workspaceDir: string,
): ReturnType<Managers['remote']['liveEntries']>[number] {
  const address = parseRemoteAddress(destination);
  if ('error' in address) throw new Error(address.error);
  return { address, channel, workspaceDir, labels: new Set(['remote']) } as ReturnType<Managers['remote']['liveEntries']>[number];
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

  it('retains a completed result and reports bounded ACP shutdown failure as a cleanup warning', async () => {
    let runRecord: { addResource: (id: string, cleanup: () => Promise<void>) => void } | undefined;
    execute.mockImplementation(async (agentRun) => {
      runRecord = agentRun as typeof runRecord;
      runRecord.addResource('acp:timeout', async () => { throw new Error('ACP process tree shutdown timed out.'); });
      return { status: 'completed', response: 'Finished.', cleanupWarnings: [] };
    });

    await expect(run()).resolves.toEqual({
      status: 'completed',
      response: 'Finished.',
      cleanupWarnings: ['ACP process tree shutdown timed out.'],
    });
    expect(runRecord).toBeDefined();
    expect(workspaceRelease).toHaveBeenCalledOnce();
    expect(managers.agent.runs.size).toBe(0);
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

  it('opens a run-only remote target for a local caller and keeps Janissary commands in caller context', async () => {
    const parsed = parseRemoteAddress('build-box');
    if ('error' in parsed) throw new Error(parsed.error);
    const snapshot = { taskPath: '/remote/project/ai/tasks/task.md', taskText: 'Remote task.', skills: [], grants: [] };
    const channel = { attached: true, resolveAgentSnapshot: vi.fn(async () => snapshot) } as unknown as RemoteChannel;
    const release = vi.fn(async () => {});
    vi.spyOn(managers.remote, 'create').mockReturnValue(channel);
    vi.spyOn(managers.remote, 'readyOf').mockReturnValue(Promise.resolve('/remote/project'));
    vi.spyOn(managers.remote, 'acquireAgentLease').mockReturnValue(release);
    vi.spyOn(managers.remote, 'release').mockReturnValue(true);
    execute.mockImplementation(async (_run, context) => {
      expect(context).toMatchObject({ caller: invocation.caller });
      return { status: 'completed', response: 'Remote done.', cleanupWarnings: [] };
    });

    await expect(run('agent on build-box execute task.md')).resolves.toMatchObject({ status: 'completed' });

    expect(managers.remote.create).toHaveBeenCalledWith(
      expect.stringMatching(/^agent-/), parsed, workspace, expect.any(Object), undefined, { nonInteractive: true },
    );
    expect(channel.resolveAgentSnapshot).toHaveBeenCalledWith('task.md', []);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ snapshot });
    expect(execute.mock.calls[0]?.[1]).toMatchObject({ caller: invocation.caller });
    expect(release).toHaveBeenCalledOnce();
  });

  it('switches from an established remote caller to a distinct requested host', async () => {
    const original = parseRemoteAddress('devbox');
    const target = parseRemoteAddress('build-box');
    if ('error' in original || 'error' in target) throw new Error('Invalid test remote host.');
    const currentChannel = { attached: true } as RemoteChannel;
    const targetChannel = { attached: true, resolveAgentSnapshot: vi.fn(async () => ({
      taskPath: '/build/project/task.md', taskText: 'Target task.', skills: [], grants: [],
    })) } as unknown as RemoteChannel;
    vi.spyOn(managers.remote, 'addressOf').mockReturnValue(original);
    vi.spyOn(managers.remote, 'get').mockReturnValue(currentChannel);
    vi.spyOn(managers.remote, 'workspaceOf').mockReturnValue('/dev/project');
    vi.spyOn(managers.remote, 'create').mockReturnValue(targetChannel);
    vi.spyOn(managers.remote, 'readyOf').mockReturnValue(Promise.resolve('/build/project'));
    vi.spyOn(managers.remote, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));
    vi.spyOn(managers.remote, 'release').mockReturnValue(true);
    execute.mockResolvedValue({ status: 'completed', response: 'Done.', cleanupWarnings: [] });

    await expect(run('agent on build-box execute task.md')).resolves.toMatchObject({ status: 'completed' });

    expect(managers.remote.create).toHaveBeenCalledWith(
      expect.stringMatching(/^agent-/), target, workspace, expect.any(Object), undefined, { nonInteractive: true },
    );
    expect(targetChannel.resolveAgentSnapshot).toHaveBeenCalledOnce();
  });

  it('does not borrow a matching host reached through a different SSH user', async () => {
    const established = parseRemoteAddress('admin@build-box');
    const requested = parseRemoteAddress('build-box');
    if ('error' in established || 'error' in requested) throw new Error('Invalid test remote host.');
    const currentChannel = { attached: true } as RemoteChannel;
    const targetChannel = { attached: true, resolveAgentSnapshot: vi.fn(async () => ({
      taskPath: '/build/project/task.md', taskText: 'Target task.', skills: [], grants: [],
    })) } as unknown as RemoteChannel;
    vi.spyOn(managers.remote, 'addressOf').mockReturnValue(established);
    vi.spyOn(managers.remote, 'get').mockReturnValue(currentChannel);
    vi.spyOn(managers.remote, 'workspaceOf').mockReturnValue('/build/project');
    vi.spyOn(managers.remote, 'liveEntries').mockReturnValue([
      establishedRemoteEntry(established.destination, currentChannel, '/build/project'),
    ]);
    vi.spyOn(managers.remote, 'create').mockReturnValue(targetChannel);
    vi.spyOn(managers.remote, 'readyOf').mockReturnValue(Promise.resolve('/build/project'));
    vi.spyOn(managers.remote, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));
    vi.spyOn(managers.remote, 'release').mockReturnValue(true);
    execute.mockResolvedValue({ status: 'completed', response: 'Done.', cleanupWarnings: [] });

    await expect(run('agent on build-box execute task.md')).resolves.toMatchObject({ status: 'completed' });

    expect(managers.remote.create).toHaveBeenCalledWith(
      expect.stringMatching(/^agent-/), requested, workspace, expect.any(Object), undefined, { nonInteractive: true },
    );
    expect(currentChannel.resolveAgentSnapshot).toBeUndefined();
  });

  it('does not borrow a default-user workspace for a user-qualified destination', async () => {
    const established = parseRemoteAddress('build-box');
    const requested = parseRemoteAddress('admin@build-box');
    if ('error' in established || 'error' in requested) throw new Error('Invalid test remote host.');
    const currentChannel = { attached: true } as RemoteChannel;
    const targetChannel = { attached: true, resolveAgentSnapshot: vi.fn(async () => ({
      taskPath: '/build/project/task.md', taskText: 'Target task.', skills: [], grants: [],
    })) } as unknown as RemoteChannel;
    vi.spyOn(managers.remote, 'liveEntries').mockReturnValue([
      establishedRemoteEntry(established.destination, currentChannel, '/build/project'),
    ]);
    vi.spyOn(managers.remote, 'create').mockReturnValue(targetChannel);
    vi.spyOn(managers.remote, 'readyOf').mockReturnValue(Promise.resolve('/build/project'));
    vi.spyOn(managers.remote, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));
    vi.spyOn(managers.remote, 'release').mockReturnValue(true);
    execute.mockResolvedValue({ status: 'completed', response: 'Done.', cleanupWarnings: [] });

    await expect(run('agent on admin@build-box execute task.md')).resolves.toMatchObject({ status: 'completed' });

    expect(managers.remote.create).toHaveBeenCalledWith(
      expect.stringMatching(/^agent-/), requested, workspace, expect.any(Object), undefined, { nonInteractive: true },
    );
    expect(currentChannel.resolveAgentSnapshot).toBeUndefined();
  });

  it('borrows an established workspace with the exact full SSH destination', async () => {
    const established = parseRemoteAddress('admin@build-box');
    if ('error' in established) throw new Error(established.error);
    const channel = { attached: true, resolveAgentSnapshot: vi.fn(async () => ({
      taskPath: '/build/project/task.md', taskText: 'Target task.', skills: [], grants: [],
    })) } as unknown as RemoteChannel;
    const lease = vi.fn(async () => {});
    vi.spyOn(managers.remote, 'liveEntries').mockReturnValue([
      establishedRemoteEntry(established.destination, channel, '/build/project'),
    ]);
    vi.spyOn(managers.remote, 'create').mockReturnValue(channel);
    vi.spyOn(managers.remote, 'get').mockReturnValue(channel);
    vi.spyOn(managers.remote, 'workspaceOf').mockReturnValue('/build/project');
    vi.spyOn(managers.remote, 'acquireAgentLease').mockReturnValue(lease);
    execute.mockResolvedValue({ status: 'completed', response: 'Done.', cleanupWarnings: [] });

    await expect(run('agent on admin@build-box execute task.md')).resolves.toMatchObject({ status: 'completed' });

    expect(managers.remote.create).not.toHaveBeenCalled();
    expect(channel.resolveAgentSnapshot).toHaveBeenCalledOnce();
    expect(lease).toHaveBeenCalledOnce();
  });

  it('provisions a run-only target when the selector includes an explicit project path', async () => {
    const established = parseRemoteAddress('admin@build-box');
    const requested = parseRemoteAddress('admin@build-box:/other/project');
    if ('error' in established || 'error' in requested) throw new Error('Invalid test remote host.');
    const currentChannel = { attached: true } as RemoteChannel;
    const targetChannel = { attached: true, resolveAgentSnapshot: vi.fn(async () => ({
      taskPath: '/other/project/task.md', taskText: 'Target task.', skills: [], grants: [],
    })) } as unknown as RemoteChannel;
    vi.spyOn(managers.remote, 'liveEntries').mockReturnValue([
      establishedRemoteEntry(established.destination, currentChannel, '/build/project'),
    ]);
    vi.spyOn(managers.remote, 'create').mockReturnValue(targetChannel);
    vi.spyOn(managers.remote, 'readyOf').mockReturnValue(Promise.resolve('/other/project'));
    vi.spyOn(managers.remote, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));
    vi.spyOn(managers.remote, 'release').mockReturnValue(true);
    execute.mockResolvedValue({ status: 'completed', response: 'Done.', cleanupWarnings: [] });

    await expect(run('agent on admin@build-box:/other/project execute task.md')).resolves.toMatchObject({ status: 'completed' });

    expect(managers.remote.create).toHaveBeenCalledWith(
      expect.stringMatching(/^agent-/), requested, workspace, expect.any(Object), undefined, { nonInteractive: true },
    );
    expect(currentChannel.resolveAgentSnapshot).toBeUndefined();
  });

  it('fails an unavailable remote target without falling back to local execution', async () => {
    const channel = { attached: false } as RemoteChannel;
    vi.spyOn(managers.remote, 'create').mockReturnValue(channel);
    vi.spyOn(managers.remote, 'readyOf').mockReturnValue(Promise.reject(new Error('SSH target unavailable.')));
    const release = vi.spyOn(managers.remote, 'release').mockReturnValue(true);

    await expect(run('agent on missing-host execute task.md')).resolves.toMatchObject({
      status: 'failed', response: 'Agent: SSH target unavailable.',
    });

    expect(release).toHaveBeenCalledOnce();
    expect(managers.workspace.create).not.toHaveBeenCalled();
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
