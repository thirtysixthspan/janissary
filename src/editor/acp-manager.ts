import type { AcpSession } from '../types.js';
import type { Persona } from '../personas.js';
import type { ConnectionView } from '../protocol.js';
import { spawnMonitorSession } from '../monitor/acp.js';
import type { Managers } from '../managers.js';

type SessionHooks = { onError: (message: string) => void };

const key = (label: string, persona: string): string => `${label}:${persona}`;

// Owns the persistent, multi-turn ACP sessions an editor tab's in-editor persona suggestions open,
// keyed by `${label}:${persona}`. A session connects lazily on the first suggestion request for a
// persona in a tab and is reused (never respawned) for every later request to that same persona in
// that tab — see product/plans/ready/editor-tab-persona-connections.md.
export class EditorAcpManager {
  private sessions = new Map<string, AcpSession>();
  private personas = new Map<string, string>();

  constructor(private managers: Managers) {}

  session(label: string, persona: Persona, cwd: string, hooks: SessionHooks): AcpSession {
    const k = key(label, persona.name);
    let session = this.sessions.get(k);
    if (!session) {
      session = spawnMonitorSession(persona, cwd, { onError: hooks.onError });
      this.sessions.set(k, session);
      this.personas.set(k, persona.name);
    }
    return session;
  }

  connectionsFor(label: string): ConnectionView[] {
    const rows: ConnectionView[] = [];
    for (const [k, persona] of this.personas) {
      if (k.startsWith(`${label}:`) && this.sessions.has(k)) rows.push({ text: `${persona} (acp)`, kind: 'acp' });
    }
    return rows;
  }

  close(label: string, persona: string): boolean {
    const k = key(label, persona);
    const session = this.sessions.get(k);
    if (!session) return false;
    session.kill();
    this.sessions.delete(k);
    this.personas.delete(k);
    return true;
  }

  closeTab(label: string): void {
    for (const k of this.sessions.keys()) {
      if (!k.startsWith(`${label}:`)) continue;
      this.sessions.get(k)!.kill();
      this.sessions.delete(k);
      this.personas.delete(k);
    }
  }
}
