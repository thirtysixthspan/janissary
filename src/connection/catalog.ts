import { SHELL_NAME } from '../shell/manager.js';
import type { AcpRef, ConnectionView } from '../protocol.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import type { ConnectionKind } from './types.js';

// One open connection as every connection surface sees it. `id` is exactly what
// `connection close <kind>:<id>` accepts; `display` is the connections-panel text; `scope` is
// `'tab'` for a connection the issuing tab holds (its panel shows it) and `'global'` for one only the
// app-wide `connection list` and completion reach; `detail` is a parenthetical the text list appends.
export type ConnectionEntry = {
  kind: ConnectionKind;
  id: string;
  display: string;
  scope: 'tab' | 'global';
  detail?: string;
  acpRef?: AcpRef;
};

// A monitor's close id is its runtime name, an editor persona's its persona name.
function acpId(ref: AcpRef): string {
  if (ref.scope === 'monitor') return ref.name;
  if (ref.scope === 'editor') return ref.persona;
  return ref.label;
}

function acpEntries(managers: Managers, label: string): ConnectionEntry[] {
  const entries: ConnectionEntry[] = [];
  // Only a session whose handshake has named it is listed — the panel has always waited for that.
  const name = managers.acp.label(label);
  if (name) entries.push({ kind: 'acp', id: name, display: `acp:${name}`, scope: 'tab', acpRef: { scope: 'tab', label } });
  const rows: ConnectionView[] = [...managers.monitor.connectionsFor(label), ...managers.editorAcp.connectionsFor(label)];
  for (const row of rows) {
    if (row.acpRef) entries.push({ kind: 'acp', id: acpId(row.acpRef), display: row.text, scope: 'tab', acpRef: row.acpRef });
  }
  return entries;
}

// An ssh harness tab or a remote tab is closable as `ssh:<its label>`; the destination it was
// launched with is what the panel shows and the list adds in parentheses.
function sshEntry(tab: Tab, label: string): ConnectionEntry | undefined {
  const destination = tab.harness?.name === 'ssh' ? tab.harness.destination : tab.remote?.address;
  if (!destination) return undefined;
  return { kind: 'ssh', id: tab.label, display: `ssh:${destination}`, scope: tab.label === label ? 'tab' : 'global', detail: destination };
}

// The tab's own ssh connection, then its terminals. An ssh tab's only PTY is the ssh session itself,
// already listed as its `ssh:` entry, so it gets no terminal entry.
function processEntries(managers: Managers, label: string): ConnectionEntry[] {
  const tab = managers.tab.byLabel(label);
  const own = tab && sshEntry(tab, label);
  if (own && tab.harness?.name === 'ssh') return [own];
  const terminals = managers.pty.terminalsFor(label)
    .map((program): ConnectionEntry => ({ kind: 'terminal', id: program, display: `terminal:${program}`, scope: 'tab' }));
  return own ? [own, ...terminals] : terminals;
}

function sqliteEntry(name: string, scope: ConnectionEntry['scope']): ConnectionEntry {
  return { kind: 'sqlite', id: name, display: `sqlite:${name}`, scope };
}

// A tab's own connections first, in the order its panel lists them, then the connections of other
// tabs and the app that only the list and completion reach (ssh tabs have no command bar to list
// from, and SQLite connections are shared).
export function connectionCatalog(managers: Managers, label: string): ConnectionEntry[] {
  const entries: ConnectionEntry[] = [];
  if (managers.shell.has(label)) {
    const cwd = managers.tab.shorten(managers.tab.cwdOf(label) ?? process.cwd());
    entries.push({ kind: 'shell', id: SHELL_NAME, display: `${SHELL_NAME}:${cwd}`, scope: 'tab' });
  }
  entries.push(...acpEntries(managers, label));
  const browser = managers.browser.info(label);
  if (browser) for (const id of browser.ids) entries.push({ kind: 'browser', id, display: `browser:${id} (${browser.mode})`, scope: 'tab' });
  entries.push(...processEntries(managers, label));
  const tabDbs = managers.database.openDbs(label);
  entries.push(...tabDbs.map((n) => sqliteEntry(n, 'tab')));
  for (const t of managers.tab.tabs) {
    const entry = t.label === label ? undefined : sshEntry(t, label);
    if (entry) entries.push(entry);
  }
  entries.push(...managers.database.listOpen().filter((n) => !tabDbs.includes(n)).map((n) => sqliteEntry(n, 'global')));
  return entries;
}
