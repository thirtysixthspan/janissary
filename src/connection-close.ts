import { messageBus } from './bus.js';
import { SHELL_NAME } from './shell-manager.js';
import type { Managers } from './managers.js';

export function closeConnection(
  kind: string,
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
    if (managers.acp.close(label)) { messageBus.emit('state', { type: 'dirty' }); out('Closed connection acp:opencode.'); }
    else out('No open connection acp:opencode.');
    break;
  }
  case 'ssh': {
    const tabs = managers.tab.tabs;
    const tab = tabs.find((t) => t.harness?.name === 'ssh' && t.label === id)
      ?? tabs.find((t) => t.harness?.name === 'ssh' && t.harness.destination === id);
    if (tab?.harness) { managers.pty.kill(tab.harness.ptyId); out(`Closed connection ssh:${id}.`); }
    else out(`No open connection ssh:${id}.`);
    break;
  }
  default: {
    out(`Closing ${kind} connections is not yet available in the web UI.`);
  }
  }
}
