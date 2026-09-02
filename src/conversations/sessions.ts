import { connectAcp } from '../acp/index.js';
import { acpLaunchFor } from '../acp/launch.js';
import type { AcpSession } from '../acp/types.js';
import type { ConversationModelPair } from '../protocol.js';

export type ConversationSessionHooks = {
  onError: (message: string) => void;
  onConnect?: () => void;
};

export class ConversationSessions {
  private sessions = new Map<string, AcpSession>();

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  session(
    id: string,
    pair: ConversationModelPair,
    workspaceDir: string,
    hooks: ConversationSessionHooks,
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
