import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseManager } from './manager.js';
import { DatabaseBrowser } from './browser.js';
import { runDatabaseCommand } from './index.js';
import { initDbDir, closeAllConnections, listOpenConnections } from '../connections.js';
import { DB_PRIMER } from './primer.js';
import type { DatabaseGridQuery } from '../protocol.js';

type BrowseMethod = 'create' | 'schema' | 'query' | 'run' | 'updateCell' | 'insertRow' | 'deleteRow' | 'exportObject';

describe('DatabaseManager', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'janus-dbmgr-'));
    initDbDir(dir);
  });
  afterAll(() => {
    closeAllConnections();
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => {
    closeAllConnections();
  });

  it('exposes the db primer', () => {
    const manager = new DatabaseManager();
    expect(manager.primer).toBe(DB_PRIMER);
  });

  it('tracks a database a tab creates', () => {
    const manager = new DatabaseManager();
    const output = manager.runInTab('main', 'db sqlite create shop');
    expect(output).toContain('Created');
    expect(manager.openDbs('main')).toEqual(['shop']);
  });

  it('does not duplicate a database already tracked for the tab', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db sqlite create shop');
    manager.runInTab('main', 'db sqlite create shop');
    expect(manager.openDbs('main')).toEqual(['shop']);
  });

  it('keeps each tab tracking only the databases it opened, sorted', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db sqlite create zeta');
    manager.runInTab('main', 'db sqlite create alpha');
    manager.runInTab('other', 'db sqlite create beta');

    expect(manager.openDbs('main')).toEqual(['alpha', 'zeta']);
    expect(manager.openDbs('other')).toEqual(['beta']);
  });

  it('does not track a bare list command', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db sqlite list');
    expect(manager.openDbs('main')).toEqual([]);
  });

  it('does not track a failed command', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db postgres create shop');
    expect(manager.openDbs('main')).toEqual([]);
  });

  it('forgets a deleted database across every tab that tracked it', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db sqlite create shared');
    manager.runInTab('other', 'db sqlite create shared');

    manager.runInTab('main', 'db sqlite delete shared');

    expect(manager.openDbs('main')).toEqual([]);
    expect(manager.openDbs('other')).toEqual([]);
  });

  it('openDbs filters out databases no longer globally open', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db sqlite create shop');
    manager.close('shop');
    expect(manager.openDbs('main')).toEqual([]);
  });

  it('isCommandLine recognizes a db command line', () => {
    const manager = new DatabaseManager();
    expect(manager.isCommandLine('db sqlite list')).toBe(true);
    expect(manager.isCommandLine('no command here')).toBe(false);
  });

  it('listOpen reflects every globally open database', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db sqlite create shop');
    expect(manager.listOpen()).toContain('shop');
  });

  it('close reports whether a connection was open', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db sqlite create shop');
    expect(manager.close('shop')).toBe(true);
    expect(manager.close('shop')).toBe(false);
  });

  it('forgetTab drops tracking without closing the connection globally', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db sqlite create shop');
    manager.forgetTab('main');

    expect(manager.openDbs('main')).toEqual([]);
    expect(listOpenConnections()).toContain('shop');
  });

  it('closeAll closes every connection and clears all tab tracking', () => {
    const manager = new DatabaseManager();
    manager.runInTab('main', 'db sqlite create shop');
    manager.runInTab('other', 'db sqlite create shed');

    manager.closeAll();

    expect(listOpenConnections()).toEqual([]);
    expect(manager.openDbs('main')).toEqual([]);
    expect(manager.openDbs('other')).toEqual([]);
  });
});

describe('the browser side of DatabaseManager', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'janus-dbbrowser-'));
    initDbDir(dir);
  });
  afterAll(() => {
    closeAllConnections();
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => {
    closeAllConnections();
  });

  it('lists the databases on disk, whether or not one is open', () => {
    const manager = new DatabaseManager();
    runDatabaseCommand('db sqlite create ondisk');
    expect(manager.listFiles()).toContain('ondisk');
  });

  it('puts a browser-created database in the same registry db sqlite create does', () => {
    const manager = new DatabaseManager();
    manager.browseCreate('browsed', 'r1');
    const result = manager.readView().results.find((entry) => entry.requestId === 'r1');
    if (result?.kind !== 'schema') throw new Error('expected a schema answer');
    expect(result.database).toBe('browsed');
    expect(manager.listFiles()).toContain('browsed');
    expect(manager.listOpen()).toContain('browsed');
    expect(manager.close('browsed')).toBe(true);
  });

  it('answers the topic read with the databases and the recent answers', () => {
    const manager = new DatabaseManager();
    manager.browseCreate('readme', 'r2');
    const view = manager.readView();
    expect(view.databases.map((entry) => entry.name)).toContain('readme');
    expect(view.results.map((entry) => entry.requestId)).toContain('r2');
  });
});

// The `browse*` surface is a facade: the sql plugin addresses a request by id, and each method here
// forwards to the browser that owns the bookkeeping, so the manager never has to know a request id
// exists. Spying on the browser's prototype keeps the real forwarding under test while leaving
// SQLite out of it — what matters is that each verb and its arguments arrive unaltered.
describe('DatabaseManager browser forwarding', () => {
  const grid: DatabaseGridQuery = { object: 'orders', filters: [], global: '', order: [], limit: 10, offset: 0 };

  const cases: [string, string, (m: DatabaseManager) => void, unknown[]][] = [
    ['create', 'browseCreate', (m) => m.browseCreate('shop', 'r1'), ['shop', 'r1']],
    ['schema', 'browseSchema', (m) => m.browseSchema('shop', 'r2'), ['shop', 'r2']],
    ['query', 'browseQuery', (m) => m.browseQuery('shop', 'r3', grid), ['shop', 'r3', grid]],
    ['run', 'browseRun', (m) => m.browseRun('shop', 'r4', 'select 1', true), ['shop', 'r4', 'select 1', true]],
    ['updateCell', 'browseUpdateCell', (m) => m.browseUpdateCell('shop', 'r5', '3', 'total', null), ['shop', 'r5', '3', 'total', null]],
    ['insertRow', 'browseInsertRow', (m) => m.browseInsertRow('shop', 'r6', 'orders', [{ column: 'total', value: '7' }]), ['shop', 'r6', 'orders', [{ column: 'total', value: '7' }]]],
    ['deleteRow', 'browseDeleteRow', (m) => m.browseDeleteRow('shop', 'r7', '3'), ['shop', 'r7', '3']],
    ['exportObject', 'browseExport', (m) => m.browseExport('shop', 'r8', grid, 'csv'), ['shop', 'r8', grid, 'csv']],
  ];

  it.each(cases)('forwards %s unchanged through %s', (browserMethod, _facade, call, expected) => {
    const spy = vi.spyOn(DatabaseBrowser.prototype, browserMethod as BrowseMethod).mockReturnValue(undefined);

    call(new DatabaseManager());

    expect(spy).toHaveBeenCalledWith(...expected);
    spy.mockRestore();
  });

  it('keeps a null cell value null rather than coercing it to an empty string', () => {
    const spy = vi.spyOn(DatabaseBrowser.prototype, 'updateCell').mockReturnValue(undefined);

    new DatabaseManager().browseUpdateCell('shop', 'r5', '3', 'note', null);

    expect(spy).toHaveBeenCalledWith('shop', 'r5', '3', 'note', null);
    spy.mockRestore();
  });
});
