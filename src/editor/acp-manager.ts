import type { AcpSession } from '../acp/types.js';
import type { Persona } from '../personas.js';
import type { ConnectionView } from '../protocol.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import {
  existingPersonaRoleRuntime, forgetPersonaRole, personaRoleRuntime,
} from '../acp/persona-role-state.js';

type SessionHooks = { onError: (message: string) => void };

const slot = (label: string, role: string): string => `${label}:${role}`;

// The editor-facing view of the tab's role-keyed persona sessions. The sessions themselves live on
// the tab runtime's `personaRoles` record and are created by the shared core role entry; this owner
// keeps the persona name beside each role slot so the connection UI can keep naming the persona the
// user typed. Two personas declaring different roles on one tab therefore get separate sessions and
// separate recorded exchanges. See product/plans/complete/editor-tab-persona-connections.md and
// product/plans/complete/editor-acp-forget-dead-session.md.
export class EditorAcpManager {
  private personas = new Map<string, string>();
  private roles = new Map<string, string>();
  private hooks = new Map<string, SessionHooks>();

  constructor(private managers: Managers) {}

  private runtime(label: string) {
    return this.managers.tab.byLabel(label)?.runtime;
  }

  hasSession(label: string, role: string): boolean {
    return this.managers.personaRoleSessions.hasSession(label, role);
  }

  session(label: string, persona: Persona, role: string, _cwd: string, hooks: SessionHooks): AcpSession | undefined {
    const k = slot(label, role);
    this.personas.set(k, persona.name);
    this.roles.set(`${label}:${persona.name}`, role);
    this.hooks.set(k, hooks);
    const runtime = this.runtime(label);
    if (!runtime) return undefined;
    const state = personaRoleRuntime(runtime, role);
    if (!state.session) return undefined;
    const previous = state.hooks;
    const session = state.session;
    state.hooks = {
      onError: (message) => {
        this.died(label, role, session, message);
        previous?.onError(message);
      },
    };
    return session;
  }

  // A connection-level error means the agent is gone. Forget the slot so the next request opens and
  // re-primes a fresh session, report it once to the current editor request, and mark the UI dirty.
  private died(label: string, role: string, session: AcpSession, message: string): void {
    const runtime = this.runtime(label);
    const state = runtime ? existingPersonaRoleRuntime(runtime, role) : undefined;
    if (!state || state.session !== session) return;
    const hooks = this.hooks.get(slot(label, role));
    this.forget(label, role);
    messageBus.emit('state', { type: 'dirty' });
    hooks?.onError(message);
  }

  private forget(label: string, role: string): void {
    const k = slot(label, role);
    const persona = this.personas.get(k);
    if (persona !== undefined) this.roles.delete(`${label}:${persona}`);
    this.personas.delete(k);
    this.hooks.delete(k);
    const runtime = this.runtime(label);
    if (runtime) forgetPersonaRole(runtime, role);
  }

  record(label: string, role: string, text: string, kind: 'input' | 'response'): void {
    this.managers.personaRoleSessions.record(label, role, text, kind);
  }

  transcript(label: string, persona: string): string {
    const role = this.roles.get(`${label}:${persona}`);
    return role ? this.managers.personaRoleSessions.transcript(label, role) : '';
  }

  connectionsFor(label: string): ConnectionView[] {
    const rows: ConnectionView[] = [];
    for (const [k, persona] of this.personas) {
      if (!k.startsWith(`${label}:`)) continue;
      const role = k.slice(label.length + 1);
      if (!this.managers.personaRoleSessions.hasSession(label, role)) continue;
      rows.push({ text: `${persona} (acp)`, kind: 'acp', acpRef: { scope: 'editor', label, persona } });
    }
    return rows;
  }

  close(label: string, persona: string): boolean {
    const role = this.roles.get(`${label}:${persona}`);
    if (!role || !this.managers.personaRoleSessions.close(label, role)) return false;
    this.forget(label, role);
    return true;
  }

  closeTab(label: string): void {
    for (const k of this.personas.keys()) {
      if (!k.startsWith(`${label}:`)) continue;
      const role = k.slice(label.length + 1);
      this.managers.personaRoleSessions.close(label, role);
      this.forget(label, role);
    }
  }

  dispose(): void {
    for (const k of this.personas.keys()) {
      const label = k.slice(0, k.indexOf(':'));
      const role = k.slice(k.indexOf(':') + 1);
      this.managers.personaRoleSessions.close(label, role);
      this.forget(label, role);
    }
    this.personas.clear();
    this.roles.clear();
    this.hooks.clear();
  }
}
