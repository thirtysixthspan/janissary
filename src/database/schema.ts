import type { DatabaseSync } from 'node:sqlite';
import type {
  DatabaseColumnView,
  DatabaseObjectKind,
  DatabaseObjectView,
  ForeignKey,
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

/**
 * What a column's foreign key points at, read from `PRAGMA foreign_key_list`.
 *
 * The pragma returns one row per key column: `id` groups the columns of one key, `seq` orders them
 * within it, `from` is the local column, and `table`/`to` are what they reference. A composite key is
 * therefore several rows sharing an `id`, so they have to be grouped rather than taken one per column.
 *
 * A key that names no target column references the referenced table's own primary key, and SQLite
 * writes that as a null `to`. Which column that is depends on the referenced table, so it is resolved
 * here rather than guessed — and a reference whose target cannot be resolved is left carrying an
 * empty string rather than a wrong one, so a jump filters on nothing instead of on the wrong column.
 */
function foreignKeys(database: DatabaseSync, object: string): Map<string, ForeignKey> {
  const rows = database
    .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(object)})`)
    .all() as Record<string, unknown>[];
  const groups = new Map<string, { table: string; columns: { seq: number; from: string; to: string }[] }>();
  for (const row of rows) {
    const id = String(row.id);
    const group = groups.get(id) ?? { table: String(row.table), columns: [] };
    group.columns.push({
      seq: Number(row.seq),
      from: String(row.from),
      to: row.to === null || row.to === undefined ? '' : String(row.to),
    });
    groups.set(id, group);
  }
  const byColumn = new Map<string, ForeignKey>();
  for (const group of groups.values()) {
    const ordered = group.columns.toSorted((a, b) => a.seq - b.seq);
    const fallback = ordered.every((column) => column.to === '')
      ? primaryKeyOf(database, group.table)
      : '';
    for (const [index, column] of ordered.entries()) {
      const targets = ordered.map((entry, at) => entry.to || (at === index ? fallback : ''));
      byColumn.set(column.from, { table: group.table, columns: targets });
    }
  }
  return byColumn;
}

/**
 * The single-column primary key of a referenced table, or empty when it has none that is unambiguous.
 *
 * Reads `PRAGMA table_info` directly rather than going through `objectColumns`, because that would
 * call `foreignKeys` again — and a table that references itself would recurse until the stack ran
 * out. A composite key answers empty, because "which one" is not a question with one answer.
 */
function primaryKeyOf(database: DatabaseSync, table: string): string {
  const rows = database
    .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all() as Record<string, unknown>[];
  const keyed = rows.filter((row) => Number(row.pk ?? 0) > 0);
  return keyed.length === 1 ? String(keyed[0]?.name) : '';
}

function toColumn(row: Record<string, unknown>, reference: ForeignKey | undefined): DatabaseColumnView {
  return {
    name: String(row.name),
    type: String(row.type ?? ''),
    notNull: Number(row.notnull ?? 0) === 1,
    pk: Number(row.pk ?? 0),
    ...(reference && { references: reference }),
  };
}

/** One object's columns. An unknown or unreadable name yields an empty list, never a throw. */
export function objectColumns(database: DatabaseSync, object: string): DatabaseColumnView[] {
  const rows = database
    .prepare(`PRAGMA table_info(${quoteIdentifier(object)})`)
    .all() as Record<string, unknown>[];
  const references = foreignKeys(database, object);
  return rows.map((row) => toColumn(row, references.get(String(row.name))));
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
