import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseManager } from './manager.js';
import { initDbDir, closeAllConnections, listOpenConnections } from '../connections.js';
import { DB_PRIMER } from './index.js';

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

  it('extract delegates to extractDatabaseCommand', () => {
    const manager = new DatabaseManager();
    expect(manager.extract('db sqlite list')).toBe('db sqlite list');
    expect(manager.extract('no command here')).toBeUndefined();
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
