import type { ConnectionView } from './protocol.js';
import { parseConnectionCommand } from './connections.js';
import { SHELL_NAME } from './shell-manager.js';
import { closeConnection } from './connection-close.js';
import type { Managers } from './managers.js';

// The global `connection list` lines: shell/acp are per-issuing-tab, the rest (terminals, ssh
// tabs, sqlite) span every tab, since they have no command bar of their own to list from.
function listLines(managers: Managers, label: string): string[] {
  const lines: string[] = [];
  if (managers.shell.has(label)) lines.push(`shell:${SHELL_NAME}`);
  if (managers.acp.has(label)) lines.push('acp:opencode');
  const b = managers.browser.info(label);
  if (b) for (const id of b.ids) lines.push(`browser:${id}`);
  for (const program of managers.pty.terminalsFor(label)) lines.push(`terminal:${program}`);
  for (const t of managers.tab.tabs) {
    if (t.harness?.name === 'ssh' && t.harness.destination) lines.push(`ssh:${t.harness.destination}`);
  }
  for (const n of managers.database.listOpen()) lines.push(`sqlite:${n}`);
  return lines;
}

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
    const out: string[] = [];
    if (this.managers.shell.has(label)) out.push(`shell:${SHELL_NAME}`);
    if (this.managers.acp.has(label)) out.push('acp:opencode');
    const b = this.managers.browser.info(label);
    if (b) for (const id of b.ids) out.push(`browser:${id}`);
    for (const n of this.managers.database.listOpen()) out.push(`sqlite:${n}`);
    for (const t of this.managers.tab.tabs) {
      if (t.harness?.name === 'ssh') out.push(`ssh:${t.label}`);
    }
    return out;
  }
}
