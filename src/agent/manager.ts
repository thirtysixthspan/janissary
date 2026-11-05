import { randomUUID } from 'node:crypto';
import type { Tab } from '../tab/types.js';
import { tabRuntime } from '../tab/runtime.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { AgentRun, copyAgentCaller, type AgentOutcome, type AgentRunOptions } from './run.js';
import type { AgentRunView } from './types.js';
import { selectedModel } from './model.js';
import { AgentRecordFeed, validateAgentRecordMetadata } from './record-feed.js';

export class AgentRunManager {
  readonly runs = new Map<string, AgentRun>();
  private knownRunIds = new Set<string>();
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
      ownerName: tab.title ?? tab.label,
      incarnation: runtime.incarnation,
      cwd: this.managers.tab.workingDirOf(tab.label),
      context: runtime.context,
    });
  }

  create(options: AgentRunOptions): AgentRun {
    if (this.disposed) throw new Error('Agent run manager is disposed.');
    const callerTab = this.managers.tab.tabs.find((tab) => tab.label === options.caller.label);
    if (!callerTab || callerTab.runtime?.incarnation !== options.caller.incarnation || callerTab.runtime.closing) {
      throw new Error(`Agent caller is stale: ${options.caller.label}`);
    }
    const model = options.model ?? selectedModel(undefined);
    const metadata = validateAgentRecordMetadata({
      model, taskPath: options.snapshot.taskPath, ownerLabel: options.caller.label,
      ownerName: options.caller.ownerName ?? callerTab.title ?? callerTab.label,
      ...(options.executionHost !== undefined && { host: options.executionHost }),
    });
    const releaseWorkspace = options.releaseWorkspace ?? (options.workspaceDir === undefined
      ? undefined
      : this.managers.workspace.acquireAgentLease(options.workspaceDir));
    const run = new AgentRun(copyAgentCaller(options.caller), options.snapshot, releaseWorkspace, {
      command: options.command ?? `agent execute ${options.snapshot.taskPath.split('/').at(-1) ?? options.snapshot.taskPath}`,
      model,
      effort: options.effort ?? 'medium',
      host: options.executionHost ?? 'Local',
      workspace: options.executionWorkspace ?? options.executionDir ?? options.caller.cwd,
    }, options.executionDir ?? options.caller.cwd);
    run.record = new AgentRecordFeed(this.managers.acpRecords, metadata, run.id);
    this.runs.set(run.id, run);
    this.knownRunIds.add(run.id);
    messageBus.emit('state', { type: 'dirty' });
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
    const starting = run.outcome === undefined;
    try {
      const finishing = run.finish(outcome);
      if (starting) messageBus.emit('state', { type: 'dirty' });
      await finishing;
    } finally {
      if (this.runs.get(runId) === run && run.monitorIds.size === 0) this.runs.delete(runId);
    }
  }

  trackCreatedTab(runId: string, label: string): void {
    const run = this.runs.get(runId);
    const tab = this.managers.tab.byLabel(label);
    if (!run || !tab) return;
    const runtime = tabRuntime(tab);
    runtime.incarnation ??= randomUUID();
    const incarnation = runtime.incarnation;
    run.addCreatedTab(label, async () => {
      const index = this.managers.tab.findIndex(label);
      if (index === -1 || this.managers.tab.tabs[index]?.runtime?.incarnation !== incarnation) return;
      await this.managers.tab.closeTab(index);
    });
  }

  beginAllocation(runId: string): (() => void) | undefined {
    return this.runs.get(runId)?.beginAllocation();
  }

  isLive(runId: string): boolean {
    const run = this.runs.get(runId);
    return run !== undefined && run.outcome === undefined;
  }

  isAgentRun(runId: string): boolean {
    return this.knownRunIds.has(runId);
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
