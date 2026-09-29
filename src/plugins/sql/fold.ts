import type { DatabaseResultView, TabPluginResources, TabPluginServerCapabilities } from '../api.js';
import type { SqlExport, SqlObject, SqlPayload } from './shared.js';
import { addExport, firstObject, issue, type SqlTabs } from './tabs.js';

// How an answer changes the tab. Every branch is total: a failed read keeps whatever was already
// there and records the message, because a wrong column name in a grid is an ordinary outcome and
// blanking the page a user was reading would be a worse answer than the error is.
export function fold(
  key: string,
  payload: SqlPayload,
  answer: DatabaseResultView,
  capabilities: TabPluginServerCapabilities,
  tabs: SqlTabs,
): SqlPayload {
  const base: SqlPayload = { ...payload, pending: null };
  switch (answer.kind) {
    case 'schema': { return foldSchema(base, answer.objects, answer.error, capabilities);
    }
    case 'query': {
      return answer.error
        ? { ...base, ...missing(answer.error) }
        : { ...base, grid: answer.grid, error: null };
    }
    case 'write': {
      if (answer.error) return { ...base, ...missing(answer.error) };
      // A write invalidates the page it changed, so the grid is re-read rather than patched. The
      // statement and its values stay in the console line, which is what the user just did.
      return {
        ...base,
        error: null,
        console: answer.sql ? { sql: answer.sql, changed: answer.changed } : base.console,
        pending: issue('query', base, capabilities),
      };
    }
    case 'stats': {
      return answer.error
        ? { ...base, stats: null, ...missing(answer.error) }
        : { ...base, stats: answer.columns, error: null };
    }
    case 'export': { return foldExport(key, base, answer, tabs);
    }
  }
}

function foldSchema(
  base: SqlPayload,
  objects: readonly SqlObject[],
  error: string | undefined,
  capabilities: TabPluginServerCapabilities,
): SqlPayload {
  if (error) return { ...base, objects: [...objects], ...missing(error) };
  const object = firstObject(objects, base.object);
  if (!object) return { ...base, objects: [...objects], object, grid: null, error: null };
  const selected: SqlPayload = { ...base, objects: [...objects], object, error: null };
  return { ...selected, pending: issue('query', selected, capabilities) };
}

// A database that is no longer there is not an ordinary read failure: the rows the tab is showing
// describe a file that has been deleted, so keeping them would be showing something that is not true.
// Drop the grid, say so, and let a re-create clear it.
const MISSING_DATABASE = /^Database "[^"]*" does not exist\./u;

function missing(error: string): { grid?: null; error: string } {
  return MISSING_DATABASE.test(error) ? { grid: null, error } : { error };
}

function foldExport(
  key: string,
  base: SqlPayload,
  answer: Extract<DatabaseResultView, { kind: 'export' }>,
  tabs: SqlTabs,
): SqlPayload {
  if (answer.error) return { ...base, ...missing(answer.error) };
  tabs.rememberPath(key, answer.name, answer.path);
  const entry: SqlExport = { name: answer.name, size: answer.size, rows: answer.rows, ref: '' };
  return { ...base, error: null, exports: addExport(base.exports, entry) };
}

/**
 * Register each export exactly once. `FileRegistry.register` mints a fresh id on every call, so a
 * reference re-registered on every update would leak an entry per notification; the reference is
 * therefore kept in the payload and only a still-empty one is registered.
 */
export function registerExports(
  key: string,
  payload: SqlPayload,
  resources: TabPluginResources,
  tabs: SqlTabs,
): SqlExport[] {
  return payload.exports.map((entry) => {
    if (entry.ref) return entry;
    const file = tabs.pathFor(key, entry.name);
    if (!file) return entry;
    return { ...entry, ref: resources.registerFile(file) };
  });
}
