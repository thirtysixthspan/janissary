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
  default: {
    out(`Closing ${kind} connections is not yet available in the web UI.`);
  }
  }
}
