import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { AcpOptions } from '../acp/types.js';
import type { CommandInvocationContext } from '../commands/types.js';
import { modelsFor } from '../harness/models.js';
import { janissaryRoot } from '../janissary-root.js';
import { AgentRun } from './run.js';
import type { AgentSnapshot } from './types.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import type { AcpSessionListener } from '../remote/channel/acp.js';
import { NotificationQueue } from '../notifications/queue.js';

const { connectAcp, runAcpToolLoop, sandboxWillConfine } = vi.hoisted(() => ({
  connectAcp: vi.fn(), runAcpToolLoop: vi.fn(), sandboxWillConfine: vi.fn(() => true),
}));
vi.mock('../acp/index.js', () => ({ connectAcp }));
vi.mock('../acp/loop.js', () => ({ runAcpToolLoop }));
vi.mock('../sandbox/confinement.js', () => ({ sandboxWillConfine }));

const { executeAgentRun } = await import('./execute.js');

function notificationManagers() {
  const callerTab = { label: 'janus', view: 'harness', log: [] as { output: string }[] };
  const feed = { label: 'notifications', view: 'notifications', log: [] as { output: string }[] };
  const managers = {
    tab: {
      tabs: [callerTab, feed],
      cur: () => feed,
      byLabel: (label: string) => label === callerTab.label ? callerTab : undefined,
      append: (label: string, entry: { output: string }) => {
        if (label === feed.label) feed.log.push(entry);
      },
    },
    notifications: new NotificationQueue(),
  };
  return { managers, callerTab, feed };
}

describe('executeAgentRun', () => {
  it.each([false, true])('reports the local confinement result: %s', async (sandboxed) => {
    sandboxWillConfine.mockReturnValue(sandboxed);
    const { managers, callerTab, feed } = notificationManagers();
    connectAcp.mockReturnValue({ prompt: vi.fn(), kill: vi.fn() });
    runAcpToolLoop.mockImplementation((_session, _prompt, _dependencies, handlers) => {
      handlers.endTurn('Finished.');
      handlers.finished('answered', Infinity);
    });
    const model = modelsFor('opencode')[0];
    if (!model) throw new Error('No OpenCode model is available for this test.');
    const caller = { label: 'janus', incarnation: 'caller-1', cwd: '/source', context: [] };
    const run = new AgentRun(caller, { taskPath: '/clone/task.md', taskText: 'Task', skills: [], grants: [] }, undefined, undefined, '/clone');
    const invocation: CommandInvocationContext = {
      runId: run.id, invocationId: 'invocation-1', caller, signal: run.abortController.signal,
    };

    await expect(executeAgentRun(run, invocation, model, undefined, '', managers as never)).resolves.toMatchObject({
      status: 'completed', response: 'Finished.',
    });
    await run.finish('completed');

    expect(sandboxWillConfine).toHaveBeenCalledWith('/clone');
    expect(managers.notifications.all.map(({ message }) => message)).toEqual(
      sandboxed ? [] : ['Agent: sandboxing is disabled.'],
    );
    expect(feed.log.map(({ output }) => output)).toEqual(sandboxed ? [] : ['Agent: sandboxing is disabled.']);
    expect(callerTab.log).toEqual([]);
    expect(run.view().activity.some(({ text }) => text.includes('sandboxing is disabled'))).toBe(false);
  });

  it.each([false, true])('uses remote readiness confinement state: %s', async (sandboxed) => {
    runAcpToolLoop.mockClear();
    sandboxWillConfine.mockClear();
    let listener: AcpSessionListener | undefined;
    const channel = {
      attachAcp: (_id: string, value: AcpSessionListener) => { listener = value; },
      detachAcp: vi.fn(),
      send: (frame: { type: string }) => {
        if (frame.type === 'acp-close') listener?.onClosed(true);
      },
    } as unknown as RemoteChannel;
    runAcpToolLoop.mockImplementation((_session, _prompt, _dependencies, handlers) => {
      handlers.endTurn('Finished.');
      handlers.finished('answered', Infinity);
    });
    const model = modelsFor('opencode')[0];
    if (!model) throw new Error('No OpenCode model is available for this test.');
    const caller = { label: 'janus', incarnation: 'caller-1', cwd: '/source', context: [] };
    const run = new AgentRun(caller, { taskPath: '/remote/task.md', taskText: 'Task', skills: [], grants: [] });
    const { managers, callerTab, feed } = notificationManagers();
    const invocation: CommandInvocationContext = {
      runId: run.id, invocationId: 'invocation-1', caller, signal: run.abortController.signal,
    };
    const execution = executeAgentRun(run, invocation, model, undefined, '', managers as never, { channel });

    await vi.waitFor(() => expect(listener).toBeDefined());
    listener?.onReady(sandboxed);
    await expect(execution).resolves.toMatchObject({ status: 'completed', response: 'Finished.' });
    await run.finish('completed');

    expect(managers.notifications.all.map(({ message }) => message)).toEqual(
      sandboxed ? [] : ['Agent: sandboxing is disabled.'],
    );
    expect(feed.log.map(({ output }) => output)).toEqual(sandboxed ? [] : ['Agent: sandboxing is disabled.']);
    expect(callerTab.log).toEqual([]);
    expect(run.view().activity.some(({ text }) => text.includes('sandboxing is disabled'))).toBe(false);
    expect(sandboxWillConfine).not.toHaveBeenCalled();
  });

  it('starts local ACP in the execution workspace while retaining caller context', async () => {
    const kill = vi.fn();
    connectAcp.mockReturnValue({ prompt: vi.fn(), kill });
    runAcpToolLoop.mockImplementation((_session, _prompt, _dependencies, handlers) => {
      handlers.endTurn('Finished.');
      handlers.finished('answered', Infinity);
    });
    const model = modelsFor('opencode')[0];
    if (!model) throw new Error('No OpenCode model is available for this test.');
    const snapshot: AgentSnapshot = { taskPath: '/clone/ai/tasks/task.md', taskText: 'Task', skills: [], grants: [] };
    const caller = { label: 'janus', incarnation: 'caller-1', cwd: '/source', context: [] };
    const run = new AgentRun(caller, snapshot, undefined, undefined, '/clone');
    const invocation: CommandInvocationContext = {
      runId: run.id, invocationId: 'invocation-1', caller, signal: run.abortController.signal,
    };

    await expect(executeAgentRun(run, invocation, model, undefined, '', {} as never)).resolves.toMatchObject({
      status: 'completed', response: 'Finished.',
    });
    expect(connectAcp).toHaveBeenCalledWith(expect.objectContaining({
      cwd: '/clone',
      workspaceDir: '/clone',
    } satisfies Partial<AcpOptions>));
    expect(run.caller.cwd).toBe('/source');
    await run.finish('completed');
    expect(kill).toHaveBeenCalledOnce();
  });

  it('passes only selected installed skill directories to local ACP', async () => {
    const skillFile = path.join(janissaryRoot(), 'skills', 'ask-user', 'SKILL.md');
    connectAcp.mockReturnValue({ prompt: vi.fn(), kill: vi.fn() });
    runAcpToolLoop.mockImplementation((_session, _prompt, _dependencies, handlers) => {
      handlers.endTurn('Finished.');
      handlers.finished('answered', Infinity);
    });
    const model = modelsFor('opencode')[0];
    if (!model) throw new Error('No OpenCode model is available for this test.');
    const snapshot: AgentSnapshot = {
      taskPath: '/clone/ai/tasks/task.md',
      taskText: 'Task',
      skills: [
        { source: 'janissary', name: 'ask-user', path: skillFile, instructions: 'Ask' },
        { source: 'project', name: 'project-skill', path: '/clone/skills/project-skill/SKILL.md', instructions: 'Project' },
        { source: 'janissary', name: 'outside', path: '/etc/passwd', instructions: 'Outside' },
      ],
      grants: [],
    };
    const caller = { label: 'janus', incarnation: 'caller-1', cwd: '/source', context: [] };
    const run = new AgentRun(caller, snapshot, undefined, undefined, '/clone');
    const invocation: CommandInvocationContext = {
      runId: run.id, invocationId: 'invocation-1', caller, signal: run.abortController.signal,
    };

    await executeAgentRun(run, invocation, model, undefined, '', {} as never);

    expect(connectAcp).toHaveBeenCalledWith(expect.objectContaining({
      installedSkillDirs: [path.dirname(skillFile)],
    } satisfies Partial<AcpOptions>));
    await run.finish('completed');
  });
});
