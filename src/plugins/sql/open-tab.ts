import type { TabPluginServerCapabilities } from '../api.js';
import type { SqlPayload } from './shared.js';
import type { SqlTabs } from './tabs.js';
import { databasesFrom, emptyPayload, instanceKeyFor, refs } from './tabs.js';
import { dispatch, planRequest } from './request.js';

export type Dock = 'left' | 'right' | null | undefined;

/** What `db sqlite query` already says for a database that is not there, reused word for word. */
export const UNKNOWN_DATABASE = (name: string): string =>
  `No database named "${name}". Create it with: db sqlite create ${name}`;

/**
 * Open or focus one database's tab, and read its schema the first time.
 *
 * A tab already open keeps the payload it has — its filters, its page, its exports — so `sql notes`
 * twice focuses the tab that is already there rather than resetting it. `dock` is passed straight
 * through, including `undefined` for "no dock argument", which is what leaves an already-docked tab
 * where it is instead of undocking it as a side effect of being reopened.
 *
 * A name the registry has never heard of is refused rather than created, because reading a schema
 * opens a connection and opening a connection creates the file: a name that is a typo would leave an
 * empty database behind that nothing ever asked for. `db sqlite create <name>` is how a database is
 * made.
 */
export function openDatabase(
  database: string,
  dock: Dock,
  capabilities: TabPluginServerCapabilities,
  tabs: SqlTabs,
): void {
  const known = databasesFrom(capabilities).databases.some((entry) => entry.name === database);
  if (!known) capabilities.rejectRequest(UNKNOWN_DATABASE(database));
  const key = instanceKeyFor(database);
  const existing = tabs.read(key);
  if (existing) {
    capabilities.openOrFocusTab(key, () => ({ title: database, payload: existing }));
    if (dock !== undefined) capabilities.dockTab(key, dock);
    return;
  }
  const seed: SqlPayload = emptyPayload(database, refs(databasesFrom(capabilities).databases));
  // The tab is opened and recorded before the schema is asked for: the host delivers the answer
  // synchronously, and a notification for a plugin with no open tab is dropped rather than queued,
  // so asking first loses the answer outright and leaves the tab on `Loading…` forever.
  dispatch(key, seed, planRequest('schema', seed), capabilities, tabs, (payload) => {
    capabilities.openOrFocusTab(key, () => ({ title: database, payload }));
    if (dock !== undefined) capabilities.dockTab(key, dock);
  });
}
