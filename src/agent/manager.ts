import { randomUUID } from 'node:crypto';
import type { Tab } from '../tab/types.js';
import { tabRuntime } from '../tab/runtime.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { AgentRun, copyAgentCaller, type AgentOutcome, type AgentRunOptions } from './run.js';
import type { AgentRunView } from './types.js';

export class AgentRunManager {
  readonly runs = new Map<string, AgentRun>();
  private disposed = false;
  private pendingViews = new Map<string, AgentRunView>();
  private flushScheduled = false;

  constructor(private managers: Managers) {}

  captureCaller(tab: Tab): AgentRunOptions['caller'] {
    const runtime = tabRuntime(tab);
    runtime.incarnation ??= randomUUID();
    if (runtime.closing) throw new Error(`Agent caller is closing: ${tab.label}`);
    return copyAgentCaller({
      label: tab.label,
      incarnation: runtime.incarnation,
      cwd: runtime.cwd ?? this.managers.tab.launchDir,
      context: runtime.context,
    });
  }

  create(options: AgentRunOptions): AgentRun {
    if (this.disposed) throw new Error('Agent run manager is disposed.');
    const callerTab = this.managers.tab.tabs.find((tab) => tab.label === options.caller.label);
    if (!callerTab || callerTab.runtime?.incarnation !== options.caller.incarnation || callerTab.runtime.closing) {
      throw new Error(`Agent caller is stale: ${options.caller.label}`);
    }
    const releaseWorkspace = options.releaseWorkspace ?? (options.workspaceDir === undefined
      ? undefined
      : this.managers.workspace.acquireAgentLease(options.workspaceDir));
    const run = new AgentRun(copyAgentCaller(options.caller), options.snapshot, releaseWorkspace, {
      command: options.command ?? `agent execute ${options.snapshot.taskPath.split('/').at(-1) ?? options.snapshot.taskPath}`,
      model: options.model ?? '',
      effort: options.effort ?? 'medium',
      host: 'Local',
      workspace: options.executionDir ?? options.caller.cwd,
    }, options.executionDir ?? options.caller.cwd);
    this.runs.set(run.id, run);
    run.subscribe((view) => {
      for (const label of run.monitorIds) this.pendingViews.set(label, view);
      if (this.flushScheduled) return;
      this.flushScheduled = true;
      queueMicrotask(() => {
        this.flushScheduled = false;
        for (const [label, latest] of this.pendingViews) {
          messageBus.emit('agent', { type: 'run-updated', tab: label, view: latest });
        }
        this.pendingViews.clear();
      });
    });
    return run;
  }

  closeCaller(tab: Tab): void {
    const incarnation = tab.runtime?.incarnation;
    if (!incarnation) return;
    for (const run of this.runs.values()) {
      if (run.caller.label === tab.label && run.caller.incarnation === incarnation) {
        void this.finish(run.id, 'terminated').catch(() => {});
      }
    }
  }

  attachMonitor(runId: string, monitorId: string): void {
    this.requireRun(runId).attachMonitor(monitorId);
    messageBus.emit('state', { type: 'dirty' });
  }

  closeMonitor(monitorId: string): void {
    for (const [id, run] of this.runs) {
      run.detachMonitor(monitorId);
      if (run.outcome && run.monitorIds.size === 0) this.runs.delete(id);
    }
  }

  async finish(runId: string, outcome: AgentOutcome): Promise<void> {
    const run = this.requireRun(runId);
    try {
      await run.finish(outcome);
    } finally {
      if (this.runs.get(runId) === run && run.monitorIds.size === 0) this.runs.delete(runId);
    }
  }

  dispose(): void | Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.runs.size === 0) return;
    return (async () => {
      const results = await Promise.allSettled([...this.runs.keys()].map((id) => this.finish(id, 'terminated')));
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      this.runs.clear();
      if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason), 'Agent run shutdown failed.');
    })();
  }

  private requireRun(id: string): AgentRun {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Agent run not found: ${id}`);
    return run;
  }
}
