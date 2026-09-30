import type { DatabaseSync } from 'node:sqlite';
import type {
  DatabaseColumnView,
  DatabaseGridQuery,
  DatabaseGridView,
  DatabaseObjectView,
  DatabaseResultView,
  DatabasesView,
} from '../protocol.js';
import { databaseFileExists, getConnection, isConnectionOpen } from '../connections.js';
import { errorText } from '../error-text.js';
import { DatabaseBrowserState, databaseRefs, lastOpenedDatabase } from './browser-state.js';
import { readStatement } from './console-read.js';
import { exportRows } from './export.js';
import { runGrid, totals, unfilteredTotal } from './grid.js';
import { RowKeyStore } from './row-keys.js';
import { objectColumns, hasObject, schemaObjects } from './schema.js';
import { deleteRow, insertRow, updateCell, type WriteOutcome } from './write.js';

// The browser's half of the database manager: everything the `sql` plugin reaches through the
// `databases` topic. It owns the request bookkeeping, the row-key store, and the unfiltered row
// count cache, and delegates the SQL to the modules beside it. Nothing here is reachable from a `db`
// command, and nothing in the `db` path comes here.

function emptyGrid(query: DatabaseGridQuery): DatabaseGridView {
  return {
    sql: '', parameters: [], columns: [], rows: [], total: 0, unfilteredTotal: 0,
    offset: query.offset, limit: query.limit, order: [],
  };
}

export class DatabaseBrowser {
  private readonly state = new DatabaseBrowserState();
  // One key store per database, so a key minted while browsing one cannot resolve in another. A
  // single shared store would let a row key address a row in whatever database the tab happened to
  // be showing, which is the cross-database write the opaque key exists to prevent.
  private readonly keys = new Map<string, RowKeyStore>();
  private readonly unfiltered = new Map<string, number>();

  private keyStore(database: string): RowKeyStore {
    const existing = this.keys.get(database);
    if (existing) return existing;
    const store = new RowKeyStore();
    this.keys.set(database, store);
    return store;
  }

  /**
   * Forget every remembered row count for one database.
   *
   * The count is cached so a filtered query can report the object's size without counting it again,
   * and between a schema re-read and a write an object's size cannot change through this surface. So
   * those two events are exactly what invalidates it — and a write the cache outlived is how a pager
   * came to report `Rows 1–5 of 5 of 4 rows`, a filtered total larger than the one it is divided
   * against. A console statement clears the whole database rather than one object, because it may be
   * a `DROP` or an `ALTER` and nothing here is told what it touched.
   */
  private forgetTotals(database: string): void {
    const prefix = `${database} `;
    for (const key of this.unfiltered.keys()) {
      if (key.startsWith(prefix)) this.unfiltered.delete(key);
    }
  }

  view(): DatabasesView {
    return { databases: databaseRefs(), results: this.state.results(), lastOpened: lastOpenedDatabase() };
  }

  /**
   * The database's handle, or the message to report when it is not there.
   *
   * The existence check runs *before* `getConnection` because opening is what creates: a browser
   * that refreshed a deleted database would otherwise bring the empty file straight back. This is
   * the same guard `queryDatabase` makes for the `db` surface, and the `isConnectionOpen` half lets a
   * database with no file but a live handle still be read.
   *
   * `allowCreate` is the one way past it, and only `create` passes it — an explicit wish for a
   * database to exist. Every other read refuses, because a read that materializes a database is a
   * read with a side effect.
   */
  private open(database: string, allowCreate = false): { handle: DatabaseSync } | { error: string } {
    if (!allowCreate && !databaseFileExists(database) && !isConnectionOpen(database)) {
      return { error: `Database "${database}" does not exist. Create it to start.` };
    }
    try {
      return { handle: getConnection(database) };
    } catch (error) {
      return { error: errorText(error) };
    }
  }

  private handleFor(database: string, object: string): { handle: DatabaseSync; columns: DatabaseColumnView[] } | { error: string } {
    const opened = this.open(database);
    if ('error' in opened) return opened;
    if (!hasObject(opened.handle, object)) {
      return { error: `"${object}" is not in "${database}".` };
    }
    return { handle: opened.handle, columns: objectColumns(opened.handle, object) };
  }

  private record(result: DatabaseResultView): void {
    this.state.record(result);
  }

  private schemaResult(requestId: string, database: string, objects: DatabaseObjectView[], error?: string): DatabaseResultView {
    return { kind: 'schema', requestId, database, objects, ...(error && { error }) };
  }

  /** Create the database if it is absent, then answer with its (possibly empty) object list. */
  create(database: string, requestId: string): void {
    const opened = this.open(database, true);
    if ('error' in opened) { this.record(this.schemaResult(requestId, database, [], opened.error)); return; }
    this.forgetTotals(database);
    this.record(this.schemaResult(requestId, database, schemaObjects(opened.handle)));
  }

  schema(database: string, requestId: string): void {
    const opened = this.open(database);
    this.forgetTotals(database);
    this.record('error' in opened
      ? this.schemaResult(requestId, database, [], opened.error)
      : this.schemaResult(requestId, database, schemaObjects(opened.handle)));
  }

  query(database: string, requestId: string, query: DatabaseGridQuery): void {
    const opened = this.handleFor(database, query.object);
    if ('error' in opened) {
      this.record({ kind: 'query', requestId, database, grid: emptyGrid(query), error: opened.error });
      return;
    }
    try {
      const cacheKey = `${database} ${query.object}`;
      const grid = runGrid(opened.handle, query, opened.columns, this.keyStore(database), this.rememberedTotal(opened.handle, query, cacheKey));
      this.unfiltered.set(cacheKey, grid.unfilteredTotal);
      this.record({ kind: 'query', requestId, database, grid });
    } catch (error) {
      this.record({ kind: 'query', requestId, database, grid: emptyGrid(query), error: errorText(error) });
    }
  }

  /**
   * The object's size without filters, for the pager's "showing N of M", or undefined when this
   * query already answers that.
   *
   * A filtered query whose object has never been counted cannot seed the cache from its own count:
   * that number is the filtered one, and it would go on being reported as the object's size. So the
   * first time an object is asked about with filters on, it is counted without them. The all-column
   * term narrows a query the same way a per-column filter does and is answered the same way, so
   * arriving at an unvisited table with a term in force costs the same one count rather than a size
   * that is wrong for the rest of the session.
   */
  private rememberedTotal(handle: DatabaseSync, query: DatabaseGridQuery, cacheKey: string): number | undefined {
    const remembered = this.unfiltered.get(cacheKey);
    if (remembered !== undefined) return remembered;
    if (query.filters.length === 0 && !query.global) return undefined;
    return unfilteredTotal(handle, query);
  }

  /**
   * A statement the user typed. The read/write split is the host's, not the plugin's, and a write
   * goes through `exec` for the same reason `db sqlite query` does — a console is where a
   * semicolon-separated script gets typed, and `exec` is what runs one. `exec` reports no change
   * count, so a write answers `0` and the console says `OK.`, exactly as the command-bar surface
   * does; the changed count is meaningful only for the grid's own single statements. A read is
   * iterated rather than materialised, so a result far larger than the console shows costs a
   * bounded amount of memory rather than all of it.
   */
  run(database: string, requestId: string, sql: string, returnsRows: boolean): void {
    const opened = this.open(database);
    this.forgetTotals(database);
    if ('error' in opened) {
      this.record({ kind: 'write', requestId, database, sql, parameters: [], changed: 0, error: opened.error });
      return;
    }
    try {
      if (returnsRows) {
        this.record({ kind: 'query', requestId, database, grid: readStatement(opened.handle, sql) });
        return;
      }
      opened.handle.exec(sql);
      this.record({ kind: 'write', requestId, database, sql, parameters: [], changed: 0 });
    } catch (error) {
      this.record({ kind: 'write', requestId, database, sql, parameters: [], changed: 0, error: errorText(error) });
    }
  }

  private write(database: string, requestId: string, outcome: WriteOutcome): void {
    this.forgetTotals(database);
    this.record(outcome.ok
      ? { kind: 'write', requestId, database, sql: outcome.sql, parameters: outcome.parameters, changed: outcome.changed }
      : { kind: 'write', requestId, database, sql: '', parameters: [], changed: 0, error: outcome.error });
  }

  // A write the database refuses is an ordinary outcome, not a broken plugin: a `NOT NULL`, `UNIQUE`
  // or `CHECK` violation arrives as a throw out of `DatabaseSync`, and letting it escape took the
  // whole `sql` plugin down and closed every one of its tabs. It is recorded here as the refusal the
  // write layer already reports deliberately, so the caller draws one answer rather than a failure.
  private attempted(
    database: string,
    requestId: string,
    action: (handle: DatabaseSync) => WriteOutcome,
  ): void {
    const opened = this.open(database);
    if ('error' in opened) { this.write(database, requestId, { ok: false, error: opened.error }); return; }
    try {
      this.write(database, requestId, action(opened.handle));
    } catch (error) {
      this.write(database, requestId, { ok: false, error: errorText(error) });
    }
  }

  updateCell(database: string, requestId: string, row: string, column: string, value: string | null): void {
    this.attempted(database, requestId, (handle) => updateCell(
      this.keyStore(database), row, column, value, (object) => objectColumns(handle, object), handle,
    ));
  }

  insertRow(database: string, requestId: string, object: string, cells: { column: string; value: string | null }[]): void {
    this.attempted(database, requestId, (handle) => insertRow(object, cells, objectColumns(handle, object), handle));
  }

  deleteRow(database: string, requestId: string, row: string): void {
    this.attempted(database, requestId, (handle) => deleteRow(
      this.keyStore(database), row, (object) => objectColumns(handle, object), handle,
    ));
  }

  exportObject(database: string, requestId: string, query: DatabaseGridQuery, format: 'csv' | 'json'): void {
    const opened = this.handleFor(database, query.object);
    const fail = (error: string) => this.record({ kind: 'export', requestId, database, path: '', name: '', size: '', rows: 0, error });
    if ('error' in opened) { fail(opened.error); return; }
    try {
      const outcome = exportRows(opened.handle, database, query, opened.columns, format, totals(opened.handle, query, opened.columns).total);
      if (!outcome.ok) { fail(outcome.error); return; }
      this.record({
        kind: 'export', requestId, database,
        path: outcome.path, name: outcome.name, size: outcome.size, rows: outcome.rows,
      });
    } catch (error) {
      fail(errorText(error));
    }
  }

  dispose(): void {
    this.state.clear();
    this.unfiltered.clear();
    this.keys.clear();
  }
}
