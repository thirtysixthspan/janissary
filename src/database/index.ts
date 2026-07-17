import {
  databaseFileExists as databaseFileExists,
  listDatabaseFiles,
  removeDatabaseFile,
  getConnection,
  closeConnection,
} from '../connections.js';
import { parseDatabaseCommand } from './parsing.js';
export { parseDatabaseCommand } from './parsing.js';
import { queryDatabase } from './query.js';
export { DB_PRIMER, extractDatabaseCommand } from './primer.js';

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

