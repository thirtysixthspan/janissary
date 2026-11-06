import { messageBus } from '../bus.js';
import { SHELL_NAME } from '../shell/manager.js';
import type { Managers } from '../managers.js';
import type { ConnectionKind } from './types.js';
import type { AcpRole } from '../acp/role.js';

// Match `<id>` against a remote tab's label first, then against the address it was launched with —
// the same label-before-identity order `ssh:` rows on real ssh tabs use.
function closeRemoteChannel(managers: Managers, id: string): boolean {
  const tabs = managers.tab.tabs;
  const tab = tabs.find((t) => t.remote && t.label === id) ?? tabs.find((t) => t.remote?.address === id);
  return tab !== undefined && managers.remote.close(tab.label);
}

function coreAcpTarget(id: string): { role: AcpRole; suffix?: string } {
  if (id === 'tell') return { role: 'tell' };
  if (id.startsWith('tell:')) return { role: 'tell', suffix: id.slice('tell:'.length) };
  if (id === 'ask') return { role: 'ask' };
  if (id.startsWith('ask:')) return { role: 'ask', suffix: id.slice('ask:'.length) };
  return { role: 'ask', suffix: id };
}

// Editor personas and monitors keep priority over the role-qualified core-session aliases. The core
// fallback accepts any ask id, so a session still connecting can still be closed.
function closeAcp(managers: Managers, label: string, id: string, out: (text: string) => void): void {
  if (managers.editorAcp.close(label, id) || managers.monitor.stop(label, id)) {
    messageBus.emit('state', { type: 'dirty' });
    out(`Closed connection acp:${id}.`);
    return;
  }
  const target = coreAcpTarget(id);
  const model = managers.acp.label(label, target.role);
  const name = model === undefined
    ? (target.suffix === undefined ? target.role : `${target.role}:${target.suffix}`)
    : `${target.role}:${model}`;
  if (managers.acp.close(label, undefined, target.role)) {
    messageBus.emit('state', { type: 'dirty' });
    out(`Closed connection acp:${name}.`);
  }
  else out(`No open connection acp:${id}.`);
}

function closeSsh(managers: Managers, id: string, out: (text: string) => void): void {
  const tabs = managers.tab.tabs;
  const tab = tabs.find((t) => t.harness?.name === 'ssh' && t.label === id)
    ?? tabs.find((t) => t.harness?.name === 'ssh' && t.harness.destination === id);
  if (tab?.harness) { managers.pty.kill(tab.harness.ptyId); out(`Closed connection ssh:${id}.`); }
  // A remote tab's `ssh:` row names the channel it runs over, not an ssh tab. Killing that channel
  // closes the tab, which is the whole point of the row being separately closable.
  else if (closeRemoteChannel(managers, id)) out(`Closed connection ssh:${id}.`);
  else out(`No open connection ssh:${id}.`);
}

// Every kind but `browser`, whose window close is asynchronous and runs from
// `ConnectionManager.closeTarget` through the connections plugin command.
export function closeConnection(
  kind: Exclude<ConnectionKind, 'browser'>,
  id: string,
  managers: Managers,
  label: string,
  out: (text: string) => void,
): void {
  switch (kind) {
  case 'sqlite': {
    out(managers.database.close(id) ? `Closed connection sqlite:${id}.` : `No open connection sqlite:${id}.`);
    break;
  }
  case 'shell': {
    if (managers.shell.close(label)) out(`Closed connection shell:${SHELL_NAME}.`);
    else out(`No open connection shell:${id}.`);
    break;
  }
  case 'acp': {
    closeAcp(managers, label, id, out);
    break;
  }
  case 'ssh': {
    closeSsh(managers, id, out);
    break;
  }
  case 'terminal': {
    // The PTY's exit then runs the normal exit path, which ends an inline card or closes a harness tab.
    out(managers.pty.killTerminal(label, id) ? `Closed connection terminal:${id}.` : `No open connection terminal:${id}.`);
    break;
  }
  }
}
