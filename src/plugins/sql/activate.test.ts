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

const REFS = [{ name: 'shop', exists: true, open: true }, { name: 'blog', exists: true, open: false }];

const ORDERS = [{
  name: 'orders', kind: 'table' as const, writable: true,
  columns: [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }, { name: 'status', type: 'TEXT', notNull: false, pk: 0 }],
}, {
  name: 'paid', kind: 'view' as const, writable: false,
  columns: [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }],
}];

function emptyView(results: DatabaseResultView[] = []): DatabasesView {
  return { databases: REFS, results };
}

function fakeCapabilities(initial: DatabasesView = emptyView()) {
  const state = { view: initial };
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const updated: { key: string; value: TabPluginTabUpdate }[] = [];
  const docks: { key: string; dock: 'left' | 'right' | null }[] = [];
  const actions: TabPluginTopicAction[] = [];
  const registered: string[] = [];
  // `registerFile` mints a fresh id on every call, so recording what was asked for is how a test can
  // tell a reference registered once from one registered again on every update.
  const resources = { registerFile: (file: string) => { registered.push(file); return `/open/${registered.length}`; } };
  const capabilities = {
    note: vi.fn(),
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => { opened.push({ key, value: factory() }); },
    updateTab: (key: string, factory: () => TabPluginTabUpdate) => { updated.push({ key, value: factory(resources) }); },
    dockTab: (key: string, dock: 'left' | 'right' | null) => { docks.push({ key, dock }); },
    openClaimedFiles: vi.fn(),
    topicData: () => state.view,
    topicAction: (action: TabPluginTopicAction) => { actions.push(action); },
    configuredViewer: () => '',
    openExternally: () => false,
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { actions, activation: activate(), capabilities, docks, opened, registered, state, updated };
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

  it('refuses with guidance when there is no database at all', () => {
    const fixture = fakeCapabilities({ databases: [], results: [] });
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

describe('sql plugin intents', () => {
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
      order: [],
      limit: 100,
      offset: 0,
      pageSizes: [50, 100, 500],
      grid: grid(),
      stats: null,
      console: null,
      exports: [],
      error: null,
      pending: null,
      ...over,
    };
  }

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

  it('opens another database from the header switcher', () => {
    const fixture = fakeCapabilities();
    intent('open', { name: 'blog' }, fixture);
    expect(fixture.opened[0]?.key).toBe('sqlite:blog');
  });

  // The two intentions are deliberately different: a typed name is far more likely a typo than a wish
  // for a new database, so the command refuses an unknown one and the switcher — which asked for one
  // — creates it.
  it('opens a name the registry has never heard of when the switcher asks for one', () => {
    const fixture = fakeCapabilities();
    intent('open', { name: 'fresh' }, fixture);
    expect(fixture.opened[0]?.key).toBe('sqlite:fresh');
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
