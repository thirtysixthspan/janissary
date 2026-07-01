import {
  databaseFileExists as databaseFileExists,
  listDatabaseFiles,
  removeDatabaseFile,
  getConnection,
  closeConnection,
} from './connections.js';
import { parseDatabaseCommand } from './database-parsing.js';
export { parseDatabaseCommand } from './database-parsing.js';
import { queryDatabase } from './database-query.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createDatabase(name: string): string {
  const isExisted = databaseFileExists(name);
  try {
    getConnection(name);
    return isExisted ? `Database "${name}" already exists.` : `Created sqlite database "${name}".`;
  } catch (error) {
    return `Failed to create database "${name}": ${errorMessage(error)}`;
  }
}

function deleteDatabase(name: string): string {
  closeConnection(name);
  if (!databaseFileExists(name)) return `Database "${name}" does not exist.`;
  try {
    removeDatabaseFile(name);
    return `Deleted sqlite database "${name}".`;
  } catch (error) {
    return `Failed to delete database "${name}": ${errorMessage(error)}`;
  }
}

function listDbs(): string {
  const names = listDatabaseFiles();
  return names.length > 0 ? names.join('\n') : 'No databases.';
}

/** Execute a `db ...` command and return the text to show in the transcript. */
export function runDatabaseCommand(input: string): string {
  const parsed = parseDatabaseCommand(input);
  if ('error' in parsed) return parsed.error;
  switch (parsed.action) {
    case 'create': {
      return createDatabase(parsed.name);
    }
    case 'delete': {
      return deleteDatabase(parsed.name);
    }
    case 'list': {
      return listDbs();
    }
    case 'query': {
      return queryDatabase(parsed.name, parsed.query);
    }
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
export function extractDatabaseCommand(text: string): string | undefined {
  const lines = text.split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index].replace(/^[\s`$>]+/, '').replace(/`+\s*$/, '').trim();
    if (/^db\s+sqlite\s+(create|delete|query|list)\b/i.test(line)) return line;
  }
  // not a db command
}

