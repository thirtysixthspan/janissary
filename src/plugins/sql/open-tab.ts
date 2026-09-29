import type { TabPluginServerCapabilities } from '../api.js';
import type { SqlPayload } from './shared.js';
import type { SqlTabs } from './tabs.js';
import { databasesFrom, emptyPayload, instanceKeyFor, issue, refs } from './tabs.js';

export type Dock = 'left' | 'right' | null | undefined;

/**
 * Open or focus one database's tab, and read its schema the first time.
 *
 * A tab already open keeps the payload it has — its filters, its page, its exports — so `sql notes`
 * twice focuses the tab that is already there rather than resetting it. `dock` is passed straight
 * through, including `undefined` for "no dock argument", which is what leaves an already-docked tab
 * where it is instead of undocking it as a side effect of being reopened.
 */
export function openDatabase(
  database: string,
  dock: Dock,
  capabilities: TabPluginServerCapabilities,
  tabs: SqlTabs,
): void {
  const key = instanceKeyFor(database);
  const existing = tabs.read(key);
  if (existing) {
    capabilities.openOrFocusTab(key, () => ({ title: database, payload: existing }));
    if (dock !== undefined) capabilities.dockTab(key, dock);
    return;
  }
  const seed: SqlPayload = emptyPayload(database, refs(databasesFrom(capabilities).databases));
  const pending = issue('schema', seed, capabilities);
  const payload: SqlPayload = { ...seed, pending };
  tabs.write(key, payload);
  capabilities.openOrFocusTab(key, () => ({ title: database, payload }));
  if (dock !== undefined) capabilities.dockTab(key, dock);
}

