import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initDbDir, closeAllConnections, dbPath } from '../connections.js';
import { DatabaseBrowser } from './browser.js';
import type { DatabaseGridQuery } from '../protocol.js';

// Every answer the browser publishes is a recorded answer, never a throw: the sql plugin is a window
// the user is typing into, and a failure that escaped would take the tab with it. These cases are the
// arms where something went wrong — a file that will not open, a statement that will not run — and
// what the window is shown instead.
let project: string;
let minted: number;

beforeEach(() => {
  project = mkdtempSync(path.join(tmpdir(), 'janus-browser-faults-'));
  initDbDir(project);
  minted = 0;
});

afterEach(() => {
  closeAllConnections();
  rmSync(project, { recursive: true, force: true });
});

function nextId(): string {
  minted += 1;
  return `f${minted}`;
}

function query(over: Partial<DatabaseGridQuery> = {}): DatabaseGridQuery {
  return { object: 'orders', filters: [], global: '', order: [], limit: 10, offset: 0, ...over };
}

const SHOP = `
  CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT);
  INSERT INTO orders (status) VALUES ('paid'), ('open');
`;

// A directory where the database file belongs: it exists, so the guard lets the open through, and the
// open is what fails. That is the shape of a path that has been taken by something else.
function occupyWithDirectory(name: string): void {
  const file = dbPath(name);
  mkdirSync(path.dirname(file), { recursive: true });
  mkdirSync(file);
}

function lastResult(browser: DatabaseBrowser) {
  return browser.view().results[0];
}

describe('a database whose file will not open', () => {
  it('answers a create with the failure rather than an empty object list', () => {
    const browser = new DatabaseBrowser();
    occupyWithDirectory('blocked');

    browser.create('blocked', nextId());

    const result = lastResult(browser);
    expect(result?.kind).toBe('schema');
    expect(result).toMatchObject({ database: 'blocked', objects: [], error: expect.stringMatching(/./u) });
  });

  // A statement that never reached SQLite is reported as the write it was asked for — the open is
  // what failed, so there is no result set to hand back either way.
  it('answers a read statement with the failure, so the grid is never drawn half-built', () => {
    const browser = new DatabaseBrowser();
    occupyWithDirectory('blocked');

    browser.run('blocked', nextId(), 'select 1', true);

    const result = lastResult(browser);
    expect(result?.kind).toBe('write');
    expect(result).toMatchObject({ database: 'blocked', sql: 'select 1', error: expect.stringMatching(/./u) });
  });

  it('answers an export with the failure and no path', () => {
    const browser = new DatabaseBrowser();
    occupyWithDirectory('blocked');

    browser.exportObject('blocked', nextId(), query(), 'csv');

    expect(lastResult(browser)).toMatchObject({ kind: 'export', path: '', rows: 0, error: expect.stringMatching(/./u) });
  });
});

describe('a statement that will not run', () => {
  it('records a write that exec refused, carrying the database message', () => {
    const browser = new DatabaseBrowser();
    browser.create('shop', nextId());
    browser.run('shop', nextId(), SHOP, false);

    browser.run('shop', nextId(), 'this is not sql', false);

    const result = lastResult(browser);
    expect(result?.kind).toBe('write');
    expect(result).toMatchObject({ database: 'shop', sql: 'this is not sql', changed: 0, error: expect.stringMatching(/./u) });
  });

  // The grid statement is built from the client's own filter list, so a column that is not in the
  // object reaches SQLite as written. The failure has to land as an answer on that request.
  it('records a grid query naming a column the object does not have', () => {
    const browser = new DatabaseBrowser();
    browser.create('shop', nextId());
    browser.run('shop', nextId(), SHOP, false);

    browser.query('shop', nextId(), query({ filters: [{ column: 'nope', op: 'eq', value: 'x' }] }));

    const result = lastResult(browser);
    expect(result?.kind).toBe('query');
    expect(result).toMatchObject({ database: 'shop', error: expect.stringMatching(/nope/u) });
  });

  it('answers an export whose count could not run with the failure and no path', () => {
    const browser = new DatabaseBrowser();
    browser.create('shop', nextId());
    browser.run('shop', nextId(), SHOP, false);

    browser.exportObject('shop', nextId(), query({ filters: [{ column: 'nope', op: 'eq', value: 'x' }] }), 'json');

    expect(lastResult(browser)).toMatchObject({ kind: 'export', path: '', error: expect.stringMatching(/nope/u) });
  });

  it('keeps answering after a failure, so one bad statement does not disable the tab', () => {
    const browser = new DatabaseBrowser();
    browser.create('shop', nextId());
    browser.run('shop', nextId(), SHOP, false);

    browser.run('shop', nextId(), 'this is not sql', false);
    const good = nextId();
    browser.query('shop', good, query());

    const result = browser.view().results.find((entry) => entry.requestId === good);
    expect(result).toMatchObject({ kind: 'query', database: 'shop' });
    expect(result).not.toHaveProperty('error');
  });
});