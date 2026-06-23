import {
  dbPath,
  dbFileExists,
  listDatabaseFiles,
  removeDatabaseFile,
  getConnection,
  closeConnection,
  isConnectionOpen,
} from './connections.js';
import { type DatabaseSync } from 'node:sqlite';
import type { DbParsed } from './types.js';

// Database names become filenames, so restrict them to a safe character set —
// this also blocks path traversal (`..`, `/`).
const VALID_NAME = /^[A-Za-z0-9_-]+$/;
const USAGE = 'Usage: db sqlite <create|delete|query|list> [name] [query]';
const ACTIONS = ['create', 'delete', 'query', 'list'];

function engineError(engine: string): { error: string } {
  return { error: `Unsupported engine "${engine}". Only "sqlite" is supported.` };
}

function nameError(name: string): { error: string } {
  return { error: `Invalid database name "${name}". Use letters, numbers, "-" and "_" only.` };
}

// Remove one layer of matching surrounding quotes so a user (or agent) can wrap
// the SQL — `query movies "SELECT * FROM actors"` — without the quotes reaching
// SQLite. Only strips when the whole string is wrapped in the same quote char.
function unwrapQuotes(s: string): string {
  const q = s[0];
  if (s.length >= 2 && (q === '"' || q === "'") && s[s.length - 1] === q) {
    return s.slice(1, -1);
  }
  return s;
}

/** Parse a `db sqlite ...` command into an action. Pure — performs no I/O. */
export function parseDbCommand(input: string): DbParsed {
  const rest = input.trim().replace(/^db\b\s*/i, '').trim();
  if (!rest) return { error: USAGE };

  const [engineRaw, ...tail] = rest.split(/\s+/);
  const engine = engineRaw.toLowerCase();
  if (engine !== 'sqlite') {
    // A leading action (old word order) gets the usage hint; anything else is
    // reported as an unsupported engine.
    return ACTIONS.includes(engine) ? { error: USAGE } : engineError(engine);
  }

  const action = tail[0]?.toLowerCase();
  if (!action) return { error: USAGE };

  if (action === 'list') return { action: 'list' };

  if (action === 'create' || action === 'delete') {
    const name = tail[1];
    if (!name) return { error: `Usage: db sqlite ${action} <name>` };
    if (!VALID_NAME.test(name)) return nameError(name);
    return { action, name };
  }

  if (action === 'query') {
    // Engine + action are words; keep the rest verbatim as the SQL.
    const m = rest.match(/^sqlite\s+query\s+(\S+)\s+([\s\S]+)$/i);
    if (!m) return { error: 'Usage: db sqlite query <name> <sql>' };
    const name = m[1];
    const query = unwrapQuotes(m[2].trim());
    if (!VALID_NAME.test(name)) return nameError(name);
    return { action: 'query', name, query };
  }

  return { error: USAGE };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function createDb(name: string): string {
  const existed = dbFileExists(name);
  try {
    getConnection(name); // creates the file if missing and opens a connection
    return existed ? `Database "${name}" already exists.` : `Created sqlite database "${name}".`;
  } catch (e) {
    return `Failed to create database "${name}": ${errMsg(e)}`;
  }
}

function deleteDb(name: string): string {
  closeConnection(name); // release the file handle before removing it
  if (!dbFileExists(name)) return `Database "${name}" does not exist.`;
  try {
    removeDatabaseFile(name);
    return `Deleted sqlite database "${name}".`;
  } catch (e) {
    return `Failed to delete database "${name}": ${errMsg(e)}`;
  }
}

function listDbs(): string {
  const names = listDatabaseFiles();
  return names.length ? names.join('\n') : 'No databases.';
}

/** Render row objects as a simple aligned text table. */
function formatRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(0 rows)';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const fmt = (cells: string[]) => cells.map((s, i) => s.padEnd(widths[i])).join('  ');
  const header = fmt(cols);
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((r) => fmt(cols.map((c) => cell(r[c]))));
  const count = `(${rows.length} row${rows.length === 1 ? '' : 's'})`;
  return [header, sep, ...body, '', count].join('\n');
}

// Statements that yield rows; everything else is executed for its side effects.
const READ_QUERY = /^\s*(select|pragma|with|explain)\b/i;

function queryDb(name: string, query: string): string {
  // Require the database to exist (a typo shouldn't silently create one); an
  // already-open connection counts as existence even mid-session.
  if (!dbFileExists(name) && !isConnectionOpen(name)) {
    return `Database "${name}" does not exist. Create it with: db sqlite create ${name}`;
  }
  let db: DatabaseSync;
  try {
    db = getConnection(name); // reuse the persistent connection
  } catch (e) {
    return `Failed to open database "${name}": ${errMsg(e)}`;
  }
  try {
    if (READ_QUERY.test(query)) {
      const rows = db.prepare(query).all() as Record<string, unknown>[];
      return formatRows(rows);
    }
    // exec handles writes and multiple semicolon-separated statements.
    db.exec(query);
    return 'OK.';
  } catch (e) {
    return `Query error: ${errMsg(e)}`;
  }
}

/** Execute a `db ...` command and return the text to show in the transcript. */
export function runDbCommand(input: string): string {
  const parsed = parseDbCommand(input);
  if ('error' in parsed) return parsed.error;
  switch (parsed.action) {
    case 'create':
      return createDb(parsed.name);
    case 'delete':
      return deleteDb(parsed.name);
    case 'list':
      return listDbs();
    case 'query':
      return queryDb(parsed.name, parsed.query);
  }
}

// Primer injected into an ACP agent so it understands the `db` grammar and can
// drive an autonomous tool loop: it emits a command, the host runs it, and the
// output is fed back until the agent answers without a command.
export const DB_PRIMER = [
  'This host CLI can manage SQLite databases via `db` commands. Syntax:',
  '  db sqlite create <name>          # create an empty database',
  '  db sqlite delete <name>          # delete a database',
  '  db sqlite query  <name> <sql>    # run SQL against a database',
  '  db sqlite list                   # list databases',
  'Database names use letters, numbers, "-" and "_" only; the engine is always "sqlite".',
  'To inspect or change a database, end your reply with exactly one `db` command on its',
  'own final line (no code fence, nothing after it). The host runs it automatically and',
  'returns the output to you, so you can issue further commands. When the task is done,',
  'reply with the final answer and NO trailing `db` command.',
  'Be concise: do not explain what you are doing. Only output `db` commands and the final answer.',
].join('\n');

/**
 * Pull a proposed `db ...` command out of an agent reply, if present. Scans
 * bottom-up (the primer asks for the command on the last line) and tolerates a
 * surrounding code fence or a leading `$ `/`> ` prompt marker.
 */
export function extractDbCommand(text: string): string | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/^[\s`$>]+/, '').replace(/`+\s*$/, '').trim();
    if (/^db\s+sqlite\s+(create|delete|query|list)\b/i.test(line)) return line;
  }
  return null;
}

// `dbPath` is re-exported for callers (and tests) that need the on-disk location.
export { dbPath };
