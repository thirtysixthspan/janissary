import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate.js';
import { compileMatcher } from './compile-matcher.js';
import { fileMatches, matchFile } from './search-files.js';
import { MAX_BYTES, type ScanMatcherFactory } from './scan.js';
import type { MatcherWorker } from './matcher-worker-protocol.js';
import type { SearchIntent, SearchPayload } from './shared.js';
import { isJsonCompatible } from '../tab-value.js';

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
  const readSettings = vi.fn(() => ({}));
  const saveSettings = vi.fn((_settings: Record<string, unknown>) => true);
  const note = vi.fn();
  const notifyUser = vi.fn();
  const capabilities = {
    note, notifyUser, originTab: vi.fn(() => null), openOrFocusTab, updateTab, projectFileList, openInEditor, rejectRequest, readSettings, saveSettings,
    reportFailure: vi.fn((reason: unknown) => { throw new Error(String(reason)); }),
    ...overrides,
  };
  return {
    capabilities: capabilities as never, openOrFocusTab, updateTab, projectFileList, openInEditor, saveSettings, note, notifyUser,
  };
}

// A tab payload to hand a handler that only needs a valid one — an intent reads the authoritative
// tab payload, not whatever the test last published.
const settledTab: SearchPayload = {
  query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
  state: 'done', message: '', rows: [], seed: 0, scope: '$root',
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
  }, inlineMatcher);
}

const inlineMatcher: ScanMatcherFactory = (request) => {
  const matcher = compileMatcher(request.query, request);
  const worker: MatcherWorker = {
    detect: async (lines) => matcher !== null && fileMatches(lines, matcher),
    rows: async (relPath, text) => matcher === null ? [] : matchFile(relPath, text, matcher),
    dispose: () => {},
  };
  return worker;
};

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

  it('opens the tab and searches for the selection the default menu hands it', async () => {
    const { capabilities, openOrFocusTab, updateTab } = makeCapabilities();
    const activation = searchActivation();
    await activation.defaultMenuAction?.('  todo  ', capabilities);
    expect(openOrFocusTab).toHaveBeenCalledTimes(1);
    expect(lastPayload(updateTab)).toMatchObject({ query: 'todo', seed: 1, state: 'searching' });
    await settle();
    expect(lastPayload(updateTab).rows.map((row) => [row.path, row.line])).toEqual([['b.ts', 2]]);
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

  it('moves the seed when a command carries a query, and at no other time', () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    expect(lastPayload(updateTab).seed).toBe(1);
    activation.intent(intent(settledTab, 'search', { ...query, query: 'other' }), capabilities);
    expect(lastPayload(updateTab).seed).toBe(1);
    activation.command?.('', capabilities);
    activation.command?.('fixme', capabilities);
    expect(lastPayload(updateTab).seed).toBe(2);
    expect(lastPayload(updateTab).query).toBe('fixme');
  });

  it('reports a regex that will not compile instead of searching for it', async () => {
    const { capabilities, updateTab, projectFileList, note } = makeCapabilities();
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', { ...query, query: '[unclosed', regex: true }), capabilities);
    await settle();
    expect(projectFileList).not.toHaveBeenCalled();
    const payload = lastPayload(updateTab);
    expect(payload.state).toBe('error');
    expect(payload.rows).toEqual([]);
    expect(payload.message).toContain('Invalid regular expression');
    expect(note).toHaveBeenCalledWith(payload.message);
  });

  it('notes the error through the capabilities of the request that asked', () => {
    const first = makeCapabilities();
    const second = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('', first.capabilities);
    activation.intent(intent(settledTab, 'search', { ...query, query: '(', regex: true }), second.capabilities);
    expect(second.note).toHaveBeenCalledTimes(1);
    expect(first.note).not.toHaveBeenCalled();
  });

  it('keeps searching normally after a pattern that would not compile', async () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', { ...query, query: '[unclosed', regex: true }), capabilities);
    activation.intent(intent(settledTab, 'search', { ...query, query: 'to+do', regex: true }), capabilities);
    await settle();
    const payload = lastPayload(updateTab);
    expect(payload.state).toBe('done');
    expect(payload.message).toBe('');
    expect(payload.rows.map((row) => [row.path, row.line])).toEqual([['b.ts', 2]]);
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

  it('opens or focuses the tab through the capabilities of the command that asked', () => {
    const first = makeCapabilities();
    const second = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('', first.capabilities);
    first.openOrFocusTab.mockClear();
    activation.command?.('todo', second.capabilities);
    expect(second.openOrFocusTab).toHaveBeenCalledTimes(1);
    expect(first.openOrFocusTab).not.toHaveBeenCalled();
  });

  it('opens or focuses the tab through the capabilities of the menu action that asked', () => {
    const first = makeCapabilities();
    const second = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('', first.capabilities);
    first.openOrFocusTab.mockClear();
    activation.defaultMenuAction?.('todo', second.capabilities);
    expect(second.openOrFocusTab).toHaveBeenCalledTimes(1);
    expect(first.openOrFocusTab).not.toHaveBeenCalled();
  });

  it('opens a result through the capabilities of the open intent that asked', async () => {
    const first = makeCapabilities();
    const second = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', first.capabilities);
    await settle();
    activation.intent(intent(settledTab, 'open', { path: 'b.ts', line: 2 }), second.capabilities);
    expect(second.openInEditor).toHaveBeenCalledWith('/repo/b.ts', 2);
    expect(first.openInEditor).not.toHaveBeenCalled();
  });

  it('opens nothing for a result before the project has been listed', () => {
    const { capabilities, openInEditor } = makeCapabilities();
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'open', { path: 'b.ts', line: 2 }), capabilities);
    expect(openInEditor).not.toHaveBeenCalled();
  });

  it('refuses a result whose path escapes the project root', async () => {
    const { capabilities, updateTab, openInEditor } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    await settle();
    const rows = lastPayload(updateTab).rows;

    // The path arrived from the client. `path.join` collapses `..`, so a traversing path would
    // resolve outside the project and be opened and served — this is the check that stops it.
    // Only a traversing path can escape: `path.join` treats an absolute path as relative to the
    // root, so `/etc/passwd` names a file inside the project and is a legitimate result.
    activation.intent(intent(settledTab, 'open', { path: '../../../etc/passwd', line: 1 }), capabilities);
    activation.intent(intent(settledTab, 'open', { path: 'b.ts/../../../../etc/shadow', line: 1 }), capabilities);

    expect(openInEditor).not.toHaveBeenCalled();
    // The tab is untouched: a refused open repaints nothing.
    expect(lastPayload(updateTab).rows).toEqual(rows);
  });

  it('still opens a result whose path is inside the project', async () => {
    const { capabilities, openInEditor } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    await settle();

    // `path.join` resolves an absolute path against the root, so this names a project file and is
    // exactly the case the confinement check must not break.
    activation.intent(intent(settledTab, 'open', { path: '/src/a.ts', line: 3 }), capabilities);

    expect(openInEditor).toHaveBeenCalledWith('/repo/src/a.ts', 3);
  });

  it('clears the query and the rows when the query is emptied', async () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    await settle();
    // Emptying the query is how a user clears the tab: an empty query is not searched, so the rows
    // go with it. This is the route that replaced the removed `clear` intent.
    activation.intent(intent(settledTab, 'search', { ...query, query: '' }), capabilities);
    await settle();
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

  it('reports a failed project listing in the tab rather than searching forever', async () => {
    const { capabilities, updateTab } = makeCapabilities({
      projectFileList: vi.fn(async () => { throw new Error('could not list the project'); }),
    });
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    await settle();
    // The third state the spec promises: without it a failed scan reads as a scan still running.
    const payload = lastPayload(updateTab);
    expect(payload.state).toBe('error');
    expect(payload.message).toBe('could not list the project');
    expect(payload.rows).toEqual([]);
  });

  it('reports no failure when a scan is cancelled before its file list answers', async () => {
    // The first listing never answers, so the second query's cancel lands while it is still in
    // flight; the second listing succeeds, so only the superseded scan could report a failure.
    const projectFileList = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ root: '/repo', paths: ['b.ts'] });
    const { capabilities, updateTab } = makeCapabilities({ projectFileList });
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    activation.command?.('todo', capabilities);
    await settle();
    // The superseded scan was abandoned by the user, so its outcome is not something to report.
    expect(lastPayload(updateTab).state).not.toBe('error');
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

describe('search plugin remembered modes', () => {
  it('opens the tab with the modes saved in the config', () => {
    const { capabilities, openOrFocusTab } = makeCapabilities({
      readSettings: vi.fn(() => ({ regex: true, matchCase: false, wholeWord: true })),
    });
    const activation = searchActivation();
    activation.command?.('', capabilities);
    const factory = openOrFocusTab.mock.calls[0]?.[1] as () => { payload: SearchPayload };
    const { regex, matchCase, wholeWord } = factory().payload;
    expect({ regex, matchCase, wholeWord }).toEqual({ regex: true, matchCase: false, wholeWord: true });
  });

  it('searches with the saved modes when a search command seeds the query', () => {
    const { capabilities, updateTab, saveSettings } = makeCapabilities({
      readSettings: vi.fn(() => ({ matchCase: true })),
    });
    const activation = searchActivation();
    activation.command?.('todo', capabilities);
    expect(lastPayload(updateTab).matchCase).toBe(true);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('saves the modes once when a search changes them', () => {
    const { capabilities, saveSettings } = makeCapabilities();
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', { ...query, regex: true }), capabilities);
    activation.intent(intent(settledTab, 'search', { ...query, query: 'two', regex: true }), capabilities);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(saveSettings).toHaveBeenCalledWith({ regex: true, matchCase: false, wholeWord: false });
  });

  it('does not rewrite the config for a search that leaves the modes alone', () => {
    const { capabilities, saveSettings } = makeCapabilities();
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', query), capabilities);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('tries again on the next search when a save fails', () => {
    const failingSave = vi.fn(() => false);
    const { capabilities } = makeCapabilities({ saveSettings: failingSave });
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', { ...query, wholeWord: true }), capabilities);
    activation.intent(intent(settledTab, 'search', { ...query, wholeWord: true }), capabilities);
    expect(failingSave).toHaveBeenCalledTimes(2);
  });
});

// The host runs the `openOrFocusTab` factory only when it has to build the tab, so a fake that runs
// it stands for a tab closed and opened again, and one that does not for a tab that is still open.
describe('search plugin tab lifetime', () => {
  // Records each payload the factory built, running it exactly once as the host does.
  const building = () => {
    const made: SearchPayload[] = [];
    const openOrFocusTab = vi.fn((_key: string, factory: () => { payload: SearchPayload }) => {
      made.push(factory().payload);
    });
    return { openOrFocusTab, made };
  };

  it('starts a rebuilt tab empty, keeping only the toggles', async () => {
    const { openOrFocusTab, made } = building();
    const { capabilities } = makeCapabilities({ openOrFocusTab });
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', { ...query, include: 'b.ts', matchCase: true }), capabilities);
    await settle();
    activation.command?.('', capabilities);
    expect(made.at(-1)).toMatchObject({ query: '', include: '', exclude: '', rows: [], state: 'done', matchCase: true, regex: false });
  });

  it('publishes nothing more from a scan still running when the tab is rebuilt', async () => {
    const { openOrFocusTab } = building();
    const { capabilities, updateTab } = makeCapabilities({ openOrFocusTab });
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', query), capabilities);
    activation.command?.('', capabilities);
    const published = updateTab.mock.calls.length;
    await settle();
    expect(updateTab.mock.calls.length).toBe(published);
  });

  it('builds a tab carrying a command\'s phrase and searches for it', async () => {
    const { openOrFocusTab, made } = building();
    const { capabilities, updateTab } = makeCapabilities({ openOrFocusTab });
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', { ...query, query: 'nothing' }), capabilities);
    await settle();
    activation.command?.('todo', capabilities);
    expect(made.at(-1)?.query).toBe('todo');
    await settle();
    expect(lastPayload(updateTab).rows.map((row) => [row.path, row.line])).toEqual([['b.ts', 2]]);
  });

  it('keeps the state of a tab that is still open', () => {
    const { capabilities, updateTab } = makeCapabilities();
    const activation = searchActivation();
    activation.intent(intent(settledTab, 'search', { ...query, include: 'b.ts' }), capabilities);
    activation.command?.('', capabilities);
    activation.command?.('todo', capabilities);
    expect(lastPayload(updateTab).include).toBe('b.ts');
  });
});

// A route's origin decides which workspace is searched. The clone sits at `/repo/clone`, so the
// fake reader serves its files as `clone/<path>`, and its listing answers its own root.
describe('search plugin workspace scope', () => {
  const clone = { dir: '/repo/clone', label: 'claude-2', display: '$workspace/claude-2' };
  const harness = { label: 'claude-2', cwd: clone.dir, root: '/repo', workspace: clone };
  const searchTab = { label: 'search', cwd: '/repo', root: '/repo', plugin: 'search' };
  const contents: Record<string, string> = { ...files, 'clone/b.ts': 'todo in the clone' };
  const listing = vi.fn(async (root?: string) => ({ root: root ?? '/repo', paths: ['b.ts'] }));

  function scoped(origin: { current: unknown }, overrides: Capability = {}) {
    listing.mockClear();
    return makeCapabilities({
      originTab: vi.fn(() => origin.current), projectFileList: listing,
      releaseRemoteWorkspace: vi.fn(), joinRemoteWorkspace: vi.fn(() => true), ...overrides,
    });
  }

  const roots = () => listing.mock.calls.map((call) => call[0]);

  it('re-scopes a default-menu action from a workspaced harness and scans the clone', async () => {
    const { capabilities, updateTab } = scoped({ current: harness });
    const activation = searchActivation(contents);
    await activation.defaultMenuAction?.('todo', capabilities);
    await settle();
    expect(roots()).toEqual(['/repo/clone']);
    const payload = lastPayload(updateTab);
    expect(payload.scope).toBe('$workspace/claude-2');
    expect(payload.rows.map((row) => row.match)).toEqual(['todo in the clone']);
  });

  it('searches a local workspaced shell clone from both the command and default menu', async () => {
    const shell = {
      label: 'shell-2', view: 'plugin', plugin: 'shell', workspace: clone,
    };
    const { capabilities, updateTab } = scoped({ current: shell });
    const activation = searchActivation(contents);

    activation.command?.('todo', capabilities);
    await settle();
    expect(roots()).toEqual(['/repo/clone']);
    const payload = lastPayload(updateTab);
    expect(payload).toMatchObject({
      scope: '$workspace/claude-2', rows: [{ match: 'todo in the clone' }], state: 'done',
    });
    expect('host' in payload).toBe(false);
    expect(isJsonCompatible(payload)).toBe(true);

    await activation.defaultMenuAction?.('todo', capabilities);
    await settle();
    expect(roots()).toEqual(['/repo/clone', '/repo/clone']);
    expect(lastPayload(updateTab).scope).toBe('$workspace/claude-2');
  });

  it('reruns the current request on a bare search from another scope, and only focuses from the same', async () => {
    const origin = { current: null as unknown };
    const { capabilities, openOrFocusTab } = scoped(origin);
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    origin.current = harness;
    activation.command?.('', capabilities);
    await settle();
    expect(roots()).toEqual([undefined, '/repo/clone']);
    activation.command?.('', capabilities);
    await settle();
    expect(listing).toHaveBeenCalledTimes(2);
    expect(openOrFocusTab).toHaveBeenCalledTimes(3);
  });

  it('starts no scan on a bare re-scope with an empty query, republishing empty rows in the new scope', () => {
    const { capabilities, updateTab } = scoped({ current: harness });
    const activation = searchActivation(contents);
    activation.command?.('', capabilities);
    expect(listing).not.toHaveBeenCalled();
    expect(lastPayload(updateTab)).toMatchObject({ rows: [], state: 'done', scope: '$workspace/claude-2' });
  });

  it('refuses a workspace that is not ready yet, opening nothing', () => {
    const { capabilities, openOrFocusTab, notifyUser } = scoped({ current: { ...harness, provisioning: true } });
    void searchActivation(contents).defaultMenuAction?.('todo', capabilities);
    expect(notifyUser).toHaveBeenCalledWith('Search: the workspace of "claude-2" is not ready yet.');
    expect(openOrFocusTab).not.toHaveBeenCalled();
    expect(listing).not.toHaveBeenCalled();
  });

  it('refuses a workspace that is gone, opening nothing', () => {
    const gone = { ...harness, workspace: { ...clone, gone: true } };
    const { capabilities, openOrFocusTab, notifyUser } = scoped({ current: gone });
    searchActivation(contents).command?.('todo', capabilities);
    expect(notifyUser).toHaveBeenCalledWith('Search: the workspace of "claude-2" is no longer available.');
    expect(openOrFocusTab).not.toHaveBeenCalled();
    expect(listing).not.toHaveBeenCalled();
  });

  it('keeps the scope for a selection inside the search tab', async () => {
    const origin = { current: harness as unknown };
    const { capabilities, updateTab } = scoped(origin);
    const activation = searchActivation(contents);
    activation.command?.('', capabilities);
    origin.current = searchTab;
    await activation.defaultMenuAction?.('todo', capabilities);
    await settle();
    expect(roots()).toEqual(['/repo/clone']);
    expect(lastPayload(updateTab).scope).toBe('$workspace/claude-2');
  });

  it('keeps the include and exclude fields across a re-scope without rebuilding the tab', async () => {
    let built = 0;
    const openOrFocusTab = vi.fn((_key: string, factory: () => unknown) => {
      built += 1;
      if (built === 1) factory();
    });
    const origin = { current: null as unknown };
    const { capabilities, updateTab } = scoped(origin, { openOrFocusTab });
    const activation = searchActivation(contents);
    activation.command?.('', capabilities);
    activation.intent(intent(settledTab, 'search', { ...query, include: 'b.ts', exclude: 'x.ts' }), capabilities);
    origin.current = harness;
    activation.command?.('', capabilities);
    await settle();
    expect(lastPayload(updateTab)).toMatchObject({ include: 'b.ts', exclude: 'x.ts', scope: '$workspace/claude-2' });
    expect(roots()).toEqual([undefined, '/repo/clone']);
    // Two opens, and only the first ran the factory: the re-scope republished the same tab.
    expect(built).toBe(2);
  });

  it('lists the clone for a query typed in the tab after a re-scope', async () => {
    const { capabilities } = scoped({ current: harness });
    const activation = searchActivation(contents);
    activation.command?.('', capabilities);
    activation.intent(intent(settledTab, 'search', query), capabilities);
    await settle();
    expect(roots()).toEqual(['/repo/clone']);
  });

  it('opens a local row from the clone through the route\'s own editor, refusing an escaping path', async () => {
    const { capabilities } = scoped({ current: harness });
    const opener = makeCapabilities();
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    activation.intent(intent(settledTab, 'open', { path: '../b.ts', line: 1 }), opener.capabilities);
    expect(opener.openInEditor).not.toHaveBeenCalled();
    activation.intent(intent(settledTab, 'open', { path: 'b.ts', line: 1 }), opener.capabilities);
    expect(opener.openInEditor).toHaveBeenCalledWith('/repo/clone/b.ts', 1);
  });

  it('keeps the clone as the open root when a cancelled launch listing resolves after the clone listing', async () => {
    const launch = Promise.withResolvers<void>();
    const projectFileList = vi.fn(async (root?: string) => {
      if (root === undefined) await launch.promise;
      return { root: root ?? '/repo', paths: ['b.ts'] };
    });
    const origin = { current: null as unknown };
    const { capabilities } = scoped(origin, { projectFileList });
    const opener = makeCapabilities();
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    origin.current = harness;
    activation.command?.('', capabilities);
    await settle();
    launch.resolve();
    await settle();
    activation.intent(intent(settledTab, 'open', { path: 'b.ts', line: 1 }), opener.capabilities);
    expect(opener.openInEditor).toHaveBeenCalledWith('/repo/clone/b.ts', 1);
  });

  it('starts a closed and reopened tab at the launch directory', async () => {
    const openOrFocusTab = vi.fn((_key: string, factory: () => unknown) => { factory(); });
    const origin = { current: harness as unknown };
    const { capabilities, updateTab } = scoped(origin, { openOrFocusTab });
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    origin.current = searchTab;
    activation.command?.('todo', capabilities);
    await settle();
    expect(roots()).toEqual(['/repo/clone', undefined]);
    expect(lastPayload(updateTab).scope).toBe('$root');
  });

  const far = { dir: '/far/clone', label: 'claude-9', display: '$workspace/claude-9', host: 'box', ride: 'claude-9' };
  const remoteHarness = { label: 'claude-9', cwd: far.dir, root: '/repo', workspace: far };
  const otherRider = { label: 'shell-9', cwd: far.dir, root: '/repo', workspace: { ...far, ride: 'shell-9' } };
  const otherFar = { ...far, dir: '/far/other', label: 'claude-8', display: '$workspace/claude-8', ride: 'claude-8' };
  const otherRemote = { label: 'claude-8', cwd: otherFar.dir, root: '/repo', workspace: otherFar };

  function remoteFakes(joins: boolean[] = []) {
    const calls: string[] = [];
    return {
      calls,
      overrides: {
        releaseRemoteWorkspace: vi.fn((key: string) => { calls.push(`release ${key}`); }),
        joinRemoteWorkspace: vi.fn((key: string, ride: string) => {
          calls.push(`join ${key} ${ride}`);
          return joins.shift() ?? true;
        }),
        remoteWorkspaceFileList: vi.fn(async () => ({ root: '/far/clone', paths: ['r.ts'] })),
        readRemoteWorkspaceFile: vi.fn(async () => 'todo on the far side'),
        materializeRemoteFile: vi.fn(() => Promise.resolve('/cache/r.ts')),
      },
    };
  }

  it('joins a remote scope and scans it over the channel, never listing locally', async () => {
    const { calls, overrides } = remoteFakes();
    const { capabilities, updateTab } = scoped({ current: remoteHarness }, overrides);
    searchActivation(contents).command?.('todo', capabilities);
    await settle();
    expect(calls).toEqual(['release search', 'join search claude-9']);
    expect(listing).not.toHaveBeenCalled();
    expect(overrides.remoteWorkspaceFileList).toHaveBeenCalledWith('search');
    expect(overrides.readRemoteWorkspaceFile).toHaveBeenCalledWith('search', 'r.ts', MAX_BYTES);
    const payload = lastPayload(updateTab);
    expect(payload).toMatchObject({ scope: '$workspace/claude-9', host: 'box', state: 'done' });
    expect(payload.rows.map((row) => row.match)).toEqual(['todo on the far side']);
  });

  it('settles a remote scan with no rows when the channel answers no listing', async () => {
    const { overrides } = remoteFakes();
    overrides.remoteWorkspaceFileList.mockResolvedValue(null as never);
    const { capabilities, updateTab } = scoped({ current: remoteHarness }, overrides);
    searchActivation(contents).command?.('todo', capabilities);
    await settle();
    expect(lastPayload(updateTab)).toMatchObject({ state: 'done', rows: [] });
  });

  it('shows a remote listing timeout instead of staying in the searching state', async () => {
    const { overrides } = remoteFakes();
    overrides.remoteWorkspaceFileList.mockRejectedValue(new Error('The remote machine did not answer in time.'));
    const { capabilities, updateTab } = scoped({ current: remoteHarness }, overrides);
    searchActivation(contents).command?.('todo', capabilities);
    await settle();

    expect(lastPayload(updateTab)).toMatchObject({
      state: 'error', message: 'The remote machine did not answer in time', rows: [],
    });
  });

  it('neither releases nor joins for another riding tab onto the same remote workspace', async () => {
    const origin = { current: remoteHarness as unknown };
    const { calls, overrides } = remoteFakes();
    const { capabilities } = scoped(origin, overrides);
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    origin.current = otherRider;
    activation.command?.('', capabilities);
    expect(calls).toEqual(['release search', 'join search claude-9']);
  });

  it('releases without joining on a later local scope, clearing the host', async () => {
    const origin = { current: remoteHarness as unknown };
    const { calls, overrides } = remoteFakes();
    const { capabilities, updateTab } = scoped(origin, overrides);
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    origin.current = harness;
    activation.command?.('', capabilities);
    await settle();
    expect(calls).toEqual(['release search', 'join search claude-9', 'release search']);
    const payload = lastPayload(updateTab);
    expect(payload.scope).toBe('$workspace/claude-2');
    expect(payload.host).toBeUndefined();
  });

  it('keeps a local scope and searches nothing when a remote join fails', async () => {
    const origin = { current: harness as unknown };
    const { calls, overrides } = remoteFakes([false]);
    const { capabilities, updateTab, notifyUser } = scoped(origin, overrides);
    const activation = searchActivation(contents);
    activation.command?.('', capabilities);
    origin.current = remoteHarness;
    activation.command?.('todo', capabilities);
    await settle();
    expect(notifyUser).toHaveBeenCalledWith('Search: the workspace of "claude-9" is no longer available.');
    expect(calls).toEqual(['release search', 'release search', 'join search claude-9']);
    expect(listing).not.toHaveBeenCalled();
    expect(overrides.remoteWorkspaceFileList).not.toHaveBeenCalled();
    expect(lastPayload(updateTab).scope).toBe('$workspace/claude-2');
    origin.current = searchTab;
    activation.command?.('todo', capabilities);
    await settle();
    expect(roots()).toEqual(['/repo/clone']);
  });

  it('searches the kept scope again when a failed remote join interrupts its scan', async () => {
    const held = Promise.withResolvers<void>();
    const projectFileList = vi.fn(async (root?: string) => {
      if (projectFileList.mock.calls.length === 1) await held.promise;
      return { root: root ?? '/repo', paths: ['b.ts'] };
    });
    const origin = { current: harness as unknown };
    const { overrides } = remoteFakes([false]);
    const { capabilities, updateTab } = scoped(origin, { ...overrides, projectFileList });
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    origin.current = remoteHarness;
    activation.command?.('phrase', capabilities);
    held.resolve();
    await settle();
    expect(projectFileList.mock.calls.map((call) => call[0])).toEqual(['/repo/clone', '/repo/clone']);
    expect(overrides.remoteWorkspaceFileList).not.toHaveBeenCalled();
    expect(lastPayload(updateTab)).toMatchObject({ query: 'todo', state: 'done', scope: '$workspace/claude-2' });
    expect(lastPayload(updateTab).rows.map((row) => row.match)).toEqual(['todo in the clone']);
  });

  it('rejoins a previous remote scope when the join onto another fails', async () => {
    const origin = { current: otherRemote as unknown };
    const { calls, overrides } = remoteFakes([true, false, true]);
    const { capabilities, updateTab, notifyUser } = scoped(origin, overrides);
    const activation = searchActivation(contents);
    activation.command?.('', capabilities);
    overrides.remoteWorkspaceFileList.mockClear();
    origin.current = remoteHarness;
    activation.command?.('todo', capabilities);
    await settle();
    expect(notifyUser).toHaveBeenCalledWith('Search: the workspace of "claude-9" is no longer available.');
    expect(calls.slice(2)).toEqual(['release search', 'join search claude-9', 'join search claude-8']);
    expect(overrides.remoteWorkspaceFileList).not.toHaveBeenCalled();
    expect(lastPayload(updateTab)).toMatchObject({ scope: '$workspace/claude-8', host: 'box' });
  });

  it('falls back to launch when the previous remote scope cannot be rejoined', async () => {
    const origin = { current: otherRemote as unknown };
    const { overrides } = remoteFakes([true, false, false]);
    const { capabilities, updateTab } = scoped(origin, overrides);
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    expect(lastPayload(updateTab).rows).toHaveLength(1);
    overrides.remoteWorkspaceFileList.mockClear();
    origin.current = remoteHarness;
    activation.command?.('phrase', capabilities);
    await settle();
    expect(listing).not.toHaveBeenCalled();
    expect(overrides.remoteWorkspaceFileList).not.toHaveBeenCalled();
    const payload = lastPayload(updateTab);
    expect(payload).toMatchObject({ scope: '$root', query: 'todo', state: 'done', message: '', rows: [] });
    expect(payload.host).toBeUndefined();
  });

  it('restarts a scan the failed join interrupted in the launch directory it falls back to', async () => {
    const held = Promise.withResolvers<{ root: string; paths: string[] }>();
    const origin = { current: otherRemote as unknown };
    const { overrides } = remoteFakes([true, false, false]);
    overrides.remoteWorkspaceFileList.mockReturnValueOnce(held.promise);
    const { capabilities, updateTab } = scoped(origin, overrides);
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    origin.current = remoteHarness;
    activation.command?.('', capabilities);
    held.resolve({ root: '/far/other', paths: ['r.ts'] });
    await settle();
    expect(roots()).toEqual([undefined]);
    expect(lastPayload(updateTab)).toMatchObject({ query: 'todo', scope: '$root', state: 'done' });
    expect(lastPayload(updateTab).rows.map((row) => row.match)).toEqual(['todo two']);
  });

  it('opens a remote row through the open intent\'s materialized copy, refusing an escaping path', async () => {
    const { overrides } = remoteFakes();
    const { capabilities } = scoped({ current: remoteHarness }, overrides);
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    const opener = remoteFakes();
    const openerCaps = makeCapabilities(opener.overrides);
    activation.intent(intent(settledTab, 'open', { path: '../r.ts', line: 1 }), openerCaps.capabilities);
    expect(opener.overrides.materializeRemoteFile).not.toHaveBeenCalled();
    activation.intent(intent(settledTab, 'open', { path: 'r.ts', line: 1 }), openerCaps.capabilities);
    await settle();
    expect(opener.overrides.materializeRemoteFile).toHaveBeenCalledWith('r.ts');
    expect(overrides.materializeRemoteFile).not.toHaveBeenCalled();
    expect(openerCaps.openInEditor).toHaveBeenCalledWith('/cache/r.ts', 1);
  });

  it('opens nothing when a remote row cannot be materialized', async () => {
    const { overrides } = remoteFakes();
    const { capabilities } = scoped({ current: remoteHarness }, overrides);
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    for (const answer of [null, Promise.resolve(null)]) {
      const opener = makeCapabilities({ materializeRemoteFile: vi.fn(() => answer) });
      activation.intent(intent(settledTab, 'open', { path: 'r.ts', line: 1 }), opener.capabilities);
      await settle();
      expect(opener.openInEditor).not.toHaveBeenCalled();
    }
  });

  it('opens nothing for a shown remote row after a re-scope to local, and a cancelled remote listing keeps the root', async () => {
    const pending = Promise.withResolvers<{ root: string; paths: string[] }>();
    const origin = { current: remoteHarness as unknown };
    const { overrides } = remoteFakes();
    const { capabilities } = scoped(origin, overrides);
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    origin.current = harness;
    activation.command?.('', capabilities);
    const opener = remoteFakes();
    const openerCaps = makeCapabilities(opener.overrides);
    activation.intent(intent(settledTab, 'open', { path: 'r.ts', line: 1 }), openerCaps.capabilities);
    await settle();
    expect(opener.overrides.materializeRemoteFile).not.toHaveBeenCalled();
    expect(openerCaps.openInEditor).not.toHaveBeenCalled();

    overrides.remoteWorkspaceFileList.mockReturnValueOnce(pending.promise);
    origin.current = remoteHarness;
    activation.command?.('', capabilities);
    origin.current = harness;
    activation.command?.('', capabilities);
    await settle();
    pending.resolve({ root: '/far/clone', paths: ['r.ts'] });
    await settle();
    const local = makeCapabilities();
    activation.intent(intent(settledTab, 'open', { path: 'b.ts', line: 1 }), local.capabilities);
    expect(local.openInEditor).toHaveBeenCalledWith('/repo/clone/b.ts', 1);
  });

  it('does not materialize a shown remote row from another remote workspace after a re-scope', async () => {
    const pending = Promise.withResolvers<{ root: string; paths: string[] }>();
    const origin = { current: remoteHarness as unknown };
    const { overrides } = remoteFakes();
    const { capabilities } = scoped(origin, overrides);
    const activation = searchActivation(contents);
    activation.command?.('todo', capabilities);
    await settle();
    overrides.remoteWorkspaceFileList.mockReturnValueOnce(pending.promise);
    origin.current = otherRemote;
    activation.command?.('', capabilities);
    await settle();
    const opener = remoteFakes();
    const openerCaps = makeCapabilities(opener.overrides);
    activation.intent(intent(settledTab, 'open', { path: 'r.ts', line: 1 }), openerCaps.capabilities);
    await settle();
    expect(opener.overrides.materializeRemoteFile).not.toHaveBeenCalled();
    expect(openerCaps.openInEditor).not.toHaveBeenCalled();
    pending.resolve({ root: '/far/other', paths: ['r.ts'] });
  });

  describe('search plugin closes with its workspace', () => {
    const ownRow = { label: 'search-1', incarnation: 'i1', dotColor: '#fff', plugin: { id: 'search', instanceKey: 'search' } };
    const tabsEvent = (tabs: string[] = ['search']) => ({ topic: 'tabs' as const, data: [ownRow], tabs });

    function closing(origin: { current: unknown }, tracked: { current: boolean }, overrides: Capability = {}) {
      const closeOwnTab = vi.fn();
      const workspaceTracked = vi.fn(() => tracked.current);
      const caps = scoped(origin, { closeOwnTab, workspaceTracked, ...overrides });
      return { ...caps, closeOwnTab, workspaceTracked };
    }

    it('closes the tab and cancels the scan when its local clone is no longer tracked', async () => {
      const pending = Promise.withResolvers<void>();
      const reads = { ...contents };
      const activation = activate(async (absPath) => {
        await pending.promise;
        return reads[absPath.replace('/repo/', '')] ?? '';
      }, inlineMatcher);
      const tracked = { current: true };
      const { capabilities, closeOwnTab, updateTab, note, notifyUser } = closing({ current: harness }, tracked);
      activation.command?.('todo', capabilities);
      await settle();
      tracked.current = false;
      activation.notify?.(tabsEvent(), capabilities);
      expect(closeOwnTab).toHaveBeenCalledWith('search');
      const published = updateTab.mock.calls.length;
      pending.resolve();
      await settle();
      expect(updateTab).toHaveBeenCalledTimes(published);
      expect(note).not.toHaveBeenCalled();
      expect(notifyUser).not.toHaveBeenCalled();
    });

    it('does nothing while the clone is still tracked', async () => {
      const { capabilities, closeOwnTab } = closing({ current: harness }, { current: true });
      const activation = searchActivation(contents);
      activation.command?.('todo', capabilities);
      await settle();
      activation.notify?.(tabsEvent(), capabilities);
      expect(closeOwnTab).not.toHaveBeenCalled();
    });

    it('asks nothing while scoped to the launch directory', async () => {
      const originTab = vi.fn(() => null);
      const { capabilities, closeOwnTab, workspaceTracked } = closing({ current: null }, { current: false }, { originTab });
      const activation = searchActivation(contents);
      activation.command?.('todo', capabilities);
      await settle();
      originTab.mockClear();
      activation.notify?.(tabsEvent(), capabilities);
      expect(closeOwnTab).not.toHaveBeenCalled();
      expect(workspaceTracked).not.toHaveBeenCalled();
      expect(originTab).not.toHaveBeenCalled();
    });

    it('closes a remote scope when its own record is gone, and not while it is live', async () => {
      const record = { current: remoteHarness as unknown };
      const { overrides } = remoteFakes();
      const originTab = vi.fn((label?: string) => (label === undefined ? remoteHarness : record.current));
      const { capabilities, closeOwnTab, notifyUser, note } = closing(
        { current: remoteHarness }, { current: true }, { ...overrides, originTab },
      );
      const activation = searchActivation(contents);
      activation.command?.('todo', capabilities);
      await settle();
      activation.notify?.(tabsEvent(), capabilities);
      expect(originTab).toHaveBeenCalledWith('search-1');
      expect(closeOwnTab).not.toHaveBeenCalled();
      record.current = { ...remoteHarness, workspace: { ...far, gone: true } };
      activation.notify?.(tabsEvent(), capabilities);
      expect(closeOwnTab).toHaveBeenCalledWith('search');
      expect(notifyUser).not.toHaveBeenCalled();
      expect(note).not.toHaveBeenCalled();
    });

    it('ignores another topic, a delivery without its own tab, and a delivery before any command', async () => {
      const tracked = { current: false };
      const { capabilities, closeOwnTab } = closing({ current: harness }, tracked);
      const activation = searchActivation(contents);
      activation.notify?.(tabsEvent(), capabilities);
      expect(closeOwnTab).not.toHaveBeenCalled();
      tracked.current = true;
      activation.command?.('todo', capabilities);
      await settle();
      tracked.current = false;
      activation.notify?.({ topic: 'schedules', data: [], tabs: ['search'] }, capabilities);
      activation.notify?.(tabsEvent([]), capabilities);
      expect(closeOwnTab).not.toHaveBeenCalled();
    });

    it('declares the tabs topic and supplies notify', async () => {
      const { searchManifest } = await import('./manifest.js');
      expect(searchManifest.notifications).toContain('tabs');
      expect(searchManifest.capabilities).toEqual(expect.arrayContaining(['workspaceTracked', 'closeOwnTab']));
      expect(typeof searchActivation().notify).toBe('function');
    });
  });
});
