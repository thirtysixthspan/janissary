import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDbDir } from '../connections.js';
import { csvField, exportDir, exportRows, safeFileName, EXPORT_ROW_LIMIT } from './export.js';
import { objectColumns } from './schema.js';
import type { DatabaseGridQuery } from '../protocol.js';

const SHOP = `
  CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, note TEXT);
  INSERT INTO orders (customer, note) VALUES
    ('ada', 'plain'),
    ('bo, the second', 'has a comma'),
    ('cy', 'has "quotes"'),
    ('di', 'has
a newline');
`;

function query(over: Partial<DatabaseGridQuery> = {}): DatabaseGridQuery {
  return { object: 'orders', filters: [], order: [], limit: 100, offset: 0, ...over };
}

let project: string;
let database: DatabaseSync;

beforeEach(() => {
  project = mkdtempSync(path.join(tmpdir(), 'janus-export-'));
  database = new DatabaseSync(':memory:');
  initDbDir(project);
  database.exec(SHOP);
});

afterEach(() => {
  database.close();
  rmSync(project, { recursive: true, force: true });
});

function run(format: 'csv' | 'json', over: Partial<DatabaseGridQuery> = {}) {
  return exportRows(database, 'shop', query(over), objectColumns(database, 'orders'), format, 4);
}

describe('csvField', () => {
  it('quotes a field holding a comma, a quote, or a line break, and doubles an interior quote', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });
});

describe('safeFileName', () => {
  it('leaves a name a filename can already carry alone', () => {
    expect(safeFileName('orders')).toBe('orders');
    expect(safeFileName('orders_2-v1.3')).toBe('orders_2-v1.3');
  });

  it('reduces a traversal and a separator to dashes rather than passing them through', () => {
    // Dots survive — a traversal needs a separator, not a dot, so `..-..-escape` is one path
    // component and cannot leave the directory. What must not survive is the separator.
    expect(safeFileName('../../escape')).toBe('..-..-escape');
    expect(safeFileName('a/b')).toBe('a-b');
    expect(safeFileName('..')).toBeNull();
    expect(safeFileName('.')).toBeNull();
    expect(safeFileName('')).toBeNull();
    expect(safeFileName('---')).toBeNull();
  });
});

describe('exportDir', () => {
  it('sits beside the databases under the project directory', () => {
    expect(exportDir()).toBe(path.join(project, '.janissary', 'db', 'exports'));
  });
});

describe('exportRows', () => {
  it('writes every row of the query, not one page of it', () => {
    const outcome = run('csv');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const lines = readFileSync(outcome.path, 'utf8').trimEnd().split('\r\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('id,customer,note');
    expect(outcome.rows).toBe(4);
  });

  it('round-trips through JSON as objects keyed by column name', () => {
    const outcome = run('json');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const parsed = JSON.parse(readFileSync(outcome.path, 'utf8')) as { customer: string }[];
    expect(parsed).toHaveLength(4);
    expect(parsed[1]).toEqual({ id: 2, customer: 'bo, the second', note: 'has a comma' });
  });

  it('runs the filters and order the grid is showing', () => {
    const outcome = run('csv', { order: [{ column: 'id', desc: true }] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(readFileSync(outcome.path, 'utf8')).toMatch(/^id,customer,note\r\n4,di,/);
  });

  it('names a second export of the same object distinctly rather than overwriting the first', () => {
    const first = run('csv');
    const second = run('csv');
    expect(first.ok && second.ok && first.name !== second.name).toBe(true);
    expect(readFileSync(path.join(exportDir(project), 'shop-orders-1.csv'), 'utf8')).toHaveLength(
      readFileSync(path.join(exportDir(project), 'shop-orders-2.csv'), 'utf8').length,
    );
  });

  it('reports a size that reflects what it wrote', () => {
    const outcome = run('csv');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.size).toMatch(/B$/);
  });

  it('refuses an object with no columns', () => {
    const outcome = exportRows(database, 'shop', query(), [], 'csv', 0);
    expect(outcome).toEqual({ ok: false, error: '"orders" has no columns.' });
  });

  it('refuses an export over the stated ceiling, naming the row count', () => {
    const outcome = exportRows(database, 'shop', query(), objectColumns(database, 'orders'), 'csv', EXPORT_ROW_LIMIT + 1);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBe(`Export too large: ${(EXPORT_ROW_LIMIT + 1).toLocaleString('en-US')} rows (limit ${EXPORT_ROW_LIMIT.toLocaleString('en-US')}). Add a filter and try again.`);
  });
});

describe('an object whose name is not a filename', () => {
  const AWKWARD = 'CREATE TABLE "../../escape" (a TEXT); INSERT INTO "../../escape" VALUES (\'x\');';

  beforeEach(() => { database.exec(AWKWARD); });

  it('writes the export inside the export directory rather than following the name out of it', () => {
    const outcome = exportRows(database, 'shop', query({ object: '../../escape' }), objectColumns(database, '../../escape'), 'csv', 1);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(path.dirname(outcome.path)).toBe(exportDir());
    expect(outcome.name).toBe('shop-..-..-escape-1.csv');
    expect(existsSync(outcome.path)).toBe(true);
  });

  it('numbers two exports of it distinctly rather than overwriting the first', () => {
    const first = exportRows(database, 'shop', query({ object: '../../escape' }), objectColumns(database, '../../escape'), 'csv', 1);
    const second = exportRows(database, 'shop', query({ object: '../../escape' }), objectColumns(database, '../../escape'), 'csv', 1);
    expect(first.ok && second.ok && first.name !== second.name).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(existsSync(first.path) && existsSync(second.path)).toBe(true);
  });

  it('refuses a name with nothing a file could carry, rather than writing a bare numbered name', () => {
    const odd = new DatabaseSync(':memory:');
    try {
      odd.exec('CREATE TABLE ".." (a TEXT)');
      const outcome = exportRows(odd, 'shop', query({ object: '..' }), objectColumns(odd, '..'), 'csv', 0);
      expect(outcome).toEqual({ ok: false, error: 'Cannot export "..": its name has no characters a file can carry.' });
    } finally {
      odd.close();
    }
  });
});
