import { randomUUID } from 'node:crypto';
import { AGENT_CLONE_DEPTH, workspaceCloneOptions } from '../workspace/clone-depth.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import type { AgentCaller, AgentRun } from './run.js';
import type { AgentSnapshot } from './types.js';
import type { Managers } from '../managers.js';
import { prepareFreshAgentWorkspace } from './fresh-workspace.js';
import type { AgentWorkspace, LocalAgentRunOptions, LocalAgentRunStart } from './workspace-types.js';

export function prepareAgentWorkspace(workspace: WorkspaceManager, callerDir: string, workspaceName?: string): AgentWorkspace {
  if (workspaceName !== undefined) {
    const selected = workspace.acquireAgentWorkspace(workspaceName);
    if (!selected) throw new Error(`Agent: unknown workspace "${workspaceName}".`);
    return { dir: selected.dir, ready: selected.ready, cancel: () => {}, release: selected.release };
  }

  try {
    const release = workspace.acquireAgentLease(callerDir);
    return { dir: callerDir, ready: Promise.resolve(), cancel: () => {}, release };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Cannot borrow untracked workspace: ')) throw error;
  }

  const name = `agent-${randomUUID()}`;
  const created = workspace.create(name, undefined, workspaceCloneOptions(AGENT_CLONE_DEPTH));
  if ('error' in created) throw new Error(created.error);
  const release = workspace.acquireAgentLease(created.dir);
  workspace.release(created.dir);
  return {
    dir: created.dir, ready: created.ready,
    cancel: () => { if (created.cancel) created.cancel(); else workspace.cancel(name); },
    release,
  };
}

function createLocalAgentRun(
  managers: Managers,
  caller: AgentCaller,
  command: string,
  task: string,
  model: string | undefined,
  effort: string | undefined,
  workspace: AgentWorkspace,
  options: LocalAgentRunOptions,
): AgentRun {
  const placeholder: AgentSnapshot = { taskPath: task, taskText: '', skills: [], grants: [] };
  return managers.agent.create({
    caller,
    snapshot: placeholder,
    executionDir: workspace.dir,
    executionWorkspace: workspace.dir,
    releaseWorkspace: workspace.release,
    command,
    model,
    effort,
    ...(options.subagentRole !== undefined && { subagentRole: options.subagentRole }),
    ...(options.acpCaller !== undefined && { acpCaller: options.acpCaller }),
  });
}

async function startOrdinaryLocalAgentRun(
  managers: Managers,
  caller: AgentCaller,
  command: string,
  task: string,
  model: string | undefined,
  effort: string | undefined,
  options: LocalAgentRunOptions,
): Promise<LocalAgentRunStart> {
  const workspace = prepareAgentWorkspace(managers.workspace, caller.cwd, options.workspaceName);
  try {
    const run = createLocalAgentRun(managers, caller, command, task, model, effort, workspace, options);
    run.addResource('workspace-provision', async () => {
      workspace.cancel();
      try { await workspace.ready; } catch { /* provisioning errors are returned as the run result */ }
    });
    return { run, workspace };
  } catch (error) {
    workspace.cancel();
    try { await workspace.ready; } catch { /* provisioning failure keeps its original error */ }
    try { await workspace.release(); } catch { /* provisioning failure keeps its original error */ }
    throw error;
  }
}

export function startLocalAgentRun(
  managers: Managers,
  caller: AgentCaller,
  command: string,
  task: string,
  model: string | undefined,
  effort: string | undefined,
  options: LocalAgentRunOptions & { fresh: true },
): LocalAgentRunStart;
export function startLocalAgentRun(
  managers: Managers,
  caller: AgentCaller,
  command: string,
  task: string,
  model: string | undefined,
  effort: string | undefined,
  options?: LocalAgentRunOptions & { fresh?: false },
): Promise<LocalAgentRunStart>;
export function startLocalAgentRun(
  managers: Managers,
  caller: AgentCaller,
  command: string,
  task: string,
  model: string | undefined,
  effort: string | undefined,
  options: LocalAgentRunOptions,
): LocalAgentRunStart | Promise<LocalAgentRunStart>;
export function startLocalAgentRun(
  managers: Managers,
  caller: AgentCaller,
  command: string,
  task: string,
  model: string | undefined,
  effort: string | undefined,
  options: LocalAgentRunOptions = {},
): LocalAgentRunStart | Promise<LocalAgentRunStart> {
  if (options.fresh === true) {
    const workspace = prepareFreshAgentWorkspace(managers.workspace);
    let run: AgentRun;
    try {
      run = createLocalAgentRun(managers, caller, command, task, model, effort, workspace, options);
    } catch (error) {
      workspace.cancel();
      throw error;
    }
    workspace.start(run);
    return { run, workspace };
  }
  return startOrdinaryLocalAgentRun(managers, caller, command, task, model, effort, options);
}
