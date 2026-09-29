import type { DatabaseSync } from 'node:sqlite';
import type {
  DatabaseColumnView,
  DatabaseObjectKind,
  DatabaseObjectView,
} from '../protocol.js';

// Reads a database's object list for the schema navigator. Every name in here came out of
// `sqlite_schema`, so the only quoting the callers still need is the doubled `"` this module applies
// when it builds a `PRAGMA` for one of them.

const OBJECT_QUERY = [
  "SELECT name, type FROM sqlite_schema",
  "WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','view','index','trigger')",
  'ORDER BY type, name',
].join(' ');

// The navigator groups objects; the order it lists the groups in is its own, not the query's.
const KIND_ORDER: DatabaseObjectKind[] = ['table', 'view', 'index', 'trigger'];

export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function kindOf(type: string): DatabaseObjectKind {
  return ['view', 'index', 'trigger'].includes(type) ? type as DatabaseObjectKind : 'table';
}

function toColumn(row: Record<string, unknown>): DatabaseColumnView {
  return {
    name: String(row.name),
    type: String(row.type ?? ''),
    notNull: Number(row.notnull ?? 0) === 1,
    pk: Number(row.pk ?? 0),
  };
}

/** One object's columns. An unknown or unreadable name yields an empty list, never a throw. */
export function objectColumns(database: DatabaseSync, object: string): DatabaseColumnView[] {
  const rows = database
    .prepare(`PRAGMA table_info(${quoteIdentifier(object)})`)
    .all() as Record<string, unknown>[];
  return rows.map((row) => toColumn(row));
}

/**
 * Whether the database has an object by this name. `objectColumns` answers an unknown name with an
 * empty list, which on its own is indistinguishable from a table the user has no columns for — so
 * the grid and the statistics panel check here first and say which case it is.
 */
export function hasObject(database: DatabaseSync, object: string): boolean {
  const row = database
    .prepare("SELECT 1 AS n FROM sqlite_schema WHERE name = ? AND name NOT LIKE 'sqlite_%'")
    .get(object);
  return row !== undefined;
}

/** Whether rows of this object can be addressed individually, which is what makes a write safe. */
export function isWritable(kind: DatabaseObjectKind, columns: DatabaseColumnView[]): boolean {
  return kind === 'table' && columns.some((column) => column.pk > 0);
}

/** The primary key's columns in key order — a composite key is addressed by all of them. */
export function primaryKeyColumns(columns: DatabaseColumnView[]): DatabaseColumnView[] {
  return columns.filter((column) => column.pk > 0).toSorted((a, b) => a.pk - b.pk);
}

/** Every object in the database, tables first, each with its columns and whether it is writable. */
export function schemaObjects(database: DatabaseSync): DatabaseObjectView[] {
  const rows = database.prepare(OBJECT_QUERY).all() as Record<string, unknown>[];
  return rows
    .map((row) => {
      const name = String(row.name);
      const kind = kindOf(String(row.type));
      const columns = objectColumns(database, name);
      return { name, kind, columns, writable: isWritable(kind, columns) };
    })
    .toSorted((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
}
