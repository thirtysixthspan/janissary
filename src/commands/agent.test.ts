import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentResult } from '../agent/execute.js';
import type { Managers } from '../managers.js';
import { createController } from '../controller.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import type { CommandInvocationContext } from './types.js';
import { command } from './agent.js';

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
let invocation: CommandInvocationContext;
let managers: Managers;

beforeEach(() => {
  workspace = mkdtempSync(path.join(os.tmpdir(), 'janissary-agent-command-'));
  mkdirSync(path.join(workspace, 'ai', 'tasks'), { recursive: true });
  writeFileSync(path.join(workspace, 'ai', 'tasks', 'task.md'), 'Do the work.');
  controller = createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} });
  const tab = seedRootTab(controller.managers.tab);
  tab.runtime!.cwd = workspace;
  managers = controller.managers;
  invocation = {
    runId: 'outer-run',
    invocationId: 'outer-invocation',
    caller: managers.agent.captureCaller(tab),
    signal: new AbortController().signal,
  };
  execute.mockReset();
});

afterEach(async () => {
  await controller.shutdown();
  rmSync(workspace, { recursive: true, force: true });
});

async function run(line = 'agent execute task.md'): Promise<AgentResult> {
  return await command.run(line, { label: 'janus', index: 0 }, managers, invocation) as AgentResult;
}

describe('agent command', () => {
  it('runs headlessly and returns the structured result after cleanup', async () => {
    execute.mockImplementation(async (_agentRun) => ({ status: 'completed', response: 'Finished.', cleanupWarnings: [] }));

    await expect(run()).resolves.toEqual({ status: 'completed', response: 'Finished.', cleanupWarnings: [] });
    expect(managers.tab.tabs).toHaveLength(1);
    expect(managers.agent.runs.size).toBe(0);
    expect(execute.mock.calls[0]?.[1]).toMatchObject({ runId: expect.any(String), caller: invocation.caller });
    expect(execute.mock.calls[0]?.[1]).toHaveProperty('signal', expect.any(AbortSignal));
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
    await Promise.resolve();
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

  it('rejects unsupported remote selectors in local execution', async () => {
    await expect(run('agent on build-box execute task.md')).resolves.toMatchObject({
      status: 'failed', response: 'Agent: remote hosts and named workspaces are not supported by local task execution.',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('routes malformed agent syntax to the launch parser', async () => {
    await expect(run('agent worker')).resolves.toEqual({
      status: 'failed', response: 'Agent: expected launch clause or final execute, got "worker".', cleanupWarnings: [],
    });
  });
});
