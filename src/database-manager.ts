import { runDatabaseCommand, parseDatabaseCommand, extractDatabaseCommand, DB_PRIMER } from './database.js';
import { isConnectionOpen, closeConnection, closeAllConnections, listOpenConnections } from './connections.js';

// Owns each tab's view of the SQLite databases it has opened, and acts as the controller's facade
// over the global connection registry (connections.ts) and the `db` command surface (database.ts).
// SQLite connections themselves are global; this manager attributes them to the tab(s) that ran a
// `db` command against them — so a tab's connections panel reflects only the databases it opened —
// and keeps that attribution in sync as databases are created, queried, deleted, or closed.
export class DatabaseManager {
  // Tab label → the SQLite database names that tab has opened (sorted, deduped).
  private tabConns = new Map<string, string[]>();

  // The instructions describing the `db` command surface, injected into the ACP agent's primer.
  get primer(): string {
    return DB_PRIMER;
  }

  // Run a `db` command on behalf of a tab, keeping that tab's tracked SQLite connections in sync so
  // its connections panel reflects what it has open. `delete` forgets the connection; any opening
  // command (create/query) records it once.
  runInTab(label: string, command: string): string {
    const output = runDatabaseCommand(command);
    const parsed = parseDatabaseCommand(command);
    if (!('error' in parsed)) {
      if (parsed.action === 'delete') this.forgetConn(parsed.name);
      else if (parsed.action !== 'list' && isConnectionOpen(parsed.name)) {
        const current = this.tabConns.get(label) ?? [];
        if (!current.includes(parsed.name)) this.tabConns.set(label, [...current, parsed.name].toSorted((a, b) => a.localeCompare(b)));
      }
    }
    return output;
  }

  // The SQLite databases a tab has opened that are still live (filtered against the global registry
  // so a closed/deleted db drops out). Drives the per-tab connections panel and command recognition.
  openDbs(label: string): string[] {
    return (this.tabConns.get(label) ?? []).filter(isConnectionOpen);
  }

  // A `db`-shaped command embedded in agent text (for the ACP tool loop), or undefined if none.
  extract(text: string): string | undefined {
    return extractDatabaseCommand(text);
  }

  // Every globally open SQLite database (for the connections panel and completion).
  listOpen(): string[] {
    return listOpenConnections();
  }

  // Close one globally open SQLite connection by name; returns whether one was open (drives the
  // `connection close sqlite` result message).
  close(name: string): boolean {
    return closeConnection(name);
  }

  // Forget a tab's tracked connections (on tab close). The connections stay globally open.
  forgetTab(label: string): void {
    this.tabConns.delete(label);
  }

  // Close every globally open SQLite connection and forget all per-tab attribution (last tab closed
  // / app shutdown) — connections are global, so they're closed only when no tab remains.
  closeAll(): void {
    closeAllConnections();
    this.tabConns.clear();
  }

  // Drop a database name from every tab's tracked connections (on `db delete`).
  private forgetConn(name: string): void {
    for (const [label, names] of this.tabConns) {
      if (names.includes(name)) this.tabConns.set(label, names.filter((n) => n !== name));
    }
  }
}
