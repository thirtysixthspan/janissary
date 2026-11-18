import { randomUUID } from 'node:crypto';
import { AGENT_CLONE_DEPTH, workspaceCloneOptions } from '../workspace/clone-depth.js';
import { workspacePath } from '../workspace/index.js';
import type { ProvisioningWorkspace, WorkspaceManager } from '../workspace/manager.js';
import { deferred } from '../deferred.js';
import type { AgentRun } from './run.js';
import type { AgentWorkspace } from './workspace-types.js';

export type FreshAgentWorkspace = AgentWorkspace & {
  start(run: AgentRun): void;
};

export function prepareFreshAgentWorkspace(workspace: WorkspaceManager): FreshAgentWorkspace {
  const name = `agent-${randomUUID()}`;
  const dir = workspacePath(name);
  const readiness = deferred<void>();
  void readiness.promise.catch(() => { /* observed here; consumers may attach a handler later */ });

  let settled = false;
  let started = false;
  let cancelRequested = false;
  let cancelDone = false;
  let released = false;
  let created: ProvisioningWorkspace | undefined;
  let releaseLease: (() => Promise<void>) | undefined;
  let creatorRefHeld = false;

  function resolveReadiness(): void {
    if (settled) return;
    settled = true;
    readiness.resolve();
  }

  function rejectReadiness(error: unknown): void {
    if (settled) return;
    settled = true;
    readiness.reject(error);
  }

  function cancel(): void {
    if (cancelDone) return;
    cancelDone = true;
    if (created) {
      if (created.cancel) created.cancel();
      else workspace.cancel(name);
      return;
    }
    cancelRequested = true;
    workspace.cancel(name);
    rejectReadiness(new Error('git clone cancelled.'));
  }

  async function releaseOwned(): Promise<void> {
    if (released) return;
    released = true;
    if (releaseLease) {
      await releaseLease();
      return;
    }
    if (created && creatorRefHeld) {
      creatorRefHeld = false;
      workspace.release(created.dir);
    }
  }

  async function waitReadiness(): Promise<void> {
    try {
      await (created ? created.ready : readiness.promise);
    } catch { /* provisioning failure is the run result, not a cleanup warning */ }
  }

  async function provisionCleanup(): Promise<void> {
    try {
      try { cancel(); } finally { await waitReadiness(); }
    } finally {
      await releaseOwned();
    }
  }

  async function startup(run: AgentRun, endAllocation: () => void): Promise<void> {
    if (cancelRequested || run.outcome) {
      rejectReadiness(new Error('git clone cancelled.'));
      endAllocation();
      return;
    }
    let handle: ProvisioningWorkspace | { error: string };
    try {
      handle = workspace.create(name, undefined, workspaceCloneOptions(AGENT_CLONE_DEPTH));
    } catch (error) {
      rejectReadiness(error);
      endAllocation();
      return;
    }
    if ('error' in handle) {
      rejectReadiness(new Error(handle.error));
      endAllocation();
      return;
    }
    created = handle;
    creatorRefHeld = true;
    void (async () => {
      try {
        await handle.ready;
        resolveReadiness();
      } catch (error) {
        rejectReadiness(error);
      }
    })();
    try {
      releaseLease = workspace.acquireAgentLease(handle.dir);
    } catch (error) {
      rejectReadiness(error);
      endAllocation();
      return;
    }
    workspace.release(handle.dir);
    creatorRefHeld = false;
    endAllocation();
  }

  function start(run: AgentRun): void {
    if (started) return;
    started = true;
    const endAllocation = run.beginAllocation();
    if (!endAllocation) {
      rejectReadiness(new Error('git clone cancelled.'));
      return;
    }
    run.addResource('workspace-provision', provisionCleanup);
    queueMicrotask(() => { void startup(run, endAllocation); });
  }

  return { dir, ready: readiness.promise, cancel, release: releaseOwned, start };
}
