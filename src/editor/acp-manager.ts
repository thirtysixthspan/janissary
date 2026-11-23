import type { AcpSession } from '../acp/types.js';
import type { ConnectionView } from '../protocol.js';
import { formatContext, type MonitorContextEntry } from '../monitor/context.js';
import type { Managers } from '../managers.js';

const key = (label: string, persona: string): string => `${label}:${persona}`;

// Owns the per-label/per-persona state that an editor tab's in-editor persona suggestions built up
// around their old dedicated sessions. Editor queries now run through the tab's core ACP role
// session, so nothing opens a session here any more; the maps and the close/connection surface
// remain for subplan 6 to remove.
export class EditorAcpManager {
  private sessions = new Map<string, AcpSession>();
  private personas = new Map<string, string>();
  private contexts = new Map<string, MonitorContextEntry[]>();

  constructor(_managers: Managers) {}

  hasSession(label: string, persona: string): boolean {
    return this.sessions.has(key(label, persona));
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
  }

  private forget(k: string): void {
    this.sessions.delete(k);
    this.personas.delete(k);
    this.contexts.delete(k);
  }
}
