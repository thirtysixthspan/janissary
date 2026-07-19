import { SHELL_NAME } from '../shell-manager.js';
import type { Managers } from '../managers.js';

// Read-only connection-string aggregation across managers, split out of manager.ts: a distinct
// concern from `connectionsFor` (richer ConnectionView rows) and `run` (command dispatch, which
// closes connections) that remain there.

// The global `connection list` lines: shell/acp are per-issuing-tab, the rest (terminals, ssh
// tabs, sqlite) span every tab, since they have no command bar of their own to list from.
export function listLines(managers: Managers, label: string): string[] {
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

export function listCompletionConnections(managers: Managers, label: string): string[] {
  const out: string[] = [];
  if (managers.shell.has(label)) out.push(`shell:${SHELL_NAME}`);
  if (managers.acp.has(label)) out.push('acp:opencode');
  const b = managers.browser.info(label);
  if (b) for (const id of b.ids) out.push(`browser:${id}`);
  for (const n of managers.database.listOpen()) out.push(`sqlite:${n}`);
  for (const t of managers.tab.tabs) {
    if (t.harness?.name === 'ssh') out.push(`ssh:${t.label}`);
  }
  return out;
}
