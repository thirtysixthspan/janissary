import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// SQLite databases live under .janussary/db/sqlite/<name>.sqlite and, unlike
// agent state and workspaces, persist across launches — that is the whole point.
let dbDir = '';

export function initDbDir(projectDir: string): void {
  dbDir = join(projectDir, '.janussary', 'db', 'sqlite');
}

export function dbPath(name: string): string {
  return join(dbDir, `${name}.sqlite`);
}

/** Whether a database file exists on disk. */
export function dbFileExists(name: string): boolean {
  return !!dbDir && existsSync(dbPath(name));
}

/** List database names that have a `.sqlite` file on disk, sorted. */
export function listDatabaseFiles(): string[] {
  if (!dbDir || !existsSync(dbDir)) return [];
  return readdirSync(dbDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => f.slice(0, -'.sqlite'.length))
    .sort();
}

export function removeDatabaseFile(name: string): void {
  rmSync(dbPath(name), { force: true });
}

// Open SQLite connections keyed by database name: opened lazily on the first
// `db` command targeting a database and kept open — across commands and tabs —
// until closed explicitly (`connection close sqlite:<name>`) or at app exit.
// Multiple databases can be connected at once.
const connections = new Map<string, DatabaseSync>();

export function getConnection(name: string): DatabaseSync {
  let db = connections.get(name);
  if (!db) {
    mkdirSync(dbDir, { recursive: true });
    db = new DatabaseSync(dbPath(name));
    connections.set(name, db);
  }
  return db;
}

export function isConnectionOpen(name: string): boolean {
  return connections.has(name);
}

/** Close one open SQLite connection. Returns whether one was actually open. */
export function closeConnection(name: string): boolean {
  const db = connections.get(name);
  if (!db) return false;
  try { db.close(); } catch { /* ignore */ }
  connections.delete(name);
  return true;
}

/** Close every open SQLite connection (called on app exit). */
export function closeAllConnections(): void {
  for (const [, db] of connections) {
    try { db.close(); } catch { /* ignore */ }
  }
  connections.clear();
}

/** Names of databases with an open connection, sorted. */
export function listOpenConnections(): string[] {
  return [...connections.keys()].sort();
}

// --- The generic `connection` command -------------------------------------

export type ConnectionKind = 'sqlite' | 'shell' | 'acp';

export type ConnectionParsed =
  | { error: string }
  | { action: 'list' }
  | { action: 'close'; kind: ConnectionKind; id: string };

const KINDS: ConnectionKind[] = ['sqlite', 'shell', 'acp'];
const USAGE = 'Usage: connection <list|close> [kind:id]  (e.g. connection close sqlite:mydb)';

/** Parse a `connection ...` command. Pure — performs no I/O. */
export function parseConnectionCommand(input: string): ConnectionParsed {
  const rest = input.trim().replace(/^connection\b\s*/i, '').trim();
  if (!rest) return { error: USAGE };

  const [actionRaw, target] = rest.split(/\s+/);
  const action = actionRaw.toLowerCase();

  if (action === 'list') return { action: 'list' };

  if (action === 'close') {
    if (!target) return { error: 'Usage: connection close <kind>:<id>' };
    const idx = target.indexOf(':');
    if (idx < 0) {
      return { error: `Invalid connection "${target}". Expected <kind>:<id>, e.g. sqlite:mydb.` };
    }
    const kind = target.slice(0, idx).toLowerCase();
    const id = target.slice(idx + 1);
    if (!KINDS.includes(kind as ConnectionKind)) {
      return { error: `Unknown connection kind "${kind}". Expected one of: ${KINDS.join(', ')}.` };
    }
    if (!id) return { error: `Missing id in "${target}".` };
    return { action: 'close', kind: kind as ConnectionKind, id };
  }

  return { error: USAGE };
}
