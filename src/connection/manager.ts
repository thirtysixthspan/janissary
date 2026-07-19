import type { ConnectionView } from '../protocol.js';
import { parseConnectionCommand } from '../connections.js';
import { SHELL_NAME } from '../shell-manager.js';
import { closeConnection } from './close.js';
import type { Managers } from '../managers.js';
import { listLines, listCompletionConnections } from './list.js';

export class ConnectionManager {
  constructor(private managers: Managers) {}

  connectionsFor(label: string): ConnectionView[] {
    const rows: ConnectionView[] = [];
    if (this.managers.shell.has(label)) {
      rows.push({ text: `${SHELL_NAME}:${this.managers.tab.shorten(this.managers.tab.cwdOf(label) ?? process.cwd())}`, kind: 'shell' });
    }
    const acp = this.managers.acp.label(label);
    if (acp) rows.push({ text: `acp:${acp}`, kind: 'acp' });
    rows.push(...this.managers.monitor.connectionsFor(label));
    const b = this.managers.browser.info(label);
    if (b) for (const id of b.ids) rows.push({ text: `browser:${id} (${b.mode})`, kind: 'browser' });
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (tab?.harness?.name === 'ssh' && tab.harness.destination) {
      rows.push({ text: `ssh:${tab.harness.destination}`, kind: 'ssh' });
    } else {
      for (const program of this.managers.pty.terminalsFor(label)) rows.push({ text: `terminal:${program}`, kind: 'terminal' });
    }
    for (const n of this.managers.database.openDbs(label)) rows.push({ text: `sqlite:${n}`, kind: 'sqlite' });
    return rows;
  }

  run(command: string, label: string): void {
    const parsed = parseConnectionCommand(command);
    const out = (text: string) => this.managers.tab.append(label, { input: command, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') {
      const lines = listLines(this.managers, label);
      out(lines.length > 0 ? lines.join('\n') : 'No open connections.');
      return;
    }
    if (parsed.kind === 'browser') {
      this.managers.tab.startRunning(label, command);
      void this.managers.browser.run(label, `browser window close ${parsed.id}`).then((o) => this.managers.tab.finishRunning(label, o));
      return;
    }
    closeConnection(parsed.kind, parsed.id, this.managers, label, out);
  }

  completionConnections(label: string): string[] {
    return listCompletionConnections(this.managers, label);
  }
}
