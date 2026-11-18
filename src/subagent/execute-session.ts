import type { AgentRun } from '../agent/run.js';
import type { SubagentAttemptLease } from './attempt-session.js';

export type SubagentSessionSlot = Readonly<{
  adoptSession: (lease: SubagentAttemptLease) => void;
  clearAfterResult: () => void;
  readonly closed: boolean;
}>;

export function createSubagentSessionSlot(run: AgentRun): SubagentSessionSlot {
  let current: SubagentAttemptLease | undefined;
  let closed = false;

  run.addResource(`acp:${run.id}`, async () => {
    closed = true;
    const lease = current;
    current = undefined;
    if (lease !== undefined) {
      try { await lease.dispose(); }
      catch { return; }
    }
  });

  return {
    get closed() { return closed; },
    adoptSession: (lease) => {
      if (closed || run.outcome !== undefined || run.abortController.signal.aborted) {
        void lease.dispose().catch(() => {});
        return;
      }
      current = lease;
    },
    clearAfterResult: () => { current = undefined; },
  };
}
