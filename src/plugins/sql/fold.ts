import type { DatabaseResultView, TabPluginResources } from '../api.js';
import type { SqlExport, SqlObject, SqlPayload, SqlPending } from './shared.js';
import { planRequest, type SqlRequest } from './request.js';
import { addExport, addToLog, firstObject, type SqlTabs } from './tabs.js';

// What folding an answer produced: the tab's new state, and the request that state is now waiting on
// — planned but deliberately not sent, so the caller can record it in the mirror first. `null` means
// the answer is the end of the exchange.
export type SqlFold = { payload: SqlPayload; followUp: SqlRequest | null };

// How an answer changes the tab. Every branch is total: a failed read keeps whatever was already
// there and records the message, because a wrong column name in a grid is an ordinary outcome and
// blanking the page a user was reading would be a worse answer than the error is.
//
// Nothing here sends anything. Folding is the part of the exchange that decides what to ask next,
// and the ask has to reach the host only after the tab's own copy of it exists — see `dispatch`.
export function fold(
  key: string,
  payload: SqlPayload,
  answer: DatabaseResultView,
  tabs: SqlTabs,
  followUp: SqlPending['followUp'],
): SqlFold {
  const base: SqlPayload = { ...payload, pending: null };
  switch (answer.kind) {
    case 'schema': { return foldSchema(base, answer.objects, answer.error);
    }
    case 'query': {
      return settled(answer.error
        ? { ...base, ...missing(answer.error) }
        : { ...base, grid: answer.grid, error: null });
    }
    case 'write': {
      // A statement that failed is still a statement the user ran, so it is logged too: a log that
      // only kept successes would not say what happened. It also changed nothing the tab can show, so
      // it asks for no re-read at all and the failure is reported as a notification instead.
      if (answer.error) {
        return settled({ ...base, ...missing(answer.error), log: addToLog(base.log, { sql: answer.sql, changed: 0, error: answer.error }) });
      }
      // A write invalidates the page it changed, so the grid is re-read rather than patched. The
      // statement and its values go on the log, which is what the user just did.
      const written: SqlPayload = {
        ...base,
        error: null,
        log: answer.sql ? addToLog(base.log, { sql: answer.sql, changed: answer.changed }) : base.log,
      };
      // A statement the user typed is arbitrary SQL, so it may have changed anything at all — a table
      // it created, one it dropped, a column it added. The tab reads itself again the way **Refresh**
      // does, and that schema read is also what picks an object for a tab that had none. A grid's own
      // write is one cell value in a table that already exists, so it re-reads the page and stops.
      if (followUp === 'console') {
        return { payload: written, followUp: planRequest('schema', written) };
      }
      // With no object selected there is no page to re-read, and the re-read would be issued for the
      // empty object name — which the host answers with `" is not in "<database>".` and the tab
      // would show that beside a statement it has just reported as `OK.`.
      if (written.object === '') return settled(written);
      return { payload: written, followUp: planRequest('query', written) };
    }
    case 'export': { return foldExport(key, base, answer, tabs);
    }
  }
}

/** An answer that asks for nothing further, which is most of them. */
function settled(payload: SqlPayload): SqlFold {
  return { payload, followUp: null };
}

function foldSchema(base: SqlPayload, objects: readonly SqlObject[], error: string | undefined): SqlFold {
  if (error) return settled({ ...base, objects: [...objects], ...missing(error) });
  const object = firstObject(objects, base.object);
  if (!object) return settled({ ...base, objects: [...objects], object, grid: null, error: null });
  const selected: SqlPayload = { ...base, objects: [...objects], object, error: null };
  return { payload: selected, followUp: planRequest('query', selected) };
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
): SqlFold {
  if (answer.error) return settled({ ...base, ...missing(answer.error) });
  tabs.rememberPath(key, answer.name, answer.path);
  const entry: SqlExport = { name: answer.name, size: answer.size, rows: answer.rows, ref: '' };
  return settled({ ...base, error: null, exports: addExport(base.exports, entry) });
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
