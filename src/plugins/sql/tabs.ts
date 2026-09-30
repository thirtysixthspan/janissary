import {
  type DatabasesView,
  type DatabaseResultView,
  type TabPluginServerCapabilities,
} from '../api.js';
import { PAGE_SIZES } from './shared-intents.js';
import type {
  SqlDatabaseRef,
  SqlExport,
  SqlObject,
  SqlPayload,
} from './shared.js';

export const DEFAULT_PAGE_SIZE = 100;
export const NO_DATABASES = 'No databases. Create one with: db sqlite create <name>';
export const USAGE = 'Usage: sql [<database>] [left|right]';

// How many finished exports a tab keeps. The files stay on disk; only the allow-list references are
// bounded, because a tab holding a thousand of them would register a thousand of them.
export const MAX_EXPORTS = 5;

/** The topic's data, or the failure that means the host handed this plugin something unusable. */
export function databasesFrom(capabilities: TabPluginServerCapabilities): DatabasesView {
  const data = capabilities.topicData('databases');
  if (!isDatabasesData(data)) return capabilities.reportFailure('invalid databases topic data');
  return data;
}

function isDatabasesData(data: unknown): data is DatabasesView {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    && Array.isArray((data as DatabasesView).databases)
    && Array.isArray((data as DatabasesView).results);
}

export function refs(databases: DatabasesView['databases']): SqlDatabaseRef[] {
  return databases.map((entry) => ({ name: entry.name, exists: entry.exists, open: entry.open }));
}

/** The payload a tab opens with: the database named, and nothing read yet. */
export function emptyPayload(database: string, databases: readonly SqlDatabaseRef[]): SqlPayload {
  return {
    database,
    databases: [...databases],
    objects: [],
    object: '',
    filters: [],
    hidden: [],
    global: '',
    order: [],
    limit: DEFAULT_PAGE_SIZE,
    offset: 0,
    pageSizes: [...PAGE_SIZES],
    grid: null,
    exports: [],
    error: null,
    pending: null,
  };
}

export function instanceKeyFor(database: string): string {
  return `sqlite:${database}`;
}

/**
 * The object worth showing: the selected one while it is still there, else the first table, since a
 * table is the one an object grid can actually browse. This is what turns "opened a database" into
 * "opened a database and showed me its first table" without the client having to ask twice.
 */
export function firstObject(entries: readonly SqlObject[], selected: string): string {
  if (selected && entries.some((entry) => entry.name === selected)) return selected;
  return entries.find((entry) => entry.kind === 'table')?.name ?? entries[0]?.name ?? '';
}

export function addExport(exports: readonly SqlExport[], entry: SqlExport): SqlExport[] {
  return [entry, ...exports].slice(0, MAX_EXPORTS);
}

export function resultFor(data: DatabasesView, id: string, database: string): DatabaseResultView | undefined {
  return data.results.find((result) => result.requestId === id && result.database === database);
}

/**
 * The tab state a host notification cannot reconstruct. The payload is the view, but a notification
 * carries no payloads, so the plugin keeps the last one it wrote per tab in order to fold the next
 * answer into it, plus each finished export's path so its `/open/` reference is registered exactly
 * once. Pruned against the open-tab set on every notification, so nothing outlives its tab.
 */
export class SqlTabs {
  private readonly payloads = new Map<string, SqlPayload>();
  private readonly paths = new Map<string, Map<string, string>>();

  read(key: string): SqlPayload | undefined {
    return this.payloads.get(key);
  }

  write(key: string, payload: SqlPayload): void {
    this.payloads.set(key, payload);
    const live = new Set(payload.exports.map((entry) => entry.name));
    const paths = this.paths.get(key);
    if (!paths) return;
    for (const name of paths.keys()) {
      if (!live.has(name)) paths.delete(name);
    }
  }

  rememberPath(key: string, name: string, file: string): void {
    const forTab = this.paths.get(key) ?? new Map<string, string>();
    forTab.set(name, file);
    this.paths.set(key, forTab);
  }

  pathFor(key: string, name: string): string | undefined {
    return this.paths.get(key)?.get(name);
  }

  prune(keys: readonly string[]): void {
    const open = new Set(keys);
    for (const key of this.payloads.keys()) {
      if (!open.has(key)) this.payloads.delete(key);
    }
    for (const key of this.paths.keys()) {
      if (!open.has(key)) this.paths.delete(key);
    }
  }

  dispose(): void {
    this.payloads.clear();
    this.paths.clear();
  }
}
