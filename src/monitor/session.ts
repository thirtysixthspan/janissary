import type { AcpSession } from '../acp/types.js';
import type { Managers } from '../managers.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { MonitorSub } from './live-monitors.js';
import { knownRoleSettings } from '../acp/ask-role.js';
import { promptPersonaRole } from '../acp/persona-role.js';
import { personaRoleRuntime } from '../acp/persona-role-state.js';
import { tabRuntime } from '../tab/runtime.js';
import { messageBus } from '../bus.js';
import { SUGGESTION_FORMAT } from './reply-format.js';
import { TRUST_FRAMING_INSTRUCTIONS } from './framing.js';
import { formatConnection, personaSummary } from './info.js';
import { recordContext } from './context.js';

export function idleSession(): AcpSession {
  return {
    prompt: () => {},
    cancel: async () => {},
    kill: () => {},
    shutdown: async () => {},
  };
}

function roleEntry(managers: Managers, reg: Pick<MonitorSub, 'owner' | 'persona'>): RoleEntry | undefined {
  const settings = knownRoleSettings(managers.tab.launchDir, reg.persona.role);
  return settings ? managers.acp.launchableEntries(reg.owner, settings, reg.persona.role)[0] : undefined;
}

export function primeMonitorSession(reg: MonitorSub, managers: Managers): void {
  reg.inFlight = true;
  const primingText = `${reg.persona.body}\n\n${SUGGESTION_FORMAT}\n\n${TRUST_FRAMING_INSTRUCTIONS(reg.delimiter)}`;
  recordContext(reg, primingText, 'input');
  const pending = promptPersonaRole(managers, reg.owner, primingText, reg.persona.role, reg.persona.name);
  const tab = managers.tab.byLabel(reg.owner);
  const state = tab ? personaRoleRuntime(tabRuntime(tab), reg.persona.role) : undefined;
  if (state?.session) {
    reg.session = state.session;
    const entry = roleEntry(managers, reg);
    if (entry) {
      reg.info = { provider: entry.harness, model: entry.model };
      const connection = formatConnection(reg.info);
      const summary = personaSummary(reg.persona);
      managers.tab.append(reg.owner, {
        input: '',
        output: `monitor ${reg.persona.name}: connected${connection ? ` (${connection})` : ''} — ${summary}`,
      });
      messageBus.emit('state', { type: 'dirty' });
    }
  }
  void pending.then((result) => {
    reg.inFlight = false;
    if (result.answered) recordContext(reg, result.reply, 'response');
    else managers.tab.append(reg.owner, { input: '', output: `monitor ${reg.persona.name}: ${result.error}` });
  });
}

export function openMonitorSession(reg: MonitorSub, managers: Managers): void {
  primeMonitorSession(reg, managers);
}

export function respawnMonitorSession(reg: MonitorSub, managers: Managers): void {
  // A fresh session starts a fresh context.
  reg.contextBytes = 0;
  reg.contextText = [];
  if (!managers.personaRoleSessions.close(reg.owner, reg.persona.role)) reg.session.kill();
  openMonitorSession(reg, managers);
}
