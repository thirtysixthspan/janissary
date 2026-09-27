// One live ACP agent subprocess per key, kept alive between calls and confined to the workspace the
// caller names. Both callers key it by their own subject — a conversation id, a visualization id —
// so the pool is the reason neither of them owns a session map of its own, and why neither of them
// spawns a process directly.
import { connectAcp } from './index.js';
import { acpLaunchFor } from './launch.js';
import type { AcpSession } from './types.js';
import type { ConversationModelPair } from '../protocol.js';

export type AcpSessionPoolHooks = {
  onError: (message: string) => void;
  onConnect?: () => void;
};

export class AcpSessionPool {
  private sessions = new Map<string, AcpSession>();

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  session(
    id: string,
    pair: ConversationModelPair,
    workspaceDir: string,
    hooks: AcpSessionPoolHooks,
  ): AcpSession {
    let session = this.sessions.get(id);
    if (!session) {
      session = connectAcp({
        ...acpLaunchFor({ ...pair, variant: 'default' }),
        cwd: workspaceDir,
        workspaceDir,
        onError: hooks.onError,
        onConnect: hooks.onConnect,
      });
      this.sessions.set(id, session);
    }
    return session;
  }

  close(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.kill();
    this.sessions.delete(id);
    return true;
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.kill();
    this.sessions.clear();
  }
}
