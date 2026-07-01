import type { ConnectionView } from './protocol.js';
import { parseConnectionCommand } from './connections.js';
import { SHELL_NAME } from './shell-manager.js';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';

export class ConnectionManager {
  constructor(private managers: Managers) {}

  connectionsFor(label: string): ConnectionView[] {
    const rows: ConnectionView[] = [];
    if (this.managers.shell.has(label)) {
      rows.push({ text: `${SHELL_NAME}:${this.managers.tab.shorten(this.managers.tab.cwdOf(label) ?? process.cwd())}`, kind: 'shell' });
    }
    const acp = this.managers.acp.label(label);
    if (acp) rows.push({ text: `acp:${acp}`, kind: 'acp' });
    const b = this.managers.browser.info(label);
    if (b) for (const id of b.ids) rows.push({ text: `browser:${id} (${b.mode})`, kind: 'browser' });
    for (const program of this.managers.pty.terminalsFor(label)) rows.push({ text: `terminal:${program}`, kind: 'terminal' });
    for (const n of this.managers.database.openDbs(label)) rows.push({ text: `sqlite:${n}`, kind: 'sqlite' });
    return rows;
  }

  run(command: string, label: string): void {
    const parsed = parseConnectionCommand(command);
    const out = (text: string) => this.managers.tab.append(label, { input: command, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') {
      const lines: string[] = [];
      if (this.managers.shell.has(label)) lines.push(`shell:${SHELL_NAME}`);
      if (this.managers.acp.has(label)) lines.push('acp:opencode');
      const b = this.managers.browser.info(label);
      if (b) for (const id of b.ids) lines.push(`browser:${id}`);
      for (const program of this.managers.pty.terminalsFor(label)) lines.push(`terminal:${program}`);
      for (const n of this.managers.database.listOpen()) lines.push(`sqlite:${n}`);
      out(lines.length > 0 ? lines.join('\n') : 'No open connections.');
      return;
    }
    if (parsed.kind === 'browser') {
      this.managers.tab.startRunning(label, command);
      void this.managers.browser.run(label, `browser window close ${parsed.id}`).then((o) => this.managers.tab.finishRunning(label, o));
      return;
    }
    switch (parsed.kind) {
    case 'sqlite': {
      out(this.managers.database.close(parsed.id) ? `Closed connection sqlite:${parsed.id}.` : `No open connection sqlite:${parsed.id}.`);

    break;
    }
    case 'shell': {
      if (this.managers.shell.close(label)) out(`Closed connection shell:${SHELL_NAME}.`);
      else out(`No open connection shell:${parsed.id}.`);

    break;
    }
    case 'acp': {
      if (this.managers.acp.close(label)) { messageBus.emit('state', { type: 'dirty' }); out('Closed connection acp:opencode.'); }
      else out('No open connection acp:opencode.');

    break;
    }
    default: {
      out(`Closing ${parsed.kind} connections is not yet available in the web UI.`);
    }
    }
  }

  completionConnections(label: string): string[] {
    const out: string[] = [];
    if (this.managers.shell.has(label)) out.push(`shell:${SHELL_NAME}`);
    if (this.managers.acp.has(label)) out.push('acp:opencode');
    const b = this.managers.browser.info(label);
    if (b) for (const id of b.ids) out.push(`browser:${id}`);
    for (const n of this.managers.database.listOpen()) out.push(`sqlite:${n}`);
    return out;
  }
}
