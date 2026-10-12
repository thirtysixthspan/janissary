import { randomUUID } from 'node:crypto';
import type { AgentSnapshot } from '../../agent/types.js';
import type { ClientFrame, ServerFrame } from '../protocol-frames.js';

type Pending = { resolve: (snapshot: AgentSnapshot) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export class RemoteAgentRequests {
  private pending = new Map<string, Pending>();

  request(task: string, skills: string[], send: (frame: ClientFrame) => void): Promise<AgentSnapshot> {
    const id = randomUUID();
    let resolve = (_snapshot: AgentSnapshot) => {};
    let reject = (_error: Error) => {};
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the project targets ES2023
    const result = new Promise<AgentSnapshot>((done, fail) => { resolve = done; reject = fail; });
    const timer = setTimeout(() => this.fail(id, 'Remote agent resolution timed out.'), 15_000);
    this.pending.set(id, { resolve, reject, timer });
    send({ type: 'agent-resolve', id, task, skills });
    return result;
  }

  resolve(frame: Extract<ServerFrame, { type: 'agent-resolve-result' }>): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(frame.id);
    if (frame.snapshot) pending.resolve(frame.snapshot);
    else pending.reject(new Error(frame.error ?? 'Remote agent resolution failed.'));
  }

  failAll(message: string): void {
    for (const id of this.pending.keys()) this.fail(id, message);
  }

  private fail(id: string, message: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.reject(new Error(message));
  }
}
