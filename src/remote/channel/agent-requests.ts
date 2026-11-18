import { randomUUID } from 'node:crypto';
import type { AgentSnapshot } from '../../agent/types.js';
import type { ClientFrame, RemoteRunCloneAction, ServerFrame } from '../protocol-frames.js';
import { errorText } from '../../error-text.js';
import { PendingRequests } from './pending-requests.js';

const RESOLUTION_TIMEOUT_MS = 15_000;
const RELEASE_TIMEOUT_MS = 15_000;

type RunCloneResultFrame = Extract<ServerFrame, { type: 'run-clone-result' }>;

function sendFailure(error: unknown): Error {
  return error instanceof Error ? error : new Error(errorText(error));
}

export class RemoteAgentRequests {
  private pending = new PendingRequests<AgentSnapshot>();
  private clones = new PendingRequests<RunCloneResultFrame>();

  request(task: string, skills: string[], send: (frame: ClientFrame) => void): Promise<AgentSnapshot> {
    const id = randomUUID();
    const result = this.pending.open(id, {
      deadlineMs: RESOLUTION_TIMEOUT_MS,
      onTimeout: (timedOut) => { this.pending.fail(timedOut, new Error('Remote agent resolution timed out.')); },
    });
    try {
      send({ type: 'agent-resolve', id, task, skills });
    } catch (error) {
      this.pending.fail(id, sendFailure(error));
    }
    return result;
  }

  async runClone(action: RemoteRunCloneAction, label: string, send: (frame: ClientFrame) => void): Promise<string | undefined> {
    const id = randomUUID();
    const result = this.clones.open(id, action === 'release' ? {
      deadlineMs: RELEASE_TIMEOUT_MS,
      onTimeout: (timedOut) => { this.clones.fail(timedOut, new Error('Remote run clone release timed out.')); },
    } : {});
    try {
      send({ type: 'run-clone', id, action, label });
    } catch (error) {
      this.clones.fail(id, sendFailure(error));
    }
    const frame = await result;
    if (frame.error !== undefined) throw new Error(frame.error);
    if (action === 'create') {
      if (frame.dir === undefined) throw new Error('Remote run clone create returned no directory.');
      return frame.dir;
    }
    if (frame.dir !== undefined) throw new Error('Remote run clone release returned an unexpected directory.');
    return;
  }

  resolve(frame: Extract<ServerFrame, { type: 'agent-resolve-result' | 'run-clone-result' }>): void {
    if (frame.type === 'agent-resolve-result') {
      if (frame.snapshot) this.pending.settle(frame.id, frame.snapshot);
      else this.pending.fail(frame.id, new Error(frame.error ?? 'Remote agent resolution failed.'));
      return;
    }
    this.clones.settle(frame.id, frame);
  }

  failAll(message: string): void {
    this.pending.settleAll(() => ({ reason: new Error(message) }));
    this.clones.settleAll(() => ({ reason: new Error(message) }));
  }
}
