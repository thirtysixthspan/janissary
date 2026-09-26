import type { AcpSession } from '../acp/types.js';
import type { Persona } from '../personas.js';
import type { ConnectionView } from '../protocol.js';
import { spawnMonitorSession } from '../monitor/acp.js';
import { formatContext, type MonitorContextEntry } from '../monitor/context.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';

type SessionHooks = { onError: (message: string) => void };

const key = (label: string, persona: string): string => `${label}:${persona}`;

// Owns the persistent, multi-turn ACP sessions an editor tab's in-editor persona suggestions open,
// keyed by `${label}:${persona}`. A session connects lazily on the first suggestion request for a
// persona in a tab and is reused for every later request to that same persona in that tab until it
// is closed or its agent dies — see product/plans/complete/editor-tab-persona-connections.md and
// product/plans/complete/editor-acp-forget-dead-session.md.
export class EditorAcpManager {
  private sessions = new Map<string, AcpSession>();
  private personas = new Map<string, string>();
  private contexts = new Map<string, MonitorContextEntry[]>();
  // The hooks from the newest `session()` call per key, so a connection-level error reaches the
  // request that is current when the agent dies rather than the one that happened to spawn it.
  private hooks = new Map<string, SessionHooks>();

  constructor(private managers: Managers) {}

  // Whether a session already exists for `label`/`persona` — checked *before* `session()`
  // lazily creates one, this tells the caller whether the upcoming request is the first for this
  // persona in this tab (needs full priming) or a later one on an already-primed session (does
  // not).
  hasSession(label: string, persona: string): boolean {
    return this.sessions.has(key(label, persona));
  }

  session(label: string, persona: Persona, cwd: string, hooks: SessionHooks): AcpSession {
    const k = key(label, persona.name);
    this.hooks.set(k, hooks);
    let session = this.sessions.get(k);
    if (!session) {
      const spawned = spawnMonitorSession(persona, cwd, { onError: (message) => this.died(k, spawned, message) });
      session = spawned;
      this.sessions.set(k, session);
      this.personas.set(k, persona.name);
      this.contexts.set(k, []);
    }
    return session;
  }

  // A connection-level error means the agent is gone (it failed to start or exited), so the session
  // is forgotten the way `AcpManager` forgets one: the next request spawns and re-primes a fresh
  // session instead of prompting a corpse that never answers. No `kill`, since there is no process
  // left, and nothing at all when `session` is no longer the one stored under `k` — a late report
  // from a closed or replaced session must not drop its successor.
  private died(k: string, session: AcpSession, message: string): void {
    if (this.sessions.get(k) !== session) return;
    const hooks = this.hooks.get(k);
    this.forget(k);
    messageBus.emit('state', { type: 'dirty' });
    hooks?.onError(message);
  }

  private forget(k: string): void {
    this.sessions.delete(k);
    this.personas.delete(k);
    this.contexts.delete(k);
    this.hooks.delete(k);
  }

  // Append a block to `label`/`persona`'s recorded exchange (see acp-connection-row-transcript-
  // button) — a plain append, unlike the monitor's `recordContext`, since editor-persona rows have
  // no byte counter to grow alongside it.
  record(label: string, persona: string, text: string, role: MonitorContextEntry['role']): void {
    this.contexts.get(key(label, persona))?.push({ role, text });
  }

  // The formatted snapshot of `label`/`persona`'s recorded exchange, or `''` when the session is
  // unknown or has recorded nothing yet.
  transcript(label: string, persona: string): string {
    const entries = this.contexts.get(key(label, persona));
    return entries ? formatContext(entries) : '';
  }

  connectionsFor(label: string): ConnectionView[] {
    const rows: ConnectionView[] = [];
    for (const [k, persona] of this.personas) {
      if (k.startsWith(`${label}:`) && this.sessions.has(k)) {
        rows.push({ text: `${persona} (acp)`, kind: 'acp', acpRef: { scope: 'editor', label, persona } });
      }
    }
    return rows;
  }

  close(label: string, persona: string): boolean {
    const k = key(label, persona);
    const session = this.sessions.get(k);
    if (!session) return false;
    session.kill();
    this.forget(k);
    return true;
  }

  closeTab(label: string): void {
    for (const k of this.sessions.keys()) {
      if (!k.startsWith(`${label}:`)) continue;
      this.sessions.get(k)!.kill();
      this.forget(k);
    }
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.kill();
    this.sessions.clear();
    this.personas.clear();
    this.contexts.clear();
    this.hooks.clear();
  }
}
