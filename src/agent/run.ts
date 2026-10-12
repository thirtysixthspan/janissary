import { randomUUID } from 'node:crypto';
import type { AgentSnapshot } from './types.js';

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
}>;

export class AgentRun {
  readonly id = randomUUID();
  readonly abortController = new AbortController();
  readonly childIds = new Set<string>();
  readonly monitorIds = new Set<string>();
  outcome?: AgentOutcome;
  private cleanupPromise?: Promise<void>;
  private cleanups: (() => void | Promise<void>)[] = [];

  constructor(readonly caller: AgentCaller, readonly snapshot: AgentSnapshot, private releaseWorkspace?: () => Promise<void>) {}

  addResource(id: string, cleanup: () => void | Promise<void>): void {
    if (this.outcome) throw new Error('Agent run has already ended.');
    this.childIds.add(id);
    this.cleanups.push(cleanup);
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
    this.monitorIds.clear();
    this.childIds.clear();
    if (failures.length > 0) throw new AggregateError(failures, `Agent run ${this.id} cleanup failed.`);
  }
}

export function copyAgentCaller(caller: AgentCaller): AgentCaller {
  return Object.freeze({ ...caller, context: Object.freeze([...caller.context]) });
}
