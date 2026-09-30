import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate.js';
import type { SearchIntent, SearchPayload } from './shared.js';

const files: Record<string, string> = {
  'a.ts': 'nothing',
  'b.ts': 'one\ntodo two\nthree',
};

type Capability = Record<string, unknown>;

function makeCapabilities(overrides: Capability = {}) {
  const openOrFocusTab = vi.fn();
  const updateTab = vi.fn((_key: string, factory: () => { payload: unknown }) => factory());
  const projectFileList = vi.fn(async () => ({ root: '/repo', paths: Object.keys(files) }));
  const openInEditor = vi.fn();
  const rejectRequest = vi.fn((reason: string) => { throw new Error(reason); });
  const capabilities = {
    openOrFocusTab, updateTab, projectFileList, openInEditor, rejectRequest,
    reportFailure: vi.fn((reason: unknown) => { throw new Error(String(reason)); }),
    ...overrides,
  };
  return { capabilities: capabilities as never, openOrFocusTab, updateTab, projectFileList, openInEditor };
}

// A tab payload to hand a handler that only needs a valid one — an intent reads the authoritative
// tab payload, not whatever the test last published.
const settledTab: SearchPayload = {
  query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
  state: 'done', message: '', rows: [],
};

// The payload the tab would be showing after the last `updateTab`, which is how a test reads what
// the session has produced without reaching into it.
function lastPayload(updateTab: ReturnType<typeof vi.fn>): SearchPayload {
  const factory = updateTab.mock.calls.at(-1)?.[1] as (() => { payload: SearchPayload }) | undefined;
  if (factory === undefined) throw new Error('no tab update was published');
  return factory().payload;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

// The plugin under test, reading from a map of paths as though they were on disk at `/repo`. A path
// the map does not hold is an unreadable file, which is what the scan treats a deleted one as.
function searchActivation(contents: Record<string, string> = files) {
  return activate(async (absPath) => {
    const text = contents[absPath.replace('/repo/', '')];
    if (text === undefined) throw new Error('ENOENT');
    return text;
  });
}

const query: SearchIntent = {
  query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
};

const intent = (tab: SearchPayload, name: string, payload: unknown) =>
  ({ tab: 'search', intent: name, payload, tabPayload: tab });

describe('search plugin activation', () => {
  it('validates its own payloads', () => {
    const { capabilities } = makeCapabilities();
    const activation = searchActivation();
    expect(capabilities).toBeDefined();
    expect(activation.isPayload({})).toBe(false);
    expect(activation.isPayload(settledTab)).toBe(true);
  });

  it('rejects a payload whose rows are not rows', () => {
    const { capabilities } = makeCapabilities();
    const activation = searchActivation();
    expect(capabilities).toBeDefined();
    expect(activation.isPayload({ ...settledTab, rows: [{ path: 'a.ts' }] })).toBe(false);
  });

  it('refuses a file, having claimed no extensions', () => {
    const { capabilities } = makeCapabilities();
    const activation = searchActivation();
    expect(() => activation.opener.inline('a.ts', capabilities))
      .toThrow('search opens no files');
  });

  it('opens the tab on a bare search command without starting a scan', () => {
    const { capabilities, openOrFocusTab, projectFileList } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('', capabilities);
    expect(openOrFocusTab).toHaveBeenCalledTimes(1);
    expect(projectFileList).not.toHaveBeenCalled();
  });

  it('opens the tab and starts a scan for a search command with a query', async () => {
    const { capabilities, openOrFocusTab, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    await settle();
    expect(openOrFocusTab).toHaveBeenCalledTimes(1);
    expect(lastPayload(updateTab).state).toBe('done');
  });

  it('enters the searching state before any row has arrived', () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    expect(lastPayload(updateTab).state).toBe('searching');
  });

  it('seeds the query into the tab it opens', () => {
    const { capabilities, openOrFocusTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('  todo  ', capabilities);
    const factory = openOrFocusTab.mock.calls[0]?.[1] as () => { payload: SearchPayload };
    expect(factory().payload.query).toBe('todo');
  });

  it('streams the rows a scan finds into the tab', async () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    await settle();
    const payload = lastPayload(updateTab);
    expect(payload.rows.map((row) => [row.path, row.line])).toEqual([['b.ts', 2]]);
    expect(payload.state).toBe('done');
  });

  it('appends rows rather than replacing them as batches arrive', async () => {
    const contents: Record<string, string> = { 'a.ts': 'todo a', 'b.ts': 'todo b', 'c.ts': 'todo c' };
    const { capabilities, updateTab } = makeCapabilities({
      projectFileList: vi.fn(async () => ({ root: '/repo', paths: Object.keys(contents) })),
    });
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    expect(lastPayload(updateTab).rows).toHaveLength(3);
  });

  it('settles with no rows for a query nothing matches', async () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('absent', capabilities);
    await settle();
    const payload = lastPayload(updateTab);
    expect(payload.rows).toEqual([]);
    expect(payload.state).toBe('done');
  });

  it('settles as done for an empty query rather than searching for it', async () => {
    const { capabilities, updateTab, projectFileList } = makeCapabilities();
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', { ...query, query: '' }), capabilities);
    await settle();
    expect(projectFileList).not.toHaveBeenCalled();
    expect(lastPayload(updateTab).state).toBe('done');
  });

  it('rejects an intent name the table does not declare', () => {
    const { capabilities } = makeCapabilities();
    const activation = searchActivation();
    expect(() => activation.intent(intent(settledTab, 'toString', {}), capabilities))
      .toThrow('unknown search intent "toString"');
  });

  it('rejects a search intent whose payload is malformed', () => {
    const { capabilities } = makeCapabilities();
    const activation = searchActivation();
    expect(() => activation.intent(intent(settledTab, 'search', { query: 'todo' }), capabilities))
      .toThrow('invalid search payload');
  });

  it('rejects an open intent carrying a non-numeric line', () => {
    const { capabilities } = makeCapabilities();
    const activation = searchActivation();
    expect(() => activation.intent(intent(settledTab, 'open', { path: 'a.ts', line: '2' }), capabilities))
      .toThrow('invalid open payload');
  });

  it('opens a result at its line once a scan has listed the project', async () => {
    const { capabilities, openInEditor } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    await settle();
    activation.intent(intent(settledTab, 'open', { path: 'b.ts', line: 2 }), capabilities);
    expect(openInEditor).toHaveBeenCalledWith('/repo/b.ts', 2);
  });

  it('opens nothing for a result before the project has been listed', () => {
    const { capabilities, openInEditor } = makeCapabilities();
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'open', { path: 'b.ts', line: 2 }), capabilities);
    expect(openInEditor).not.toHaveBeenCalled();
  });

  it('clears the query and the rows', async () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    await settle();
    activation.intent(intent(settledTab, 'clear', {}), capabilities);
    const payload = lastPayload(updateTab);
    expect(payload.query).toBe('');
    expect(payload.rows).toEqual([]);
  });

  it('cancels the scan in flight when a new query replaces it', async () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    activation.command?.('absent', capabilities);
    await settle();
    const payload = lastPayload(updateTab);
    expect(payload.query).toBe('absent');
    expect(payload.rows).toEqual([]);
  });

  it('disables itself when the authoritative tab payload is invalid', () => {
    const { capabilities } = makeCapabilities();
    const activation = searchActivation();
    expect(() => activation.intent(
      { tab: 'search', intent: 'search', payload: query, tabPayload: { rows: 'no' } },
      capabilities,
    )).toThrow('invalid search tab payload');
  });

  it('releases the scan on dispose', async () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    const before = updateTab.mock.calls.length;
    await activation.dispose?.();
    await settle();
    // Nothing further was published after disposal, so a scan still running cannot repaint a tab
    // this plugin no longer owns.
    expect(updateTab.mock.calls.length).toBe(before);
  });
});
