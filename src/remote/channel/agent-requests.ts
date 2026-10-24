import { randomUUID } from 'node:crypto';
import type { AgentSnapshot } from '../../agent/types.js';
import type { ClientFrame, ServerFrame } from '../protocol-frames.js';
import { PendingRequests } from './pending-requests.js';

const RESOLUTION_TIMEOUT_MS = 15_000;

export class RemoteAgentRequests {
  private pending = new PendingRequests<AgentSnapshot>();

  request(task: string, skills: string[], send: (frame: ClientFrame) => void): Promise<AgentSnapshot> {
    const id = randomUUID();
    const result = this.pending.open(id, {
      deadlineMs: RESOLUTION_TIMEOUT_MS,
      onTimeout: (timedOut) => { this.pending.fail(timedOut, new Error('Remote agent resolution timed out.')); },
    });
    send({ type: 'agent-resolve', id, task, skills });
    return result;
  }

  resolve(frame: Extract<ServerFrame, { type: 'agent-resolve-result' }>): void {
    if (frame.snapshot) this.pending.settle(frame.id, frame.snapshot);
    else this.pending.fail(frame.id, new Error(frame.error ?? 'Remote agent resolution failed.'));
  }

  failAll(message: string): void {
    this.pending.settleAll(() => ({ reason: new Error(message) }));
  }
}
