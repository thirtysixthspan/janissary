import { randomUUID } from 'node:crypto';
import type { WorkspaceManager } from '../workspace/manager.js';
import type { AgentCaller, AgentRun } from './run.js';
import type { AgentSnapshot } from './types.js';
import type { Managers } from '../managers.js';

export type AgentWorkspace = Readonly<{
  dir: string;
  ready: Promise<void>;
  cancel(): void;
  release(): Promise<void>;
}>;

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
  const created = workspace.create(name);
  if ('error' in created) throw new Error(created.error);
  const release = workspace.acquireAgentLease(created.dir);
  workspace.release(created.dir);
  return { dir: created.dir, ready: created.ready, cancel: () => workspace.cancel(name), release };
}

export async function startLocalAgentRun(
  managers: Managers,
  caller: AgentCaller,
  command: string,
  model: string | undefined,
  effort: string | undefined,
  workspaceName?: string,
): Promise<{ run: AgentRun; workspace: AgentWorkspace }> {
  const workspace = prepareAgentWorkspace(managers.workspace, caller.cwd, workspaceName);
  const placeholder: AgentSnapshot = { taskPath: '', taskText: '', skills: [], grants: [] };
  try {
    const run = managers.agent.create({
      caller,
      snapshot: placeholder,
      executionDir: workspace.dir,
      executionWorkspace: workspace.dir,
      releaseWorkspace: workspace.release,
      command,
      model,
      effort,
    });
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
