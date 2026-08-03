import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
} from '../api.js';
import { activate } from './activate.js';
import { isPagePayload } from './shared.js';

function fakeCapabilities({ browser = true }: { browser?: boolean } = {}) {
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const updated: { key: string; value: TabPluginTabUpdate }[] = [];
  const snapshots: { key: string; text: string }[] = [];
  const notes: string[] = [];
  const externals: string[] = [];
  const capabilities = {
    note: (text: string) => { notes.push(text); },
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => {
      opened.push({ key, value: factory() });
    },
    updateTab: (key: string, factory: () => TabPluginTabUpdate) => {
      updated.push({ key, value: factory() });
    },
    dockTab: vi.fn(),
    snapshotTab: (key: string, text: string) => { snapshots.push({ key, text }); },
    openClaimedFiles: vi.fn(),
    topicData: () => [],
    topicAction: vi.fn(),
    configuredViewer: () => '',
    openExternally: (url: string) => { externals.push(url); return browser; },
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, externals, notes, opened, snapshots, updated };
}

const TAB_PAYLOAD = { url: 'https://slashdot.org/', domain: 'slashdot.org' };

describe('page plugin opener', () => {
  it('opens a tab keyed by the normalized address and titled with its root domain', () => {
    const fixture = fakeCapabilities();

    activate().opener.inline('https://www.slashdot.org/story', fixture.capabilities);

    expect(fixture.opened).toEqual([{
      key: 'https://www.slashdot.org/story',
      value: {
        title: 'slashdot.org',
        payload: { url: 'https://www.slashdot.org/story', domain: 'slashdot.org' },
      },
    }]);
  });

  // The host hands over the target verbatim, so the bare address `open page slashdot.org` produces
  // is normalized here rather than in the dispatcher.
  it('supplies a default https scheme for a bare address', () => {
    const fixture = fakeCapabilities();

    activate().opener.inline('slashdot.org', fixture.capabilities);

    expect(fixture.opened[0].key).toBe('https://slashdot.org/');
  });

  it.each([
    ['javascript:alert(1)'],
    ['file:///etc/passwd'],
    [' '.repeat(3)],
  ])('notes %s as invalid instead of opening a tab', (target) => {
    const fixture = fakeCapabilities();

    activate().opener.inline(target, fixture.capabilities);

    expect(fixture.opened).toEqual([]);
    expect(fixture.notes).toEqual([`open: invalid URL "${target}"`]);
  });

  it('hands the address to the OS browser and confirms with the domain', () => {
    const fixture = fakeCapabilities();

    activate().opener.external('slashdot.org', fixture.capabilities);

    expect(fixture.externals).toEqual(['https://slashdot.org/']);
    expect(fixture.notes).toEqual(['Opening slashdot.org in your browser…']);
    expect(fixture.opened).toEqual([]);
  });

  it('reports the address itself when no browser could be launched', () => {
    const fixture = fakeCapabilities({ browser: false });

    activate().opener.external('https://slashdot.org/', fixture.capabilities);

    expect(fixture.notes).toEqual(['No browser available. The address is https://slashdot.org/']);
  });

  it('notes an invalid address for the external presentation too', () => {
    const fixture = fakeCapabilities();

    activate().opener.external('ftp://example.com', fixture.capabilities);

    expect(fixture.externals).toEqual([]);
    expect(fixture.notes).toEqual(['open: invalid URL "ftp://example.com"']);
  });
});

describe('page plugin intents', () => {
  const intent = (
    name: string, payload: unknown, fixture: ReturnType<typeof fakeCapabilities>,
    tabPayload: unknown = TAB_PAYLOAD,
  ) => activate().intent({ tab: 'page', intent: name, payload, tabPayload }, fixture.capabilities);

  // The tab's identity is the address it shows, so navigating moves the instance key with it.
  it('re-keys, retitles, and repaints the tab on navigate', () => {
    const fixture = fakeCapabilities();

    expect(intent('navigate', { url: 'example.com/path' }, fixture)).toBeNull();

    expect(fixture.updated).toEqual([{
      key: 'https://slashdot.org/',
      value: {
        instanceKey: 'https://example.com/path',
        title: 'example.com',
        payload: { url: 'https://example.com/path', domain: 'example.com' },
      },
    }]);
  });

  // An unviewable scheme is an ordinary outcome of what the user typed, not a bad request: the tab
  // simply stays where it is.
  it.each([
    ['javascript:alert(1)'],
    ['https://slashdot.org/'],
  ])('leaves the tab where it is when navigate names %s', (url) => {
    const fixture = fakeCapabilities();

    expect(intent('navigate', { url }, fixture)).toBeNull();

    expect(fixture.updated).toEqual([]);
  });

  it('caches the relayed text against the tab it came from', () => {
    const fixture = fakeCapabilities();

    expect(intent('sync', { url: 'https://slashdot.org/', text: 'visible text' }, fixture)).toBeNull();

    expect(fixture.updated).toEqual([]);
    expect(fixture.snapshots).toEqual([{ key: 'https://slashdot.org/', text: 'visible text' }]);
  });

  // The relay carries both at once, and the key has to move before the snapshot is filed under it.
  it('follows the live address and snapshots under the key the tab ends up with', () => {
    const fixture = fakeCapabilities();

    intent('sync', { url: 'https://slashdot.org/story/1', text: 'story text' }, fixture);

    expect(fixture.updated[0].value.instanceKey).toBe('https://slashdot.org/story/1');
    expect(fixture.snapshots).toEqual([{ key: 'https://slashdot.org/story/1', text: 'story text' }]);
  });

  it('answers malformed and unknown intents with a rejection, not a plugin failure', () => {
    const fixture = fakeCapabilities();
    for (const [name, payload, message] of [
      ['navigate', {}, 'invalid navigate payload'],
      ['sync', { url: 'https://slashdot.org/' }, 'invalid sync payload'],
      ['unknown', {}, 'unknown page intent "unknown"'],
    ] as const) {
      expect(() => intent(name, payload, fixture)).toThrow(new TabPluginRejection(message));
    }
    expect(fixture.updated).toEqual([]);
    expect(fixture.snapshots).toEqual([]);
  });

  it('treats an invalid tab payload as a plugin failure rather than a rejection', () => {
    const fixture = fakeCapabilities();
    let thrown: unknown;
    try {
      intent('navigate', { url: 'example.com' }, fixture, { nope: true });
    } catch (error) { thrown = error; }
    expect(thrown).not.toBeInstanceOf(TabPluginRejection);
    expect((thrown as Error).message).toBe('invalid page tab payload');
  });
});

describe('isPagePayload', () => {
  it('accepts a complete payload', () => {
    expect(isPagePayload(TAB_PAYLOAD)).toBe(true);
  });

  it.each([
    ['null', null],
    ['an array', [TAB_PAYLOAD]],
    ['a missing url', { domain: 'slashdot.org' }],
    ['a missing domain', { url: 'https://slashdot.org/' }],
    ['a non-string url', { url: 1, domain: 'slashdot.org' }],
  ])('rejects %s', (_name, value) => {
    expect(isPagePayload(value)).toBe(false);
  });
});
