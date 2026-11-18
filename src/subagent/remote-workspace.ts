import type { Managers } from '../managers.js';
import type { AgentRun } from '../agent/run.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { deferred } from '../deferred.js';
import type { SubagentExecutionResult } from './execute.js';

export type RemoteSubagentWorkspace = Readonly<{
  readonly ready: Promise<string>;
  start(run: AgentRun): void;
  cancel(): void;
  trackExecution(operation: () => Promise<SubagentExecutionResult>): Promise<SubagentExecutionResult>;
  release(): Promise<void>;
}>;

export function prepareRemoteSubagentWorkspace(
  managers: Managers,
  channel: RemoteChannel,
  leaseLabel: string,
): RemoteSubagentWorkspace {
  const readiness = deferred<string>();
  void readiness.promise.catch(() => {});

  let started = false;
  let cancelled = false;
  let settled = false;
  let allocationEnded = false;
  let endAllocation: (() => void) | undefined;
  let cloneLabel = '';
  let leaseRelease: (() => Promise<void>) | undefined;
  let cloneRequested = false;
  let cloneCreate: Promise<string | undefined> | undefined;
  let cloneRelease: Promise<unknown> | undefined;
  let dir: string | undefined;
  let executionAdmitted = false;
  const executionBarrier = deferred<boolean>();
  void executionBarrier.promise.catch(() => {});
  let releasePromise: Promise<void> | undefined;

  const ended = (run: AgentRun): boolean =>
    cancelled || run.outcome !== undefined || run.abortController.signal.aborted;
  const stale = (): boolean => managers.remote.get(leaseLabel) !== channel;

  function rejectReady(error: unknown): void {
    if (settled) return;
    settled = true;
    readiness.reject(error);
  }

  function resolveReady(directory: string): void {
    if (settled) return;
    settled = true;
    readiness.resolve(directory);
  }

  function finishAllocation(): void {
    if (allocationEnded) return;
    allocationEnded = true;
    endAllocation?.();
  }

  async function safeCloneRelease(): Promise<void> {
    try { await channel.runClone('release', cloneLabel); } catch { /* a lost channel leaves the clone to shutdown */ }
  }

  async function dropLease(): Promise<void> {
    const release = leaseRelease;
    leaseRelease = undefined;
    if (!release) return;
    try { await release(); } catch { /* a lost lease cannot be released twice */ }
  }

  async function doRelease(): Promise<void> {
    cancelled = true;
    try {
      if (cloneRequested && dir === undefined && !cloneRelease) cloneRelease = safeCloneRelease();
      const safe = executionAdmitted ? await executionBarrier.promise : true;
      if (cloneCreate) {
        try { await cloneCreate; } catch { /* clone failure is the run's completion fact */ }
      }
      if (cloneRelease) await cloneRelease;
      else if (dir !== undefined && safe) await (cloneRelease = safeCloneRelease());
    } finally {
      await dropLease();
    }
  }

  function release(): Promise<void> {
    return releasePromise ??= doRelease();
  }

  async function startup(run: AgentRun): Promise<void> {
    if (ended(run)) {
      rejectReady(new Error('git clone cancelled.'));
      finishAllocation();
      return;
    }
    if (stale()) {
      rejectReady(new Error('Remote connection unavailable.'));
      finishAllocation();
      return;
    }
    let lease: () => Promise<void>;
    try {
      lease = managers.remote.acquireAgentLease(leaseLabel, run.id);
    } catch (error) {
      rejectReady(error);
      finishAllocation();
      return;
    }
    leaseRelease = lease;
    if (ended(run) || stale()) {
      rejectReady(new Error(ended(run) ? 'git clone cancelled.' : 'Remote connection unavailable.'));
      finishAllocation();
      await dropLease();
      return;
    }
    let create: Promise<string | undefined>;
    try {
      create = channel.runClone('create', cloneLabel);
    } catch (error) {
      rejectReady(error);
      finishAllocation();
      await dropLease();
      return;
    }
    cloneCreate = create;
    cloneRequested = true;
    void create.catch(() => { /* observed immediately; readiness carries the failure */ });
    finishAllocation();

    try {
      const returned = await create;
      if (ended(run)) return;
      if (!returned) {
        rejectReady(new Error('Remote clone unavailable.'));
        return;
      }
      dir = returned;
      resolveReady(returned);
    } catch (error) {
      rejectReady(error);
    }
  }

  function start(run: AgentRun): void {
    if (started) return;
    started = true;
    cloneLabel = `subagent-${run.id}`;
    const allocation = run.beginAllocation();
    if (!allocation) {
      rejectReady(new Error('git clone cancelled.'));
      return;
    }
    endAllocation = allocation;
    run.addResource('remote-clone-provision', () => release());
    queueMicrotask(() => { void startup(run); });
  }

  function cancel(): void {
    if (cancelled) return;
    cancelled = true;
    if (started && !settled) rejectReady(new Error('git clone cancelled.'));
  }

  function trackExecution(operation: () => Promise<SubagentExecutionResult>): Promise<SubagentExecutionResult> {
    executionAdmitted = true;
    const promise = operation();
    void promise.then(
      (result) => { executionBarrier.resolve(result.cleanupWarnings.length === 0); },
      () => { executionBarrier.resolve(false); },
    );
    return promise;
  }

  return Object.freeze({ ready: readiness.promise, start, cancel, trackExecution, release });
}
