import { runDatabaseCommand } from './index.js';
import { parseDatabaseCommand } from './parsing.js';
import { isDatabaseCommandLine, DB_PRIMER } from './primer.js';
import { isConnectionOpen, closeConnection, closeAllConnections, listOpenConnections, listDatabaseFiles } from '../connections.js';
import { DatabaseBrowser } from './browser.js';
import type { DatabaseGridQuery, DatabasesView } from '../protocol.js';

// Owns each tab's view of the SQLite databases it has opened, and acts as the controller's facade
// over the global connection registry (connections.ts) and the `db` command surface (database.ts).
// SQLite connections themselves are global; this manager attributes them to the tab(s) that ran a
// `db` command against them — so a tab's connections panel reflects only the databases it opened —
// and keeps that attribution in sync as databases are created, queried, deleted, or closed.
export class DatabaseManager {
  // Tab label → the SQLite database names that tab has opened (sorted, deduped).
  private tabConns = new Map<string, string[]>();

  // The `sql` plugin's browser, reached through the `databases` topic. It keeps its own request
  // bookkeeping and row keys, so none of the methods below have to know a request id exists.
  private readonly browser = new DatabaseBrowser();

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

  // Whether a cleaned line of agent text is a `db` command (for the ACP tool loop).
  isCommandLine(line: string): boolean {
    return isDatabaseCommandLine(line);
  }

  // Every globally open SQLite database (for the connections panel and completion).
  listOpen(): string[] {
    return listOpenConnections();
  }

  // Every database on disk, whether or not a connection to it is open. The one registry call this
  // manager did not already expose, and the reason a database nobody had queried was invisible to
  // every surface until the browser asked for it.
  listFiles(): string[] {
    return listDatabaseFiles();
  }

  // The `databases` topic's data slice: which databases exist, and the recent answers to the
  // browser's requests. The request id on each answer is the one the plugin minted with its action,
  // so a caller that only has a database name and a query is still addressed correctly.
  readView(): DatabasesView {
    return this.browser.view();
  }

  browseCreate(database: string, requestId: string): void {
    this.browser.create(database, requestId);
  }

  browseSchema(database: string, requestId: string): void {
    this.browser.schema(database, requestId);
  }

  browseQuery(database: string, requestId: string, query: DatabaseGridQuery): void {
    this.browser.query(database, requestId, query);
  }

  browseRun(database: string, requestId: string, sql: string, returnsRows: boolean): void {
    this.browser.run(database, requestId, sql, returnsRows);
  }

  browseUpdateCell(database: string, requestId: string, row: string, column: string, value: string | null): void {
    this.browser.updateCell(database, requestId, row, column, value);
  }

  browseInsertRow(database: string, requestId: string, object: string, cells: { column: string; value: string | null }[]): void {
    this.browser.insertRow(database, requestId, object, cells);
  }

  browseDeleteRow(database: string, requestId: string, row: string): void {
    this.browser.deleteRow(database, requestId, row);
  }

  browseExport(database: string, requestId: string, query: DatabaseGridQuery, format: 'csv' | 'json'): void {
    this.browser.exportObject(database, requestId, query, format);
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

  closeTab(label: string): void { this.forgetTab(label); }

  // Close every globally open SQLite connection and forget all per-tab attribution (last tab closed
  // / app shutdown) — connections are global, so they're closed only when no tab remains.
  closeAll(): void {
    closeAllConnections();
    this.browser.dispose();
    this.tabConns.clear();
  }

  dispose(): void {
    this.closeAll();
  }

  // Drop a database name from every tab's tracked connections (on `db delete`).
  private forgetConn(name: string): void {
    for (const [label, names] of this.tabConns) {
      if (names.includes(name)) this.tabConns.set(label, names.filter((n) => n !== name));
    }
  }
}
