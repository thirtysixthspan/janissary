import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
} from '../api.js';
import type { DatabaseResultView, DatabasesView } from '../api.js';
import { activate } from './activate.js';
import type { SqlPayload } from './shared.js';
import { MAX_LOG } from './tabs.js';

const REFS = [{ name: 'shop', exists: true, open: true }, { name: 'blog', exists: true, open: false }];

const ORDERS = [{
  name: 'orders', kind: 'table' as const, writable: true,
  columns: [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }, { name: 'status', type: 'TEXT', notNull: false, pk: 0 }],
}, {
  name: 'paid', kind: 'view' as const, writable: false,
  columns: [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }],
}];

function emptyView(results: DatabaseResultView[] = []): DatabasesView {
  return { databases: REFS, results, lastOpened: 'shop' };
}

/** What a host records for one action, or `undefined` when it answers nothing. */
type Respond = (action: TabPluginTopicAction) => DatabaseResultView | undefined;

function fakeCapabilities(initial: DatabasesView = emptyView(), respond?: Respond) {
  const state = { view: initial };
  const activation = activate();
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const updated: { key: string; value: TabPluginTabUpdate }[] = [];
  const docks: { key: string; dock: 'left' | 'right' | null }[] = [];
  const actions: TabPluginTopicAction[] = [];
  const registered: string[] = [];
  // Every payload published to a tab, in order — which is what the tab was last told, and when.
  const shown: unknown[] = [];
  // `registerFile` mints a fresh id on every call, so recording what was asked for is how a test can
  // tell a reference registered once from one registered again on every update.
  const resources = { registerFile: (file: string) => { registered.push(file); return `/open/${registered.length}`; } };
  // The plugin's own line into the notifications feed, recorded here so a test can ask what it said.
  const notifyUser = vi.fn();
  const capabilities = {
    note: vi.fn(),
    notifyUser,
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => { opened.push({ key, value: factory() }); shown.push(opened.at(-1)!.value.payload); },
    updateTab: (key: string, factory: () => TabPluginTabUpdate) => { updated.push({ key, value: factory(resources) }); shown.push(updated.at(-1)!.value.payload); },
    dockTab: (key: string, dock: 'left' | 'right' | null) => { docks.push({ key, dock }); },
    openClaimedFiles: vi.fn(),
    topicData: () => state.view,
    topicAction: (action: TabPluginTopicAction) => { actions.push(action); respondFrom(action); },
    configuredViewer: () => '',
    openExternally: () => false,
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;

  // The real host answers inside the call: `topicAction` runs the topic's action, which records the
  // result, and the change it then announces reaches this plugin's `notify` before `topicAction`
  // returns. A fixture that only recorded the action cannot see that at all, which is why the
  // ordering this one pins is invisible without it.
  function respondFrom(action: TabPluginTopicAction): void {
    const answer = respond?.(action);
    if (!answer) return;
    state.view = { ...state.view, results: [answer, ...state.view.results] };
    // And the host tells a plugin only about tabs it owns, so a request sent before the tab was
    // opened is answered into nothing rather than held for later.
    const owned = opened.map((entry) => entry.key);
    if (owned.length === 0) return;
    activation.notify?.({ topic: 'databases', data: state.view, tabs: owned }, capabilities);
  }

  return { actions, activation, capabilities, docks, notifyUser, opened, registered, shown, state, updated };
}

/** A host that answers a schema read with the fixture's objects and a query with its grid. */
function answering(objects: DatabaseResultView[] = ORDERS): Respond {
  return (action) => {
    const { requestId } = action as { requestId: string };
    if (action.action === 'schema') return { kind: 'schema', requestId, database: 'shop', objects };
    if (action.action === 'query') return { kind: 'query', requestId, database: 'shop', grid: grid() };
  };
}

function grid(over: Partial<SqlPayload['grid']> = {}) {
  return {
    sql: 'SELECT "id", "status" FROM "orders" ORDER BY "id" ASC LIMIT ? OFFSET ?',
    parameters: [100, 0],
    columns: ['id', 'status'],
    rows: [{ key: 'r1', cells: [{ text: '1', isNull: false }, { text: 'paid', isNull: false }] }],
    total: 1, unfilteredTotal: 1, offset: 0, limit: 100, order: [{ column: 'id', desc: false }],
    ...over,
  } as NonNullable<SqlPayload['grid']>;
}


  function intent(name: string, payload: unknown, fixture: ReturnType<typeof fakeCapabilities>, tab?: SqlPayload) {
    return fixture.activation.intent({ tab: 'sqlite:shop', intent: name, payload, tabPayload: tab ?? basePayload() }, fixture.capabilities);
  }

  function basePayload(over: Partial<SqlPayload> = {}): SqlPayload {
    return {
      database: 'shop',
      databases: REFS,
      objects: ORDERS,
      object: 'orders',
      filters: [],
      hidden: [],
      global: '',
      order: [],
      limit: 100,
      offset: 0,
      pageSizes: [50, 100, 500],
      grid: grid(),
      log: [],
      exports: [],
      error: null,
      pending: null,
      ...over,
    };
  }

function openTab(fixture: ReturnType<typeof fakeCapabilities>, database = 'shop') {
  fixture.activation.command?.(database, fixture.capabilities);
  return fixture.opened.at(-1);
}

function lastPayload(fixture: ReturnType<typeof fakeCapabilities>): SqlPayload {
  const update = fixture.updated.at(-1);
  if (!update) throw new Error('expected an update');
  return update.value.payload as SqlPayload;
}

function deliver(
  fixture: ReturnType<typeof fakeCapabilities>,
  results: DatabaseResultView[],
  tabs: readonly string[] = ['sqlite:shop'],
) {
  fixture.state.view = emptyView(results);
  fixture.activation.notify?.({ topic: 'databases', data: fixture.state.view, tabs }, fixture.capabilities);
}

function schemaAnswer(requestId: string, objects = ORDERS): DatabaseResultView {
  return { kind: 'schema', requestId, database: 'shop', objects };
}

describe('sql plugin command', () => {
  it('opens a database tab under the connection id, reads its schema, and issues one request', () => {
    const fixture = fakeCapabilities();
    const opened = openTab(fixture, 'shop');
    expect(opened?.key).toBe('sqlite:shop');
    expect(opened?.value.title).toBe('shop');
    expect(fixture.actions).toHaveLength(1);
    expect(fixture.actions[0]).toMatchObject({ topic: 'databases', action: 'schema', database: 'shop' });
  });

  it('refuses a name the registry would reject, and one it has simply never heard of', () => {
    const fixture = fakeCapabilities();
    expect(() => fixture.activation.command?.('../evil', fixture.capabilities))
      .toThrow(new TabPluginRejection('Invalid database name "../evil".'));
    expect(() => fixture.activation.command?.('shpo', fixture.capabilities))
      .toThrow(new TabPluginRejection('No database named "shpo". Create it with: db sqlite create shpo'));
    expect(fixture.opened).toEqual([]);
  });

  it('docks the named database and undocks it on a bare argument', () => {
    const left = fakeCapabilities();
    left.activation.command?.('shop left', left.capabilities);
    expect(left.docks).toEqual([{ key: 'sqlite:shop', dock: 'left' }]);

    const bare = fakeCapabilities();
    bare.activation.command?.('', bare.capabilities);
    expect(bare.docks).toEqual([{ key: 'sqlite:shop', dock: null }]);
  });

  it('opens the database with a connection open when none is named', () => {
    const fixture = fakeCapabilities();
    fixture.activation.command?.('', fixture.capabilities);
    expect(fixture.opened[0]?.key).toBe('sqlite:shop');
  });

  // The list a user picks from is sorted by name; the shortcut opens the one they were last in. Those
  // are two questions, so the second is answered by the slice naming it rather than by reading the
  // first open entry off the first.
  it('opens the database most recently reached, not the first by name', () => {
    const fixture = fakeCapabilities({
      databases: [
        { name: 'alpha', exists: true, open: true },
        { name: 'zulu', exists: true, open: true },
      ],
      results: [],
      lastOpened: 'zulu',
    });
    fixture.activation.command?.('', fixture.capabilities);
    expect(fixture.opened[0]?.key).toBe('sqlite:zulu');
  });

  it('falls back to the first database by name when none is open', () => {
    const fixture = fakeCapabilities({
      databases: [{ name: 'alpha', exists: true, open: false }],
      results: [],
      lastOpened: null,
    });
    fixture.activation.command?.('', fixture.capabilities);
    expect(fixture.opened[0]?.key).toBe('sqlite:alpha');
  });

  it('refuses with guidance when there is no database at all', () => {
    const fixture = fakeCapabilities({ databases: [], results: [], lastOpened: null });
    expect(() => fixture.activation.command?.('', fixture.capabilities))
      .toThrow(new TabPluginRejection('No databases. Create one with: db sqlite create <name>'));
  });

  it('focuses the tab that is already open without re-reading or resetting it', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    deliver(fixture, [schemaAnswer('missing')]);
    const after = fixture.actions.length;
    fixture.activation.command?.('shop', fixture.capabilities);
    expect(fixture.actions).toHaveLength(after);
    expect(fixture.opened).toHaveLength(2);
  });
});

describe('sql plugin notifications', () => {
  it('folds a schema answer in, picks the first table, and asks for its first page', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    const requestId = (fixture.actions[0] as { requestId: string }).requestId;

    deliver(fixture, [schemaAnswer(requestId)]);

    const payload = lastPayload(fixture);
    expect(payload.object).toBe('orders');
    expect(payload.objects.map((object) => object.name)).toEqual(['orders', 'paid']);
    expect(payload.pending?.followUp).toBe('query');
    expect(fixture.actions[1]).toMatchObject({ action: 'query', query: { object: 'orders' } });
  });

  it('folds a page answer in, and reports a failed read as an error while keeping what it had', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    const schemaId = (fixture.actions[0] as { requestId: string }).requestId;
    deliver(fixture, [schemaAnswer(schemaId)]);
    const queryId = (fixture.actions[1] as { requestId: string }).requestId;

    deliver(fixture, [schemaAnswer(schemaId), { kind: 'query', requestId: queryId, database: 'shop', grid: grid() }]);
    expect(lastPayload(fixture).grid?.rows).toHaveLength(1);

    // A refresh, then a page that comes back failed: the error is shown and the page it replaced is
    // gone rather than silently stale.
    fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'refresh', payload: {}, tabPayload: lastPayload(fixture) },
      fixture.capabilities,
    );
    const failedId = (fixture.actions.at(-1) as { requestId: string }).requestId;
    deliver(fixture, [{ kind: 'query', requestId: failedId, database: 'shop', grid: grid(), error: 'Query error: no such table' }]);
    const after = lastPayload(fixture);
    expect(after.error).toBe('Query error: no such table');
    // The page the failed read replaced stays on screen: an error band above it beats a blank grid.
    expect(after.grid?.rows).toHaveLength(1);
  });

  it('puts each write on the log in order, newest first', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    deliver(fixture, [schemaAnswer((fixture.actions[0] as { requestId: string }).requestId)]);
    let tab = lastPayload(fixture);
    for (const sql of ['UPDATE orders SET status = ?', 'DELETE FROM logs']) {
      fixture.activation.intent(
        { tab: 'sqlite:shop', intent: 'update-cell', payload: { row: 'r1', column: 'status', value: 'paid' }, tabPayload: tab },
        fixture.capabilities,
      );
      const id = (fixture.actions.at(-1) as { requestId: string }).requestId;
      deliver(fixture, [{ kind: 'write', requestId: id, database: 'shop', sql, parameters: ['paid'], changed: 1 }]);
      tab = lastPayload(fixture);
    }
    expect(tab.log.map((entry) => entry.sql)).toEqual(['DELETE FROM logs', 'UPDATE orders SET status = ?']);
  });

  it('logs a statement that failed too, since a log of successes would not say what happened', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    deliver(fixture, [schemaAnswer((fixture.actions[0] as { requestId: string }).requestId)]);
    const tab = lastPayload(fixture);
    fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'update-cell', payload: { row: 'r1', column: 'status', value: 'x' }, tabPayload: tab },
      fixture.capabilities,
    );
    const id = (fixture.actions.at(-1) as { requestId: string }).requestId;
    deliver(fixture, [{ kind: 'write', requestId: id, database: 'shop', sql: 'UPDATE nope', parameters: [], changed: 0, error: 'no such table: nope' }]);
    const after = lastPayload(fixture);
    expect(after.log).toEqual([{ sql: 'UPDATE nope', changed: 0, error: 'no such table: nope' }]);
    expect(after.error).toBe('no such table: nope');
  });

  it('keeps the newest fifty statements and drops the oldest past that', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    deliver(fixture, [schemaAnswer((fixture.actions[0] as { requestId: string }).requestId)]);
    let tab = lastPayload(fixture);
    for (let run = 0; run < MAX_LOG + 3; run += 1) {
      fixture.activation.intent(
        { tab: 'sqlite:shop', intent: 'update-cell', payload: { row: 'r1', column: 'status', value: 'x' }, tabPayload: tab },
        fixture.capabilities,
      );
      const id = (fixture.actions.at(-1) as { requestId: string }).requestId;
      deliver(fixture, [{ kind: 'write', requestId: id, database: 'shop', sql: `UPDATE t SET v = ${run}`, parameters: [], changed: 1 }]);
      tab = lastPayload(fixture);
    }
    expect(tab.log).toHaveLength(MAX_LOG);
    // The oldest three are gone, and the newest is the last one run.
    expect(tab.log[0]?.sql).toBe(`UPDATE t SET v = ${MAX_LOG + 2}`);
    expect(tab.log.at(-1)?.sql).toBe('UPDATE t SET v = 3');
  });

  it('re-issues a request whose answer never arrived, rather than waiting forever', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    deliver(fixture, []);
    expect(fixture.actions[1]).toMatchObject({ action: 'schema' });
  });

  // A database that is gone is not an ordinary read failure: the rows on screen describe a file that
  // no longer exists, so keeping them would be showing something untrue.
  it('drops the grid and says so when the database has been deleted', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    const schemaId = (fixture.actions[0] as { requestId: string }).requestId;
    deliver(fixture, [schemaAnswer(schemaId)]);
    const queryId = (fixture.actions[1] as { requestId: string }).requestId;
    deliver(fixture, [schemaAnswer(schemaId), { kind: 'query', requestId: queryId, database: 'shop', grid: grid() }]);
    expect(lastPayload(fixture).grid?.rows).toHaveLength(1);

    fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'refresh', payload: {}, tabPayload: lastPayload(fixture) },
      fixture.capabilities,
    );
    const goneId = (fixture.actions.at(-1) as { requestId: string }).requestId;
    deliver(fixture, [{
      kind: 'schema', requestId: goneId, database: 'shop', objects: [],
      error: 'Database "shop" does not exist. Create it to start.',
    }]);
    const after = lastPayload(fixture);
    expect(after.error).toBe('Database "shop" does not exist. Create it to start.');
    expect(after.grid).toBeNull();
    expect(after.pending).toBeNull();
  });

  // A failed read for any other reason keeps the page, which is the whole difference between the two.
  it('keeps the page on a read that failed for some other reason', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    const schemaId = (fixture.actions[0] as { requestId: string }).requestId;
    deliver(fixture, [schemaAnswer(schemaId)]);
    const queryId = (fixture.actions[1] as { requestId: string }).requestId;
    deliver(fixture, [schemaAnswer(schemaId), { kind: 'query', requestId: queryId, database: 'shop', grid: grid() }]);

    fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'refresh', payload: {}, tabPayload: lastPayload(fixture) },
      fixture.capabilities,
    );
    const failedId = (fixture.actions.at(-1) as { requestId: string }).requestId;
    deliver(fixture, [{
      kind: 'query', requestId: failedId, database: 'shop', grid: grid(), error: 'Query error: locked',
    }]);
    const after = lastPayload(fixture);
    expect(after.error).toBe('Query error: locked');
    expect(after.grid?.rows).toHaveLength(1);
  });

  it('registers an export exactly once and keeps the reference across later updates', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    const schemaId = (fixture.actions[0] as { requestId: string }).requestId;
    deliver(fixture, [schemaAnswer(schemaId)]);
    const queryId = (fixture.actions[1] as { requestId: string }).requestId;
    deliver(fixture, [schemaAnswer(schemaId), { kind: 'query', requestId: queryId, database: 'shop', grid: grid() }]);

    fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'export', payload: { format: 'csv' }, tabPayload: lastPayload(fixture) },
      fixture.capabilities,
    );
    const exportId = (fixture.actions.at(-1) as { requestId: string }).requestId;
    const answer: DatabaseResultView = {
      kind: 'export', requestId: exportId, database: 'shop',
      path: '/tmp/shop-orders-1.csv', name: 'shop-orders-1.csv', size: '1 kB', rows: 1,
    };
    deliver(fixture, [answer]);
    expect(lastPayload(fixture).exports).toEqual([{ name: 'shop-orders-1.csv', size: '1 kB', rows: 1, ref: '/open/1' }]);

    deliver(fixture, [answer]);
    expect(lastPayload(fixture).exports[0]?.ref).toBe('/open/1');
    expect(fixture.registered).toEqual(['/tmp/shop-orders-1.csv']);
  });
});

/**
 * The host answers a topic action before the call returns, so every request this plugin makes is
 * answered while that request is still on its own stack. These cases pin the ordering that makes
 * that survivable: the tab records a request in its own mirror before the request leaves for the
 * host, so the delivery that answers it finds a tab that is already waiting for exactly that id.
 */
describe('sql plugin answering a request before it returns', () => {
  it('leaves the tab on the first table of the database with its first page', () => {
    const fixture = fakeCapabilities(emptyView(), answering());
    openTab(fixture);
    const payload = lastPayload(fixture);
    expect(payload.object).toBe('orders');
    expect(payload.objects.map((object) => object.name)).toEqual(['orders', 'paid']);
    expect(payload.grid?.rows).toHaveLength(1);
    expect(payload.pending).toBeNull();
    // Exactly two, and no more: the schema answer issued one query and that query's answer issued
    // none. A third would be the schema answer folded a second time off a stale mirror.
    expect(fixture.actions.map((action) => action.action)).toEqual(['schema', 'query']);
  });

  it('leaves a tab with no tables settled rather than waiting on a request nothing answered', () => {
    const fixture = fakeCapabilities(emptyView(), answering([]));
    openTab(fixture);
    const payload = lastPayload(fixture);
    expect(payload.objects).toEqual([]);
    expect(payload.grid).toBeNull();
    expect(payload.pending).toBeNull();
    expect(fixture.actions.map((action) => action.action)).toEqual(['schema']);
  });

  it('answers a refresh with a page again, rather than folding the answer into itself', () => {
    const fixture = fakeCapabilities(emptyView(), answering());
    openTab(fixture);
    const before = fixture.actions.length;

    fixture.activation.intent(
      {
        tab: 'sqlite:shop', intent: 'refresh', payload: {},
        tabPayload: fixture.shown.at(-1) as SqlPayload,
      },
      fixture.capabilities,
    );

    expect(fixture.actions.slice(before).map((action) => action.action)).toEqual(['schema', 'query']);
    expect(lastPayload(fixture).pending).toBeNull();
    expect(lastPayload(fixture).grid?.rows).toHaveLength(1);
  });

  it('re-reads the grid a write disturbed, and records the statement that disturbed it', () => {
    const fixture = fakeCapabilities(emptyView(), answering());
    openTab(fixture);
    fixture.activation.intent(
      {
        tab: 'sqlite:shop', intent: 'update-cell',
        payload: { row: 'r1', column: 'status', value: 'paid' }, tabPayload: lastPayload(fixture),
      },
      fixture.capabilities,
    );
    const writeId = (fixture.actions.at(-1) as { requestId: string }).requestId;
    deliver(fixture, [{ kind: 'write', requestId: writeId, database: 'shop', sql: 'UPDATE orders SET status = ?', parameters: ['paid'], changed: 1 }]);
    const payload = lastPayload(fixture);
    expect(payload.log.map((entry) => entry.sql)).toEqual(['UPDATE orders SET status = ?']);
    expect(payload.pending).toBeNull();
    expect(payload.grid?.rows).toHaveLength(1);
  });

  // A statement the user typed is arbitrary SQL, so the tab has to read itself again: the object list
  // first, then the page. A page re-read alone would leave a created or dropped table unnoticed.
  it('reads the tab again after a statement, so a schema change in it is not missed', () => {
    const fixture = fakeCapabilities(emptyView(), answering());
    openTab(fixture);
    const before = fixture.actions.length;

    fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'run', payload: { sql: 'DROP TABLE orders' }, tabPayload: lastPayload(fixture) },
      fixture.capabilities,
    );
    const runId = (fixture.actions.at(-1) as { requestId: string }).requestId;
    deliver(fixture, [{ kind: 'write', requestId: runId, database: 'shop', sql: 'DROP TABLE orders', parameters: [], changed: 0 }]);

    expect(fixture.actions.slice(before).map((action) => action.action)).toEqual(['run', 'schema', 'query']);
    expect(lastPayload(fixture).pending).toBeNull();
    expect(lastPayload(fixture).grid?.rows).toHaveLength(1);
  });

  // The schema read is also what chooses an object, so a table made by a statement is the one the tab
  // lands on — which is the whole of what the objectless tab had no way to show before.
  it('lands on the table a CREATE made, on a tab that had no object at all', () => {
    const made = [{
      name: 't', kind: 'table' as const, writable: true,
      columns: [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }],
    }];
    // The database holds nothing until the statement runs, and holds `t` after it.
    let exists = false;
    const sql = 'CREATE TABLE t (id INTEGER PRIMARY KEY)';
    const fixture = fakeCapabilities(emptyView(), (action) => {
      const { requestId } = action as { requestId: string };
      if (action.action === 'schema') {
        return { kind: 'schema', requestId, database: 'shop', objects: exists ? made : [] };
      }
      if (action.action === 'query') return { kind: 'query', requestId, database: 'shop', grid: grid() };
      exists = true;
      return { kind: 'write', requestId, database: 'shop', sql, parameters: [], changed: 0 };
    });
    openTab(fixture);
    expect(lastPayload(fixture).object).toBe('');
    const before = fixture.actions.length;

    fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'run', payload: { sql }, tabPayload: lastPayload(fixture) },
      fixture.capabilities,
    );

    expect(fixture.actions.slice(before).map((action) => action.action)).toEqual(['run', 'schema', 'query']);
    const payload = lastPayload(fixture);
    expect(payload.error).toBeNull();
    expect(payload.object).toBe('t');
    expect(payload.grid?.rows).toHaveLength(1);
    expect(payload.log.map((entry) => entry.sql)).toEqual([sql]);
  });

  // A grid write is one cell value in a table that already exists, so it cannot have changed the
  // schema: it re-reads the page it disturbed and stops there.
  it('re-reads only the page after a write the grid made itself', () => {
    const fixture = fakeCapabilities(emptyView(), answering());
    openTab(fixture);
    const before = fixture.actions.length;
    fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'update-cell', payload: { row: 'r1', column: 'status', value: 'x' }, tabPayload: lastPayload(fixture) },
      fixture.capabilities,
    );
    const writeId = (fixture.actions.at(-1) as { requestId: string }).requestId;
    deliver(fixture, [{ kind: 'write', requestId: writeId, database: 'shop', sql: 'UPDATE orders SET status = ?', parameters: ['x'], changed: 1 }]);
    expect(fixture.actions.slice(before).map((action) => action.action)).toEqual(['updateCell', 'query']);
  });

  it('asks for nothing after a statement that failed, because it changed nothing', () => {
    const fixture = fakeCapabilities();
    const tab = basePayload();
    fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'run', payload: { sql: 'DROP TABLE nope' }, tabPayload: tab },
      fixture.capabilities,
    );
    const runId = (fixture.actions.at(-1) as { requestId: string }).requestId;
    const before = fixture.actions.length;
    deliver(fixture, [{ kind: 'write', requestId: runId, database: 'shop', sql: 'DROP TABLE nope', parameters: [], changed: 0, error: 'no such table: nope' }]);
    expect(fixture.actions.slice(before)).toEqual([]);
    expect(lastPayload(fixture).pending).toBeNull();
    expect(lastPayload(fixture).error).toBe('no such table: nope');
  });

  it('has every request recorded on the tab before it leaves for the host', () => {
    // What the tab was showing at the instant each request was sent, which is the ordering the whole
    // exchange rests on: an answer delivered before the tab named its request is an answer to a
    // question the tab is not asking.
    const waitingWhenSent: (string | undefined)[] = [];
    const fixture = fakeCapabilities(emptyView(), () => {
      waitingWhenSent.push((fixture.shown.at(-1) as SqlPayload | undefined)?.pending?.id);
    });
    openTab(fixture);
    fixture.activation.intent(
      {
        tab: 'sqlite:shop', intent: 'refresh', payload: {},
        tabPayload: fixture.shown.at(-1) as SqlPayload,
      },
      fixture.capabilities,
    );
    deliver(fixture, []);
    expect(fixture.actions.map((action) => action.action)).toEqual(['schema', 'schema', 'schema']);
    expect(waitingWhenSent).toEqual(fixture.actions.map((action) => (action as { requestId: string }).requestId));
  });
});

describe('sql plugin intents', () => {
  // A parked filter keeps its column, operator and value in the payload and leaves the query, so
  // bringing it back is one press rather than a retyped column, an operator, and a value.
  it('parks a filter out of the query without losing it, and brings it back on a second press', () => {
    const fixture = fakeCapabilities();
    const tab = basePayload({ filters: [{ column: 'status', op: 'eq', value: 'paid' }] });
    intent('set-filter-enabled', { column: 'status', enabled: false }, fixture, tab);
    expect(fixture.actions[0]).toMatchObject({ action: 'query', query: { filters: [] } });
    const parked = lastPayload(fixture);
    expect(parked.filters).toEqual([{ column: 'status', op: 'eq', value: 'paid', enabled: false }]);

    intent('set-filter-enabled', { column: 'status', enabled: true }, fixture, parked);
    expect(fixture.actions[1]).toMatchObject({
      action: 'query', query: { filters: [{ column: 'status', op: 'eq', value: 'paid' }] },
    });
  });

  // A tab restored from a profile saved before the flag existed carries filters with no `enabled` at
  // all, and the contract reads one as being on.
  it('reads a filter with no enabled flag as being on, and never sends the flag to the host', () => {
    const fixture = fakeCapabilities();
    intent('set-filter', { column: 'status', op: 'eq', value: 'paid' }, fixture, basePayload());
    expect(fixture.actions[0]).toMatchObject({
      action: 'query', query: { filters: [{ column: 'status', op: 'eq', value: 'paid' }] },
    });
    expect(fixture.actions[0]?.query?.filters[0]).toEqual({ column: 'status', op: 'eq', value: 'paid' });
  });

  it('refuses a set-filter-enabled that names no column or is not a boolean', () => {
    const fixture = fakeCapabilities();
    expect(() => intent('set-filter-enabled', { enabled: false }, fixture)).toThrow(new TabPluginRejection('invalid set-filter-enabled payload'));
    expect(() => intent('set-filter-enabled', { column: 'status', enabled: 'no' }, fixture)).toThrow(new TabPluginRejection('invalid set-filter-enabled payload'));
    expect(fixture.actions).toEqual([]);
  });

  it('turns a filter, an order, and a page change into one query each, from the first page', () => {
    const fixture = fakeCapabilities();
    // Each intent answers with the payload it produced, and the next one is sent against that — the
    // same sequence a user clicking through the grid produces, and the only way a toggle can be
    // observed to toggle.
    let tab = basePayload();
    const send = (name: string, body: unknown) => {
      intent(name, body, fixture, tab);
      tab = lastPayload(fixture);
    };

    send('set-filter', { column: 'status', op: 'eq', value: 'paid' });
    expect(fixture.actions[0]).toMatchObject({
      action: 'query',
      query: { filters: [{ column: 'status', op: 'eq', value: 'paid' }], offset: 0 },
    });
    send('set-order', { column: 'status' });
    expect(fixture.actions[1]).toMatchObject({ action: 'query', query: { order: [{ column: 'status', desc: false }] } });
    send('set-order', { column: 'status' });
    expect(fixture.actions[2]).toMatchObject({ action: 'query', query: { order: [{ column: 'status', desc: true }] } });
    send('set-order', { column: 'status' });
    expect(fixture.actions[3]).toMatchObject({ action: 'query', query: { order: [] } });
    send('set-page', { offset: 200 });
    expect(fixture.actions[4]).toMatchObject({ action: 'query', query: { offset: 200 } });
    send('set-page-size', { limit: 500 });
    expect(fixture.actions[5]).toMatchObject({ action: 'query', query: { limit: 500, offset: 0 } });
  });

  it('turns a selection carrying a filter into one query already filtered', () => {
    const fixture = fakeCapabilities();
    // The filter travels inside the selection rather than following it: `topicAction` answers
    // nothing, so a `set-filter` sent just after would be answered against the object just left.
    intent('select-object', { object: 'customers', column: 'id', value: '1' }, fixture, basePayload({ object: 'orders' }));
    expect(fixture.actions).toHaveLength(1);
    expect(fixture.actions[0]).toMatchObject({
      action: 'query',
      query: { object: 'customers', filters: [{ column: 'id', op: 'eq', value: '1' }] },
    });
  });

  it('replaces a filter on the same column rather than adding a second one', () => {
    const fixture = fakeCapabilities();
    intent('select-object', { object: 'customers', column: 'id', value: '2' }, fixture, basePayload({
      filters: [{ column: 'id', op: 'eq', value: '1' }],
    }));
    expect(fixture.actions[0]).toMatchObject({ query: { filters: [{ column: 'id', op: 'eq', value: '2' }] } });
  });

  it('leaves filters on other columns alone when selecting', () => {
    const fixture = fakeCapabilities();
    intent('select-object', { object: 'customers', column: 'id', value: '1' }, fixture, basePayload({
      filters: [{ column: 'status', op: 'eq', value: 'paid' }],
    }));
    expect(fixture.actions[0]).toMatchObject({
      query: {
        filters: [
          { column: 'status', op: 'eq', value: 'paid' },
          { column: 'id', op: 'eq', value: '1' },
        ],
      },
    });
  });

  it('refuses a selection whose column carries no value to filter on', () => {
    const fixture = fakeCapabilities();
    expect(() => intent('select-object', { object: 'customers', column: 'id' }, fixture, basePayload())).toThrow();
    expect(fixture.actions).toHaveLength(0);
  });

  it('drops a filter whose column the newly selected object does not have', () => {
    const fixture = fakeCapabilities();
    // Keeping it would build `WHERE "status" = ?` against an object with no such column, which
    // SQLite rejects outright — so an ordinary two-click path would replace the grid with an error.
    intent('select-object', { object: 'paid' }, fixture, basePayload({
      object: 'orders',
      filters: [{ column: 'status', op: 'eq', value: 'paid' }],
    }));
    expect(fixture.actions[0]).toMatchObject({ action: 'query', query: { object: 'paid', filters: [] } });
  });

  it('keeps a filter the newly selected object does have', () => {
    const fixture = fakeCapabilities();
    intent('select-object', { object: 'orders' }, fixture, basePayload({
      object: 'paid',
      filters: [{ column: 'id', op: 'eq', value: '1' }],
    }));
    expect(fixture.actions[0]).toMatchObject({ action: 'query', query: { object: 'orders', filters: [{ column: 'id', op: 'eq', value: '1' }] } });
  });

  it('drops a carried filter naming a column the target object does not have', () => {
    const fixture = fakeCapabilities();
    intent('select-object', { object: 'paid', column: 'status', value: 'paid' }, fixture, basePayload());
    expect(fixture.actions[0]).toMatchObject({ query: { object: 'paid', filters: [] } });
  });

  it('keeps the filters when the target object is not one the tab has listed', () => {
    const fixture = fakeCapabilities();
    // Not knowing an object's columns is no reason to drop anything: only a column the object
    // demonstrably lacks goes, and this one was never read.
    intent('select-object', { object: 'elsewhere' }, fixture, basePayload({
      filters: [{ column: 'status', op: 'eq', value: 'paid' }],
    }));
    expect(fixture.actions[0]).toMatchObject({ query: { object: 'elsewhere', filters: [{ column: 'status', op: 'eq', value: 'paid' }] } });
  });

  it('drops an order naming a column the newly selected object does not have', () => {
    const fixture = fakeCapabilities();
    // `ORDER BY "total"` against an object with no `total` is the statement SQLite refuses, and a
    // failed read leaves the previous object's rows on screen under the new object's name.
    intent('select-object', { object: 'paid' }, fixture, basePayload({
      object: 'orders',
      order: [{ column: 'total', desc: true }],
    }));
    expect(fixture.actions[0]).toMatchObject({ action: 'query', query: { object: 'paid', order: [] } });
  });

  it('keeps an order the newly selected object does have', () => {
    const fixture = fakeCapabilities();
    intent('select-object', { object: 'orders' }, fixture, basePayload({
      object: 'paid',
      order: [{ column: 'id', desc: true }],
    }));
    expect(fixture.actions[0]).toMatchObject({ query: { object: 'orders', order: [{ column: 'id', desc: true }] } });
  });

  it('keeps the order when the target object is not one the tab has listed', () => {
    const fixture = fakeCapabilities();
    intent('select-object', { object: 'elsewhere' }, fixture, basePayload({
      order: [{ column: 'status', desc: true }],
    }));
    expect(fixture.actions[0]).toMatchObject({ query: { object: 'elsewhere', order: [{ column: 'status', desc: true }] } });
  });

  it('puts a global term in the query and replaces the one before it', () => {
    const fixture = fakeCapabilities();
    intent('set-global-filter', { value: 'ada' }, fixture, basePayload({ global: 'bo' }));
    expect(fixture.actions[0]).toMatchObject({ action: 'query', query: { global: 'ada' } });
  });

  it('clears the term along with the per-column filters, since it narrows the same view', () => {
    const fixture = fakeCapabilities();
    intent('clear-filters', {}, fixture, basePayload({ global: 'ada', filters: [{ column: 'status', op: 'eq', value: 'paid' }] }));
    expect(fixture.actions[0]).toMatchObject({ query: { global: '', filters: [] } });
  });

  it('keeps the term when the object changes, because it names no column', () => {
    const fixture = fakeCapabilities();
    intent('select-object', { object: 'orders' }, fixture, basePayload({ object: 'paid', global: 'ada' }));
    expect(fixture.actions[0]).toMatchObject({ query: { object: 'orders', global: 'ada' } });
  });
  it('takes the whole hidden set, and ignores a name the statement does not carry', () => {
    const fixture = fakeCapabilities();
    intent('set-columns', { hidden: ['status', 'not-a-column'] }, fixture, basePayload());
    // The hidden set is view state, so it lands in the tab's payload and not in the query.
    expect(lastPayload(fixture).hidden).toEqual(['status']);
    expect(fixture.actions[0]).toMatchObject({ action: 'query' });
  });

  it('shows every column again on an empty set', () => {
    const fixture = fakeCapabilities();
    intent('set-columns', { hidden: [] }, fixture, basePayload({ hidden: ['status'] }));
    expect(lastPayload(fixture).hidden).toEqual([]);
  });

  it('drops a hidden column the new object does not have, as it drops a filter', () => {
    const fixture = fakeCapabilities();
    intent('select-object', { object: 'paid' }, fixture, basePayload({ hidden: ['status'] }));
    expect(lastPayload(fixture).hidden).toEqual([]);
  });
  it('removes a filter set the same way twice, and clears them all on request', () => {
    const fixture = fakeCapabilities();
    intent('set-filter', { column: 'status', op: 'eq', value: 'paid' }, fixture, basePayload({
      filters: [{ column: 'status', op: 'eq', value: 'paid' }],
    }));
    expect(fixture.actions[0]).toMatchObject({ query: { filters: [] } });
    intent('clear-filters', {}, fixture);
    expect(fixture.actions[1]).toMatchObject({ query: { filters: [] } });
  });

  it('routes a console statement through the host read/write split', () => {
    const fixture = fakeCapabilities();
    intent('run', { sql: 'SELECT 1' }, fixture);
    expect(fixture.actions[0]).toMatchObject({ action: 'run', sql: 'SELECT 1', returnsRows: true });
    intent('run', { sql: 'DELETE FROM orders' }, fixture);
    expect(fixture.actions[1]).toMatchObject({ action: 'run', returnsRows: false });
  });

  it('turns each write intent into its action and waits for the page it disturbs', () => {
    const fixture = fakeCapabilities();
    intent('update-cell', { row: 'r1', column: 'status', value: null }, fixture);
    intent('insert-row', { object: 'orders', cells: [{ column: 'id', value: null }] }, fixture);
    intent('delete-row', { row: 'r1' }, fixture);
    expect(fixture.actions.map((action) => action.action))
      .toEqual(['updateCell', 'insertRow', 'deleteRow']);
    expect(fixture.updated.every((update) => (update.value.payload as SqlPayload).pending?.followUp === 'query')).toBe(true);
  });

  it('refuses a write to a table the tab shows as read-only, and issues nothing', () => {
    const fixture = fakeCapabilities();
    const readOnly = basePayload({ object: 'paid' });
    expect(() => intent('update-cell', { row: 'r1', column: 'id', value: 'x' }, fixture, readOnly))
      .toThrow(new TabPluginRejection('A view cannot be edited: it is a view.'));
    expect(fixture.actions).toEqual([]);
  });

  // The payload is writable, so only the mismatch can refuse it — which is the whole point of the
  // case: an insert naming a different table would otherwise succeed into a table the view never
  // showed and never re-reads.
  it('refuses an insert naming a table the tab is not showing, even though the shown one is writable', () => {
    const fixture = fakeCapabilities();
    expect(() => intent('insert-row', {
      object: 'other', cells: [{ column: 'id', value: null }],
    }, fixture, basePayload()))
      .toThrow(new TabPluginRejection('invalid insert-row object "other"'));
    expect(fixture.actions).toEqual([]);
  });

  it('accepts an insert naming the table the tab is showing', () => {
    const fixture = fakeCapabilities();
    intent('insert-row', { object: 'orders', cells: [{ column: 'id', value: null }] }, fixture, basePayload());
    expect(fixture.actions[0]).toMatchObject({ action: 'insertRow', object: 'orders' });
  });

  it('passes a cell naming a column the object lacks through to the host, which refuses it', () => {
    // The intent guard checks the object, not the cells: the write layer already refuses a column the
    // table does not have, with a message naming it, and duplicating that here would give the user
    // two sources for one rule.
    const fixture = fakeCapabilities();
    intent('insert-row', { object: 'orders', cells: [{ column: 'nope', value: 'x' }] }, fixture, basePayload());
    expect(fixture.actions[0]).toMatchObject({ action: 'insertRow', object: 'orders' });
  });

  // A constraint the database itself enforces is an answer, not a failure of this plugin. The host
  // reports anything thrown out of an intent as a plugin failure, which disabled `sql` and closed
  // every one of its tabs — so a user who left one required column alone lost the tab they were in.
  it('draws a refused insert as a message and a history entry, and asks for no re-read', () => {
    const refused = 'NOT NULL constraint failed: notes.required';
    const fixture = fakeCapabilities(emptyView(), (action) => {
      const { requestId } = action as { requestId: string };
      if (action.action === 'insertRow') {
        return { kind: 'write', requestId, database: 'shop', sql: '', parameters: [], changed: 0, error: refused };
      }
    });
    openTab(fixture);
    expect(() => intent('insert-row', { object: 'orders', cells: [{ column: 'id', value: null }] }, fixture)).not.toThrow();
    const payload = lastPayload(fixture);
    expect(payload.error).toBe(refused);
    expect(payload.grid).not.toBeNull();
    expect(payload.log).toEqual([{ sql: '', changed: 0, error: refused }]);
    expect(fixture.actions.slice(1).map((action) => action.action)).toEqual(['insertRow']);
    expect(fixture.notifyUser.mock.calls).toEqual([[refused]]);
  });

  it('opens another database from the header switcher', () => {
    const fixture = fakeCapabilities();
    intent('open', { name: 'blog' }, fixture);
    expect(fixture.opened[0]?.key).toBe('sqlite:blog');
  });

  // Reading a schema opens a connection, and opening a connection creates the file — so a name that
  // is a typo would leave an empty database behind. `db sqlite create` is how one is made, and the
  // switcher refuses an unknown name for the same reason the command does.
  it('refuses a name the registry has never heard of rather than making one, and opens no tab', () => {
    const fixture = fakeCapabilities();
    expect(() => intent('open', { name: 'fresh' }, fixture)).toThrow(
      new TabPluginRejection('No database named "fresh". Create it with: db sqlite create fresh'),
    );
    expect(fixture.opened).toEqual([]);
  });

  it('refuses a database name the registry would reject, and a malformed payload, without failing', () => {
    const fixture = fakeCapabilities();
    expect(() => intent('open', { name: '../evil' }, fixture)).toThrow(new TabPluginRejection('invalid open payload'));
    expect(() => intent('set-page', { offset: -5 }, fixture)).toThrow(new TabPluginRejection('invalid set-page payload'));
    expect(() => intent('nope', {}, fixture)).toThrow(new TabPluginRejection('unknown sql intent "nope"'));
    expect(fixture.actions).toEqual([]);
  });

  it('treats an invalid tab payload as a plugin failure rather than a rejection', () => {
    const fixture = fakeCapabilities();
    expect(() => fixture.activation.intent(
      { tab: 'sqlite:shop', intent: 'refresh', payload: {}, tabPayload: { nope: true } },
      fixture.capabilities,
    )).toThrow('invalid sql tab payload');
  });
});

describe('a failure reported to the notifications feed', () => {
  // A failure is the one result a user did not ask for and cannot predict, so it is said where it
  // outlasts the tab: the line under the prompt is where the next thing typed goes.
  function failing(error: string): Respond {
    return (action) => {
      const { requestId } = action as { requestId: string };
      if (action.action === 'schema') return { kind: 'schema', requestId, database: 'shop', objects: ORDERS };
      if (action.action === 'query') return { kind: 'query', requestId, database: 'shop', error };
    };
  }

  const said = (fixture: ReturnType<typeof fakeCapabilities>) => fixture.notifyUser.mock.calls;

  it('reports a read that failed, and says nothing when a read succeeds', () => {
    const failed = fakeCapabilities(emptyView(), failing('no such column: nope'));
    openTab(failed);
    expect(said(failed)).toEqual([['no such column: nope']]);

    const well = fakeCapabilities(emptyView(), answering());
    openTab(well);
    expect(said(well)).toEqual([]);
  });

  it('reports a write that failed, because it is the same answer in a different shape', () => {
    const fixture = fakeCapabilities(emptyView(), (action) => {
      const { requestId } = action as { requestId: string };
      if (action.action === 'schema') return { kind: 'schema', requestId, database: 'shop', objects: ORDERS };
      if (action.action === 'run') {
        return { kind: 'write', requestId, database: 'shop', sql: 'NOPE', parameters: [], changed: 0, error: 'syntax error' };
      }
    });
    openTab(fixture);
    intent('run', { sql: 'NOPE' }, fixture);
    expect(said(fixture)).toEqual([['syntax error']]);
  });

  // One failure, said once. An answer that arrives twice for a request the tab is still waiting on
  // is the same thing happening, and a feed that repeats itself is one the user learns to ignore.
  it('does not report the same failure twice over', () => {
    const fixture = fakeCapabilities();
    openTab(fixture);
    const schemaId = (fixture.actions[0] as { requestId: string }).requestId;
    deliver(fixture, [schemaAnswer(schemaId)]);
    const queryId = (fixture.actions[1] as { requestId: string }).requestId;
    const failed: DatabaseResultView = {
      kind: 'query', requestId: queryId, database: 'shop', grid: grid(), error: 'no such column: nope',
    };
    deliver(fixture, [schemaAnswer(schemaId), failed]);
    expect(said(fixture)).toEqual([['no such column: nope']]);
    deliver(fixture, [schemaAnswer(schemaId), failed]);
    expect(said(fixture)).toHaveLength(1);
  });

  // The other half of the rule: a failure that has gone away and come back is news again, which is
  // what a refresh that succeeds and then fails on the query it issues means.
  it('reports a failure that has gone away and come back', () => {
    const fixture = fakeCapabilities(emptyView(), failing('no such column: nope'));
    openTab(fixture);
    expect(said(fixture)).toHaveLength(1);
    intent('refresh', {}, fixture, basePayload());
    expect(said(fixture)).toHaveLength(2);
  });
});

describe('sql plugin opener', () => {
  it('rejects both presentations, since this plugin opens on a command and not a file', () => {
    const fixture = fakeCapabilities();
    const opener = fixture.activation.opener;
    expect(() => opener.inline('/tmp/a.sqlite', fixture.capabilities))
      .toThrow(new TabPluginRejection('sql opens no files'));
    expect(() => opener.external('/tmp/a.sqlite', fixture.capabilities))
      .toThrow(new TabPluginRejection('sql opens no files'));
  });
});
