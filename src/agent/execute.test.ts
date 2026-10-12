import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { AcpOptions } from '../acp/types.js';
import type { CommandInvocationContext } from '../commands/types.js';
import { modelsFor } from '../harness/models.js';
import { janissaryRoot } from '../janissary-root.js';
import { AgentRun } from './run.js';
import type { AgentSnapshot } from './types.js';

const { connectAcp, runAcpToolLoop } = vi.hoisted(() => ({ connectAcp: vi.fn(), runAcpToolLoop: vi.fn() }));
vi.mock('../acp/index.js', () => ({ connectAcp }));
vi.mock('../acp/loop.js', () => ({ runAcpToolLoop }));

const { executeAgentRun } = await import('./execute.js');

describe('executeAgentRun', () => {
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
