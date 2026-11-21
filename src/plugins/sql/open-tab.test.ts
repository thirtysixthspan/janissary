import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type DatabasesView,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
} from '../api.js';
import { openDatabase, UNKNOWN_DATABASE } from './open-tab.js';
import type { SqlPayload } from './shared.js';
import { SqlTabs } from './tabs.js';

const REFS: DatabasesView['databases'] = [{ name: 'shop', exists: true, open: true }];
type Opened = { key: string; title: string; payload: SqlPayload };

/** A host that records opened tabs, and whose topic data holds only registry names. */
function fake(databases: DatabasesView['databases'] = REFS) {
  const tabs = new SqlTabs();
  const view: DatabasesView = { databases, results: [], lastOpened: null };
  const opened: Opened[] = [];
  const capabilities = {
    topicData: () => view,
    // Nothing answers the schema read; these cases assert the tab, not the fold.
    topicAction: vi.fn(),
    // Report opened keys so `prune` keeps the payload the reopen case observes.
    ownTabKeys: () => opened.map((entry) => entry.key),
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => {
      const value = factory();
      opened.push({ key, title: value.title, payload: value.payload as SqlPayload });
    },
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, opened, tabs };
}

describe('openDatabase with a path', () => {
  it('opens under sqlite:<path> with the basename as the title and the path as the payload database', () => {
    const fixture = fake();
    openDatabase('/data/shop.sqlite', fixture.capabilities, fixture.tabs);

    expect(fixture.opened).toHaveLength(1);
    expect(fixture.opened[0]?.key).toBe('sqlite:/data/shop.sqlite');
    expect(fixture.opened[0]?.title).toBe('shop');
    expect(fixture.opened[0]?.payload.database).toBe('/data/shop.sqlite');
    // The path is not inserted into the name-keyed dropdown data.
    expect(fixture.opened[0]?.payload.databases).toEqual(REFS);
  });

  it('strips one trailing .sqlite case-insensitively and leaves other extensions alone', () => {
    const upper = fake();
    openDatabase('/data/SHOP.SQLITE', upper.capabilities, upper.tabs);
    expect(upper.opened[0]?.title).toBe('SHOP');

    const db = fake();
    openDatabase('/data/shop.db', db.capabilities, db.tabs);
    expect(db.opened[0]?.title).toBe('shop.db');

    const twice = fake();
    openDatabase('/data/shop.sqlite.sqlite', twice.capabilities, twice.tabs);
    expect(twice.opened[0]?.title).toBe('shop.sqlite');
  });

  it('focuses one tab for the same path twice and keeps the payload it had', () => {
    const fixture = fake();
    const key = 'sqlite:/data/shop.sqlite';
    openDatabase('/data/shop.sqlite', fixture.capabilities, fixture.tabs);
    expect(fixture.opened).toHaveLength(1);

    const kept = { ...(fixture.opened[0]!.payload), object: 'kept' };
    fixture.tabs.write(key, kept);
    openDatabase('/data/shop.sqlite', fixture.capabilities, fixture.tabs);

    expect(fixture.opened[1]?.key).toBe(key);
    expect(fixture.opened[1]?.payload).toBe(kept);
    expect(fixture.opened[1]?.title).toBe('shop');
  });

  it('opens two tabs for different paths whose files share a basename', () => {
    const fixture = fake();
    openDatabase('/a/shop.sqlite', fixture.capabilities, fixture.tabs);
    openDatabase('/b/shop.sqlite', fixture.capabilities, fixture.tabs);

    expect(fixture.opened.map((entry) => entry.key)).toEqual([
      'sqlite:/a/shop.sqlite', 'sqlite:/b/shop.sqlite',
    ]);
    expect(fixture.opened.map((entry) => entry.title)).toEqual(['shop', 'shop']);
  });
});

describe('openDatabase with a name', () => {
  it('refuses a name the registry lacks and opens no tab', () => {
    const fixture = fake([]);
    expect(() => openDatabase('fresh', fixture.capabilities, fixture.tabs))
      .toThrow(new TabPluginRejection(UNKNOWN_DATABASE('fresh')));
    expect(fixture.opened).toEqual([]);
  });

  it('keeps the name as the title for a database in the registry', () => {
    const fixture = fake();
    openDatabase('shop', fixture.capabilities, fixture.tabs);

    expect(fixture.opened[0]?.key).toBe('sqlite:shop');
    expect(fixture.opened[0]?.title).toBe('shop');
  });
});
