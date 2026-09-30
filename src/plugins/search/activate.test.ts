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
  const readSettings = vi.fn(() => ({}));
  const saveSettings = vi.fn((_settings: Record<string, unknown>) => true);
  const note = vi.fn();
  const capabilities = {
    note, openOrFocusTab, updateTab, projectFileList, openInEditor, rejectRequest, readSettings, saveSettings,
    reportFailure: vi.fn((reason: unknown) => { throw new Error(String(reason)); }),
    ...overrides,
  };
  return {
    capabilities: capabilities as never, openOrFocusTab, updateTab, projectFileList, openInEditor, saveSettings, note,
  };
}

// A tab payload to hand a handler that only needs a valid one — an intent reads the authoritative
// tab payload, not whatever the test last published.
const settledTab: SearchPayload = {
  query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
  state: 'done', message: '', rows: [], seed: 0,
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
