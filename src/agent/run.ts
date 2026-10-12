import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';
import type { AgentRunView, AgentSnapshot } from './types.js';

export type AgentOutcome = 'completed' | 'failed' | 'terminated';
export type AgentCaller = Readonly<{
  label: string;
  incarnation: string;
  cwd: string;
  context: readonly string[];
}>;
export type AgentRunOptions = Readonly<{
  caller: AgentCaller;
  snapshot: AgentSnapshot;
  workspaceDir?: string;
  executionDir?: string;
  executionHost?: string;
  executionWorkspace?: string;
  releaseWorkspace?: () => Promise<void>;
  command?: string;
  model?: string;
  effort?: string;
}>;

function immutableSnapshot(snapshot: AgentSnapshot): AgentSnapshot {
  return Object.freeze({
    ...snapshot,
    skills: Object.freeze(snapshot.skills.map((skill) => Object.freeze({ ...skill }))),
    grants: Object.freeze([...snapshot.grants]),
  });
}

export class AgentRun {
  readonly id = randomUUID();
  readonly abortController = new AbortController();
  readonly childIds = new Set<string>();
  readonly monitorIds = new Set<string>();
  readonly createdTabs = new Set<string>();
  outcome?: AgentOutcome;
  private revision = 0;
  private status: AgentRunView['status'] = 'Running';
  private response?: string;
  private activity: { id: number; kind: string; text: string }[] = [];
  private listeners = new Set<(view: AgentRunView) => void>();
  private cleanupPromise?: Promise<void>;
  private cleanups: (() => void | Promise<void>)[] = [];
  private currentSnapshot: AgentSnapshot;

  constructor(
    readonly caller: AgentCaller,
    snapshot: AgentSnapshot,
    private releaseWorkspace?: () => Promise<void>,
    private readonly metadata: { command: string; model: string; effort: string; host: string; workspace: string } = {
      command: `agent execute ${snapshot.taskPath.split('/').at(-1) ?? snapshot.taskPath}`,
      model: '', effort: 'medium', host: 'Local', workspace: caller.cwd,
    },
    readonly executionDir: string = caller.cwd,
  ) {
    this.currentSnapshot = immutableSnapshot(snapshot);
  }

  get snapshot(): AgentSnapshot {
    return this.currentSnapshot;
  }

  setSnapshot(snapshot: AgentSnapshot): void {
    if (this.outcome) throw new Error('Agent run has already ended.');
    this.currentSnapshot = immutableSnapshot(snapshot);
  }

  get currentStatus(): AgentRunView['status'] {
    return this.status;
  }

  view(): AgentRunView {
    return {
      id: this.id,
      revision: this.revision,
      task: this.snapshot.taskPath.split('/').at(-1) ?? this.snapshot.taskPath,
      ...this.metadata,
      status: this.status,
      activity: this.activity,
      ...(this.response !== undefined && { response: this.response }),
    };
  }

  subscribe(listener: (view: AgentRunView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setStatus(status: AgentRunView['status'], response?: string): void {
    if (this.status === status && (response === undefined || this.response === response)) return;
    this.status = status;
    if (response !== undefined) this.response = response;
    this.publish();
  }

  reportActivity(kind: string, text: string): void {
    if (!text.trim()) return;
    this.activity.push({ id: this.activity.length + 1, kind, text });
    if (this.activity.length > getConfig().transcriptMaxLines) this.activity.shift();
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    const view = this.view();
    for (const listener of this.listeners) listener(view);
  }

  addResource(id: string, cleanup: () => void | Promise<void>): void {
    if (this.outcome) {
      let cleanupResult: void | Promise<void>;
      try {
        cleanupResult = cleanup();
      } catch {
        cleanupResult = Promise.resolve();
      }
      void Promise.resolve(cleanupResult).catch(() => {});
      throw new Error('Agent run has already ended.');
    }
    this.childIds.add(id);
    this.cleanups.push(cleanup);
  }

  addCreatedTab(label: string, cleanup: () => void | Promise<void>): void {
    if (this.createdTabs.has(label)) return;
    this.createdTabs.add(label);
    this.addResource(`tab:${label}`, cleanup);
  }

  attachMonitor(id: string): void {
    if (this.outcome) throw new Error('Agent run has already ended.');
    this.monitorIds.add(id);
  }

  detachMonitor(id: string): void {
    this.monitorIds.delete(id);
  }

  finish(outcome: AgentOutcome): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise;
    this.outcome = outcome;
    this.setStatus(outcome === 'completed' ? 'Completed' : outcome === 'failed' ? 'Failed' : 'Terminated');
    if (outcome === 'terminated') this.abortController.abort();
    this.cleanupPromise = this.cleanup();
    return this.cleanupPromise;
  }

  private async cleanup(): Promise<void> {
    const failures: unknown[] = [];
    const cleanups = this.cleanups;
    this.cleanups = [];
    for (const cleanup of cleanups) {
      try { await cleanup(); } catch (error) { failures.push(error); }
    }
    if (this.releaseWorkspace) {
      try { await this.releaseWorkspace(); } catch (error) { failures.push(error); }
    }
    this.childIds.clear();
    this.createdTabs.clear();
    this.listeners.clear();
    if (failures.length > 0) throw new AggregateError(failures, `Agent run ${this.id} cleanup failed.`);
  }
}

export function copyAgentCaller(caller: AgentCaller): AgentCaller {
  return Object.freeze({ ...caller, context: Object.freeze([...caller.context]) });
}
