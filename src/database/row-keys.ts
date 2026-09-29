import type { DatabaseColumnView } from '../protocol.js';
import { quoteIdentifier } from './schema.js';

// What a minted row key stands for. The primary-key values never leave the server, which is the
// whole of the safety story: a client names a row by a token it was handed and cannot write a
// `WHERE` clause of its own. A key names no database either — `DatabaseBrowser` keeps one store per
// database, so a key minted elsewhere does not resolve at all, and the write is handed a handle its
// caller already opened and checked.
export type RowTarget = {
  object: string;
  values: (string | number)[];
};

// How many pages' worth of keys stay resolvable. A write against an evicted key is refused rather
// than retargeted, so this only needs to outlive the time between a page rendering and a click on
// it — a handful of pages is generous, and the bound is what keeps the map from growing with use.
const RESOLVED_PAGES = 8;

export class RowKeyStore {
  private next = 1;
  private readonly targets = new Map<string, RowTarget>();
  private readonly pages: string[][] = [];

  /** Start a new page's bucket, so a superseded page is released as one rather than row by row. */
  beginPage(): void {
    this.pages.push([]);
  }

  /** A fresh opaque key for one row of `object`, addressed by its primary-key column values. */
  mint(object: string, columns: DatabaseColumnView[], row: Record<string, unknown>): string {
    const key = `r${this.next++}`;
    const values = columns.map((column) => coerce(row[column.name]));
    this.targets.set(key, { object, values });
    if (this.pages.length === 0) this.beginPage();
    this.pages.at(-1)?.push(key);
    this.trim();
    return key;
  }

  /**
   * Where a key points, or `undefined` when it was never minted or has been released. Callers treat
   * the two the same and say so to the user: both mean the client is holding a row the server no
   * longer does, and the only correct answer is to re-read the page.
   */
  resolve(key: string): RowTarget | undefined {
    return this.targets.get(key);
  }

  private trim(): void {
    while (this.pages.length > RESOLVED_PAGES) {
      const released = this.pages.shift() ?? [];
      for (const key of released) this.targets.delete(key);
    }
  }
}

/** SQLite values cross the wire as text or a number; a bigint or a buffer becomes its own text. */
export function coerce(value: unknown): string | number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  return String(value);
}

/** A `WHERE` addressing exactly one row, built from the values the key was minted with. */
export function targetWhere(target: RowTarget, columns: DatabaseColumnView[]): string {
  const keys = columns.filter((column) => column.pk > 0).toSorted((a, b) => a.pk - b.pk);
  return keys.map((column) => `${quoteIdentifier(column.name)} = ?`).join(' AND ');
}
