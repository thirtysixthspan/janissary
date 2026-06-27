import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ConnectionKind, ConnectionParsed } from './types.js';

// SQLite databases live under .janissary/db/sqlite/<name>.sqlite and, unlike
// agent state and workspaces, persist across launches — that is the whole point.
let dbDir = '';

export function initDbDir(projectDir: string): void {
  dbDir = path.join(projectDir, '.janissary', 'db', 'sqlite');
}

const VALID_DB_NAME = /^[\w-]+$/;

export function dbPath(name: string): string {
  if (!VALID_DB_NAME.test(name)) throw new Error(`Invalid database name: "${name}"`);
  return path.join(dbDir, `${name}.sqlite`);
}

/** Whether a database file exists on disk. */
export function databaseFileExists(name: string): boolean {
  return !!dbDir && existsSync(dbPath(name));
}

/** List database names that have a `.sqlite` file on disk, sorted. */
export function listDatabaseFiles(): string[] {
  if (!dbDir || !existsSync(dbDir)) return [];
  return readdirSync(dbDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => f.slice(0, -'.sqlite'.length))
    .toSorted((a, b) => a.localeCompare(b));
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
  let database = connections.get(name);
  if (!database) {
    mkdirSync(dbDir, { recursive: true });
    database = new DatabaseSync(dbPath(name));
    connections.set(name, database);
  }
  return database;
}

export function isConnectionOpen(name: string): boolean {
  return connections.has(name);
}

/** Close one open SQLite connection. Returns whether one was actually open. */
export function closeConnection(name: string): boolean {
  const database = connections.get(name);
  if (!database) return false;
  try { database.close(); } catch { /* ignore */ }
  connections.delete(name);
  return true;
}

/** Close every open SQLite connection (called on app exit). */
export function closeAllConnections(): void {
  for (const [, database] of connections) {
    try { database.close(); } catch { /* ignore */ }
  }
  connections.clear();
}

/** Names of databases with an open connection, sorted. */
export function listOpenConnections(): string[] {
  return [...connections.keys()].toSorted((a, b) => a.localeCompare(b));
}

// --- The generic `connection` command -------------------------------------

const KINDS: ConnectionKind[] = ['sqlite', 'shell', 'acp', 'browser'];
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
    const index = target.indexOf(':');
    if (index === -1) {
      return { error: `Invalid connection "${target}". Expected <kind>:<id>, e.g. sqlite:mydb.` };
    }
    const kind = target.slice(0, index).toLowerCase();
    if (!KINDS.includes(kind as ConnectionKind)) {
      return { error: `Unknown connection kind "${kind}". Expected one of: ${KINDS.join(', ')}.` };
    }
    const id = target.slice(index + 1);
    if (!id) return { error: `Missing id in "${target}".` };
    return { action: 'close', kind: kind as ConnectionKind, id };
  }

  return { error: USAGE };
}
