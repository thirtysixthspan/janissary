import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDbDir, closeAllConnections, removeDatabaseFile } from '../connections.js';
import { runDatabaseCommand } from './index.js';
import { DatabaseBrowser } from './browser.js';
import { DatabaseBrowserState, RESULT_LIMIT } from './browser-state.js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let project: string;

beforeEach(() => {
  project = mkdtempSync(path.join(tmpdir(), 'janus-browser-'));
  initDbDir(project);
});

afterEach(() => {
  closeAllConnections();
  rmSync(project, { recursive: true, force: true });
});

const SHOP = `
  CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT);
  INSERT INTO orders (status) VALUES ('paid'), ('open');
  CREATE TABLE logs (line TEXT);
`;

// A read no longer materializes a database, so a test that wants a schema creates one first — which
// is the order a user is in, and the only one `db sqlite query` ever allowed either.
function seeded(browser: DatabaseBrowser, sql = SHOP): void {
  browser.create('shop', browser.requestId());
  browser.run('shop', browser.requestId(), sql, false);
}

describe('DatabaseBrowserState', () => {
  it('mints a request id no answer already carries', () => {
    const state = new DatabaseBrowserState();
    const ids = [state.requestId(), state.requestId(), state.requestId()];
    expect(new Set(ids).size).toBe(3);
  });

  it('records an answer and publishes it newest first', () => {
    const state = new DatabaseBrowserState();
    state.record({ kind: 'schema', requestId: 'q1', database: 'a', objects: [] });
    state.record({ kind: 'schema', requestId: 'q2', database: 'a', objects: [] });
    expect(state.results().map((result) => result.requestId)).toEqual(['q2', 'q1']);
  });

  it('caps the published answers and drops the oldest', () => {
    const state = new DatabaseBrowserState();
    for (let i = 0; i < RESULT_LIMIT + 5; i++) {
      state.record({ kind: 'schema', requestId: `q${i}`, database: 'a', objects: [] });
    }
    const results = state.results();
    expect(results).toHaveLength(RESULT_LIMIT);
    expect(results[0]?.requestId).toBe(`q${RESULT_LIMIT + 4}`);
    expect(results.some((result) => result.requestId === 'q0')).toBe(false);
  });

  it('publishes a failure as an error rather than as an empty success', () => {
    const state = new DatabaseBrowserState();
    state.record({ kind: 'schema', requestId: 'q1', database: 'a', objects: [], error: 'Query error: no such table' });
    expect(state.results()[0]).toMatchObject({ error: 'Query error: no such table' });
  });

  it('forgets everything it published on dispose', () => {
    const state = new DatabaseBrowserState();
    state.record({ kind: 'schema', requestId: 'q1', database: 'a', objects: [] });
    state.clear();
    expect(state.results()).toEqual([]);
  });
});

describe('DatabaseBrowser', () => {
  it('answers a schema read with every object, tables first', () => {
    const browser = new DatabaseBrowser();
    browser.create('shop');
    seeded(browser, SHOP);
    const requestId = browser.requestId();
    browser.schema('shop', requestId);
    const answer = browser.view().results.find((result) => result.requestId === requestId);
    expect(answer?.kind).toBe('schema');
    if (answer?.kind !== 'schema') return;
    expect(answer.objects.map((object) => `${object.kind}:${object.name}`)).toEqual(['table:logs', 'table:orders']);
    expect(answer.objects[1]?.writable).toBe(true);
    expect(answer.objects[0]?.writable).toBe(false);
    browser.dispose();
  });

  it('creates a database that does not exist and answers with its empty object list', () => {
    const browser = new DatabaseBrowser();
    const requestId = browser.requestId();
    browser.create('fresh', requestId);
    const answer = browser.view().results.find((result) => result.requestId === requestId);
    expect(answer).toEqual({ kind: 'schema', requestId, database: 'fresh', objects: [] });
    expect(browser.view().databases.map((ref) => `${ref.name}:${ref.exists}`)).toContain('fresh:true');
    browser.dispose();
  });

  it('answers a grid query with a page, its totals, and a key per row', () => {
    const browser = new DatabaseBrowser();
    seeded(browser, SHOP);
    const requestId = browser.requestId();
    browser.query('shop', requestId, { object: 'orders', filters: [], order: [], limit: 10, offset: 0 });
    const answer = browser.view().results.find((result) => result.requestId === requestId);
    if (answer?.kind !== 'query') throw new Error('expected a query answer');
    expect(answer.grid.columns).toEqual(['id', 'status']);
    expect(answer.grid.total).toBe(2);
    expect(answer.grid.rows.map((row) => row.cells[1].text)).toEqual(['paid', 'open']);
    expect(answer.grid.rows[0]?.key).not.toBe('');
    browser.dispose();
  });

  it('applies a filter and reports both totals', () => {
    const browser = new DatabaseBrowser();
    seeded(browser, SHOP);
    const first = browser.requestId();
    browser.query('shop', first, { object: 'orders', filters: [], order: [], limit: 10, offset: 0 });
    const second = browser.requestId();
    browser.query('shop', second, { object: 'orders', filters: [{ column: 'status', op: 'eq', value: 'paid' }], order: [], limit: 10, offset: 0 });
    const answer = browser.view().results.find((result) => result.requestId === second);
    if (answer?.kind !== 'query') throw new Error('expected a query answer');
    expect(answer.grid.total).toBe(1);
    expect(answer.grid.unfilteredTotal).toBe(2);
    browser.dispose();
  });

  it('counts an object whole the first time a filtered query asks about it', () => {
    const browser = new DatabaseBrowser();
    seeded(browser, SHOP);
    // Jumping into a table the tab has never shown issues a filtered query as that table's first,
    // and the cache would otherwise keep that filtered count as the object's size for good.
    const requestId = browser.requestId();
    browser.query('shop', requestId, { object: 'orders', filters: [{ column: 'status', op: 'eq', value: 'paid' }], order: [], limit: 10, offset: 0 });
    const first = browser.view().results.find((result) => result.requestId === requestId);
    if (first?.kind !== 'query') throw new Error('expected a query answer');
    expect(first.grid.total).toBe(1);
    expect(first.grid.unfilteredTotal).toBe(2);
    const second = browser.requestId();
    browser.query('shop', second, { object: 'orders', filters: [{ column: 'status', op: 'eq', value: 'open' }], order: [], limit: 10, offset: 0 });
    const answer = browser.view().results.find((result) => result.requestId === second);
    if (answer?.kind !== 'query') throw new Error('expected a query answer');
    expect(answer.grid.unfilteredTotal).toBe(2);
    browser.dispose();
  });

  it('records a query for an object the database does not have as an error, not an empty page', () => {
    const browser = new DatabaseBrowser();
    seeded(browser, SHOP);
    const requestId = browser.requestId();
    browser.query('shop', requestId, { object: 'nope', filters: [], order: [], limit: 10, offset: 0 });
    const answer = browser.view().results.find((result) => result.requestId === requestId);
    if (answer?.kind !== 'query') throw new Error('expected a query answer');
    expect(answer.error).toBe('"nope" is not in "shop".');
    expect(answer.grid.rows).toEqual([]);
    browser.dispose();
  });

  it('routes a read statement to the grid and a write statement through exec', () => {
    const browser = new DatabaseBrowser();
    seeded(browser, SHOP);
    const read = browser.requestId();
    browser.run('shop', read, 'SELECT status FROM orders', true);
    const write = browser.requestId();
    browser.run('shop', write, "UPDATE orders SET status = 'x'; UPDATE orders SET status = 'y';", false);
    const results = browser.view().results;
    const readAnswer = results.find((result) => result.requestId === read);
    const writeAnswer = results.find((result) => result.requestId === write);
    expect(readAnswer?.kind).toBe('query');
    expect(writeAnswer).toMatchObject({ kind: 'write', changed: 0 });
    expect(new DatabaseSync(path.join(project, '.janissary', 'db', 'sqlite', 'shop.sqlite'), { readOnly: true })
      .prepare('SELECT DISTINCT status FROM orders').all()).toEqual([{ status: 'y' }]);
    browser.dispose();
  });

  it('updates, inserts, and deletes through a row key, and reports the change', () => {
    const browser = new DatabaseBrowser();
    seeded(browser, SHOP);
    const queryId = browser.requestId();
    browser.query('shop', queryId, { object: 'orders', filters: [], order: [], limit: 10, offset: 0 });
    const page = browser.view().results.find((result) => result.requestId === queryId);
    if (page?.kind !== 'query') throw new Error('expected a query answer');
    const first = page.grid.rows[0]?.key ?? '';

    const updateId = browser.requestId();
    browser.updateCell('shop', updateId, first, 'status', 'shipped');
    expect(browser.view().results.find((result) => result.requestId === updateId))
      .toMatchObject({ kind: 'write', changed: 1 });

    const insertId = browser.requestId();
    browser.insertRow('shop', insertId, 'orders', [{ column: 'id', value: null }, { column: 'status', value: 'new' }]);
    expect(browser.view().results.find((result) => result.requestId === insertId))
      .toMatchObject({ kind: 'write', changed: 1 });

    const deleteId = browser.requestId();
    browser.deleteRow('shop', deleteId, first);
    expect(browser.view().results.find((result) => result.requestId === deleteId))
      .toMatchObject({ kind: 'write', changed: 1 });
    browser.dispose();
  });

  it('refuses a write to a table with no primary key, and says why', () => {
    const browser = new DatabaseBrowser();
    seeded(browser, SHOP);
    const requestId = browser.requestId();
    browser.insertRow('shop', requestId, 'logs', [{ column: 'line', value: 'x' }]);
    expect(browser.view().results.find((result) => result.requestId === requestId))
      .toMatchObject({ error: 'This table has no primary key, so its rows cannot be addressed.' });
    browser.dispose();
  });

  it('answers a statistics read with one entry per column', () => {
    const browser = new DatabaseBrowser();
    seeded(browser, SHOP);
    const requestId = browser.requestId();
    browser.stats('shop', requestId, 'orders');
    const answer = browser.view().results.find((result) => result.requestId === requestId);
    if (answer?.kind !== 'stats') throw new Error('expected a stats answer');
    expect(answer.columns.map((column) => column.name)).toEqual(['id', 'status']);
    expect(answer.columns[1]).toMatchObject({ nulls: 0, distinct: 2, total: 2 });
    browser.dispose();
  });

  it('reports a statistics read for an object the database does not have as an error', () => {
    const browser = new DatabaseBrowser();
    seeded(browser, SHOP);
    const requestId = browser.requestId();
    browser.stats('shop', requestId, 'nope');
    expect(browser.view().results.find((result) => result.requestId === requestId))
      .toMatchObject({ kind: 'stats', columns: [], error: '"nope" is not in "shop".' });
    browser.dispose();
  });

  it('lists the databases on disk with whether each exists and is open', () => {
    const browser = new DatabaseBrowser();
    browser.create('alpha');
    browser.create('beta');
    expect(browser.view().databases).toEqual([
      { name: 'alpha', exists: true, open: true },
      { name: 'beta', exists: true, open: true },
    ]);
    browser.dispose();
  });
  it('refuses a read for a database that was deleted, and does not bring the file back', () => {
    const browser = new DatabaseBrowser();
    seeded(browser);
    const requestId = browser.requestId();
    browser.schema('shop', requestId);
    runDatabaseCommand('db sqlite delete shop');
    const after = browser.requestId();
    browser.schema('shop', after);
    expect(browser.view().results.find((result) => result.requestId === after))
      .toMatchObject({ error: 'Database "shop" does not exist. Create it to start.' });
    expect(existsSync(path.join(project, '.janissary', 'db', 'sqlite', 'shop.sqlite'))).toBe(false);
    browser.dispose();
  });

  it('refuses a grid query for a deleted database rather than answering from a fresh empty one', () => {
    const browser = new DatabaseBrowser();
    seeded(browser);
    runDatabaseCommand('db sqlite delete shop');
    const requestId = browser.requestId();
    browser.query('shop', requestId, { object: 'orders', filters: [], order: [], limit: 10, offset: 0 });
    const answer = browser.view().results.find((result) => result.requestId === requestId);
    if (answer?.kind !== 'query') throw new Error('expected a query answer');
    expect(answer.error).toContain('does not exist');
    expect(answer.grid.rows).toEqual([]);
    browser.dispose();
  });

  it('reads a database that has no file but an open connection, so a delete racing an open still works', () => {
    const browser = new DatabaseBrowser();
    seeded(browser);
    removeDatabaseFile('shop');
    const requestId = browser.requestId();
    browser.schema('shop', requestId);
    expect(browser.view().results.find((result) => result.requestId === requestId)).not.toMatchObject({ error: expect.anything() });
    browser.dispose();
  });
});
