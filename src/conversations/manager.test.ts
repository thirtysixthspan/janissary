import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AcpSession, PromptHandlers } from '../acp/types.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { ConversationsManager } from './manager.js';
import { ConversationSessions } from './sessions.js';
import { CONVERSATION_SCHEMA_VERSION, ConversationStore } from './store.js';

const mocks = vi.hoisted(() => ({ connectAcp: vi.fn() }));
vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));

let home: string;

type FakeSession = AcpSession & { prompts: Array<{ text: string; handlers: PromptHandlers }> };

function fakeSession(): FakeSession {
  const prompts: Array<{ text: string; handlers: PromptHandlers }> = [];
  return {
    prompts,
    prompt: (text, handlers) => { prompts.push({ text, handlers }); },
    kill: vi.fn(),
  };
}

function fixture() {
  const store = new ConversationStore({ home });
  const tabs: Tab[] = [];
  const setCwd = vi.fn();
  const openOrRetarget = vi.fn();
  const newAgentInWorkspace = vi.fn();
  const managers = {
    tab: { tabs, setCwd },
    fileNavigator: { openOrRetarget },
    profile: { newAgentInWorkspace },
  } as unknown as Managers;
  let time = 100;
  const manager = new ConversationsManager(managers, {
    store,
    sessions: new ConversationSessions(),
    now: () => ++time,
  });
  return { manager, managers, newAgentInWorkspace, openOrRetarget, setCwd, store };
}

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'conversations-manager-'));
  mocks.connectAcp.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(home, { recursive: true, force: true });
});

// The manager's own bookkeeping: what it answers for a conversation it does not hold, what deleting
// one has to clean up, and the two places it writes a conversation out on its own initiative.
describe('ConversationsManager records and refusals', () => {
  // An empty conversation is not on disk — creating one is not among the things that persist it, and
  // a rename is explicitly not either. So the in-memory check is the only one that can refuse here.
  it('refuses to create an id it already holds', () => {
    const { manager, store } = fixture();
    expect(manager.create('c1')).toBe(true);
    expect(manager.create('c1')).toBe(false);
    expect(store.read('c1')).toBeUndefined();
  });

  it('refuses to create an id that is already on disk', () => {
    const f = fixture();
    f.manager.create('c1');
    f.store.write({
      schemaVersion: CONVERSATION_SCHEMA_VERSION, id: 'c2', title: 'Kept',
      createdAt: 1, updatedAt: 1, pair: { harness: 'claude', model: 'opus' }, turns: [],
    });
    f.manager.dispose();

    const reopened = new ConversationsManager({} as Managers, { store: f.store, now: () => 2 });

    expect(reopened.create('c2')).toBe(false);
    reopened.dispose();
  });

  it('answers false for a conversation it does not hold, rather than creating one', () => {
    const { manager } = fixture();
    expect(manager.load('nope')).toBe(false);
    expect(manager.send('nope', 'hello')).toBe(false);
    expect(manager.openFiles('nope')).toBe(false);
    expect(manager.launchAgent('nope')).toBe(false);
  });

  it('leaves a conversation it does not hold exactly as it found it', () => {
    const { manager, setCwd } = fixture();
    manager.loadOlder('nope');
    expect(setCwd).not.toHaveBeenCalled();
  });

  // Deleting has to stop the in-flight response as well as forget the record: a conversation removed
  // while its answer is still streaming would keep writing into a tab the user has already closed.
  it('cancels the response and forgets the conversation on delete', () => {
    const { manager, store } = fixture();
    manager.create('c1');
    expect(manager.load('c1')).toBe(true);

    manager.delete('c1');

    expect(manager.load('c1')).toBe(false);
    expect(store.read('c1')).toBeUndefined();
  });

  it('deletes a conversation that was never created without complaint', () => {
    const { manager } = fixture();
    expect(() => { manager.delete('nope'); }).not.toThrow();
  });

  // A stored conversation carries no window size, so a later read grows it from the default rather
  // than from whatever a previous visit recorded — the size is per visit, not a property on disk.
  it('grows a stored conversation from the default window', () => {
    const f = fixture();
    f.manager.create('c1');
    f.manager.loadOlder('c1');
    f.manager.loadOlder('c1');
    expect(f.manager.load('c1')).toBe(true);
  });
});

describe('ConversationsManager workspace hand-off', () => {
  const withTab = (f: ReturnType<typeof fixture>, id: string) => {
    f.managers.tab.tabs.push({
      label: 'conversations-1',
      plugin: { id: 'conversations', instanceKey: id },
    } as unknown as Tab);
  };

  it('points the tab at the conversation\'s workspace when files are opened there', () => {
    const f = fixture();
    f.manager.create('c1');
    withTab(f, 'c1');

    expect(f.manager.openFiles('c1')).toBe(true);
    expect(f.setCwd).toHaveBeenCalledOnce();
    expect(f.setCwd.mock.calls[0][1]).toContain('c1');
    expect(f.openOrRetarget).toHaveBeenCalledWith('conversations-1');
  });

  it('launches an agent in that same workspace', () => {
    const f = fixture();
    f.manager.create('c1');
    withTab(f, 'c1');

    expect(f.manager.launchAgent('c1')).toBe(true);
    expect(f.newAgentInWorkspace).toHaveBeenCalledExactlyOnceWith('conversations-1', expect.any(String));
  });

  // An empty conversation is not on disk yet, and its directory has to exist before a file navigator
  // or an agent can be pointed at it — so opening one writes the record out first.
  it('writes an empty conversation out before handing over its workspace', () => {
    const f = fixture();
    f.manager.create('c1');
    withTab(f, 'c1');
    expect(f.store.read('c1')).toBeUndefined();

    f.manager.openFiles('c1');

    expect(f.store.read('c1')).toBeDefined();
  });

  it('opens nothing for a conversation whose tab is gone', () => {
    const f = fixture();
    f.manager.create('c1');
    expect(f.manager.openFiles('c1')).toBe(false);
    expect(f.setCwd).not.toHaveBeenCalled();
  });
});

describe('ConversationsManager when a conversation tab closes', () => {
  // Closing a tab is noticed on a queued turn, not synchronously: the removal event and the cancel it
  // triggers must not interleave with the teardown that is still running.
  const tabRemoved = async () => {
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'conversations-1' });
    await Promise.resolve();
  };

  it('cancels the in-flight response for a conversation whose tab is gone', async () => {
    const f = fixture();
    f.manager.create('c1');
    mocks.connectAcp.mockReturnValue(fakeSession());
    f.manager.send('c1', 'hello');
    expect(f.manager.cancel('c1')).toBe(true);

    // Send again, so there is something in flight for the queued cancel to find, and let the tab go.
    mocks.connectAcp.mockReturnValue(fakeSession());
    f.manager.send('c1', 'again');
    await tabRemoved();

    // The queued cancel ran and closed it, so nothing is left listening: a conversation is never left
    // streaming into a tab that no longer exists.
    expect(f.manager.cancel('c1')).toBe(false);
  });

  it('leaves a conversation alone while its tab is still open', async () => {
    const f = fixture();
    f.manager.create('c1');
    mocks.connectAcp.mockReturnValue(fakeSession());
    f.manager.send('c1', 'hello');
    f.managers.tab.tabs.push({
      label: 'conversations-1',
      plugin: { id: 'conversations', instanceKey: 'c1' },
    } as unknown as Tab);

    await tabRemoved();

    // Still cancellable, so an unrelated tab closing did not tear this conversation down.
    expect(f.manager.cancel('c1')).toBe(true);
  });
});

describe('ConversationsManager', () => {
  it('streams in bounded ticks and writes once when the turn completes', () => {
    vi.useFakeTimers();
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const { manager, store } = fixture();
    const write = vi.spyOn(store, 'write');
    const changed = vi.fn();
    const subscription = messageBus.on('conversations', 'changed', changed);
    manager.create('first');
    changed.mockClear();

    expect(manager.send('first', 'Hello')).toBe(true);
    changed.mockClear();
    session.prompts[0].handlers.onChunk('one');
    session.prompts[0].handlers.onChunk(' two');
    vi.advanceTimersByTime(99);
    expect(changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(changed).toHaveBeenCalledOnce();
    session.prompts[0].handlers.onEnd('end_turn');

    expect(write).toHaveBeenCalledOnce();
    expect(manager.view().windows[0].turns[0]).toMatchObject({
      query: 'Hello', response: 'one two',
    });
    expect(manager.view().windows[0].turns[0]).not.toHaveProperty('streaming');
    subscription.unsubscribe();
    manager.dispose();
  });

  it('primes and replays only the first prompt on a live session', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const { manager } = fixture();
    manager.create('first');
    manager.send('first', 'First');
    expect(session.prompts[0].text).toContain('GitHub-flavored Markdown');
    expect(session.prompts[0].text).toContain('User: First');
    session.prompts[0].handlers.onChunk('Answer');
    session.prompts[0].handlers.onEnd('end_turn');

    manager.send('first', 'Second');

    expect(session.prompts[1].text).toBe('Second');
    manager.dispose();
  });

  it('caps a restarted session replay at the most recent twenty turns', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const { manager, store } = fixture();
    store.write({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      id: 'first', title: 'q0', createdAt: 1, updatedAt: 2,
      pair: { harness: 'opencode', model: 'google/gemini-3.1-flash-lite' },
      turns: Array.from({ length: 25 }, (_, index) => ({
        query: `q${String(index)}`, response: `a${String(index)}`,
        pair: { harness: 'opencode' as const, model: 'google/gemini-3.1-flash-lite' },
      })),
    });
    manager.load('first');

    manager.send('first', 'new');

    expect(session.prompts[0].text).not.toContain('User: q4\n');
    expect(session.prompts[0].text).toContain('User: q5\n');
    expect(session.prompts[0].text).toContain('User: q24\n');
    manager.dispose();
  });

  it('stores a failure, reconnects next time, and recognizes rate limits', () => {
    const first = fakeSession();
    const second = fakeSession();
    mocks.connectAcp.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { manager, store } = fixture();
    manager.create('first');
    manager.send('first', 'First');

    first.prompts[0].handlers.onError('429 too many requests');

    expect(store.read('first')?.turns[0].error).toBe('Rate limited: 429 too many requests');
    expect(manager.view().windows[0].turns[0].error).toContain('Rate limited');
    manager.send('first', 'Second');
    expect(mocks.connectAcp).toHaveBeenCalledTimes(2);
    expect(second.prompts[0].text).toContain('User: First');
    manager.dispose();
  });

  it('cancels by killing the session and discarding the partial without a write', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const { manager, store } = fixture();
    const write = vi.spyOn(store, 'write');
    manager.create('first');
    manager.send('first', 'First');
    session.prompts[0].handlers.onChunk('partial');

    expect(manager.cancel('first')).toBe(true);

    expect(session.kill).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(manager.view().windows[0].turns).toEqual([]);
    expect(manager.view().windows[0].title).toBe('New conversation');
    manager.dispose();
  });

  it('switches model by closing the session before the next query', () => {
    const first = fakeSession();
    const second = fakeSession();
    mocks.connectAcp.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { manager } = fixture();
    manager.create('first');
    manager.send('first', 'First');
    first.prompts[0].handlers.onEnd('end_turn');
    const pair = manager.view().models.find(({ harness }) => harness === 'claude')!;

    expect(manager.selectModel('first', pair)).toBe(true);
    expect(first.kill).toHaveBeenCalledOnce();
    manager.send('first', 'Second');

    expect(mocks.connectAcp).toHaveBeenCalledTimes(2);
    expect(manager.view().windows[0].pair).toEqual(pair);
    manager.dispose();
  });

  it('renames a conversation and reports the new title through the view', () => {
    const { manager } = fixture();
    manager.create('first');

    expect(manager.rename('first', '  Parser notes  ')).toBe(true);
    expect(manager.view().windows[0].title).toBe('Parser notes');
    expect(manager.view().summaries[0].title).toBe('Parser notes');
    manager.dispose();
  });

  // `selectModel`'s rule: a conversation already on disk is rewritten, one that is not stays that
  // way — a rename is not among the things that create the conversation's directory.
  it('persists a rename only for a conversation that already has turns', () => {
    mocks.connectAcp.mockReturnValue(fakeSession());
    const { manager, store } = fixture();
    const write = vi.spyOn(store, 'write');
    manager.create('first');
    manager.rename('first', 'Before any query');
    expect(write).not.toHaveBeenCalled();
    expect(existsSync(store.directory('first'))).toBe(false);

    manager.send('first', 'First');
    write.mockClear();
    manager.rename('first', 'After a query');

    expect(write).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it('refuses a rename with no name in it, and one for an unknown conversation', () => {
    const { manager } = fixture();
    manager.create('first');

    expect(manager.rename('first', ' '.repeat(3))).toBe(false);
    expect(manager.rename('missing', 'Anything')).toBe(false);
    expect(manager.view().windows[0].title).toBe('New conversation');
    manager.dispose();
  });

  it('caps a rename at the length an automatic title is capped at', () => {
    const { manager } = fixture();
    manager.create('first');
    manager.rename('first', 'x'.repeat(80));

    expect(manager.view().windows[0].title).toHaveLength(60);
    manager.dispose();
  });

  it('lets the first query name a conversation nobody has named', () => {
    mocks.connectAcp.mockReturnValue(fakeSession());
    const { manager } = fixture();
    manager.create('first');
    manager.send('first', 'Why is the parser slow?');

    expect(manager.view().windows[0].title).toBe('Why is the parser slow?');
    manager.dispose();
  });

  // An explicit rename is not something the next thing typed should quietly undo.
  it('leaves a renamed conversation named when its first query arrives', () => {
    mocks.connectAcp.mockReturnValue(fakeSession());
    const { manager } = fixture();
    manager.create('first');
    manager.rename('first', 'Parser notes');
    manager.send('first', 'Why is the parser slow?');

    expect(manager.view().windows[0].title).toBe('Parser notes');
    manager.dispose();
  });

  // Cancel puts back what the cancel undid — not a name the responder never set.
  it('keeps a name given while a reply was streaming when that reply is cancelled', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const { manager } = fixture();
    manager.create('first');
    manager.send('first', 'Why is the parser slow?');
    manager.rename('first', 'Parser notes');

    expect(manager.cancel('first')).toBe(true);
    expect(manager.view().windows[0].title).toBe('Parser notes');
    manager.dispose();
  });

  it('refuses a second send while a response is in flight', () => {
    mocks.connectAcp.mockReturnValue(fakeSession());
    const { manager } = fixture();
    manager.create('first');
    expect(manager.send('first', 'First')).toBe(true);
    expect(manager.send('first', 'Second')).toBe(false);
    expect(manager.view().windows[0].turns).toHaveLength(1);
    manager.dispose();
  });

  it('creates no directory until the first query', () => {
    mocks.connectAcp.mockReturnValue(fakeSession());
    const { manager, store } = fixture();
    manager.create('first');
    expect(existsSync(store.directory('first'))).toBe(false);
    manager.send('first', 'First');
    expect(existsSync(path.join(store.directory('first'), 'workspace'))).toBe(true);
    expect(existsSync(path.join(store.directory('first'), 'workspace.tmp'))).toBe(true);
    manager.dispose();
  });

  it('opens workspace tools against an open conversation tab and persists a new conversation', () => {
    const { manager, managers, newAgentInWorkspace, openOrRetarget, setCwd, store } = fixture();
    manager.create('first');
    managers.tab.tabs.push({
      label: 'First conversation', plugin: { id: 'conversations', instanceKey: 'first' },
    } as Tab);

    expect(manager.openFiles('first')).toBe(true);
    const workspace = path.join(store.directory('first'), 'workspace');
    expect(store.read('first')).toMatchObject({ id: 'first', turns: [] });
    expect(existsSync(workspace)).toBe(true);
    expect(setCwd).toHaveBeenCalledWith('First conversation', workspace);
    expect(openOrRetarget).toHaveBeenCalledWith('First conversation');

    expect(manager.launchAgent('first')).toBe(true);
    expect(newAgentInWorkspace).toHaveBeenCalledWith('First conversation', workspace);
    manager.dispose();
  });

  it('refuses workspace tools without an owning open conversation tab', () => {
    const { manager, newAgentInWorkspace, openOrRetarget, store } = fixture();
    const ensure = vi.spyOn(store, 'ensure');
    manager.create('first');

    expect(manager.openFiles('first')).toBe(false);
    expect(manager.launchAgent('first')).toBe(false);
    expect(ensure).not.toHaveBeenCalled();
    expect(openOrRetarget).not.toHaveBeenCalled();
    expect(newAgentInWorkspace).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('extends the loaded window backwards until the file is exhausted', () => {
    const { manager, store } = fixture();
    store.write({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      id: 'first', title: 'long', createdAt: 1, updatedAt: 2,
      pair: { harness: 'opencode', model: 'google/gemini-3.1-flash-lite' },
      turns: Array.from({ length: 45 }, (_, index) => ({
        query: `q${String(index)}`, response: `a${String(index)}`,
        pair: { harness: 'opencode' as const, model: 'google/gemini-3.1-flash-lite' },
      })),
    });
    manager.load('first');
    expect(manager.view().windows[0]).toMatchObject({ hasOlder: true, turns: expect.any(Array) });
    expect(manager.view().windows[0].turns).toHaveLength(20);
    manager.loadOlder('first');
    expect(manager.view().windows[0].turns).toHaveLength(40);
    manager.loadOlder('first');
    expect(manager.view().windows[0]).toMatchObject({ hasOlder: false });
    expect(manager.view().windows[0].turns).toHaveLength(45);
    manager.dispose();
  });

  it('disposes every session without removing durable data', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const { manager, store } = fixture();
    manager.create('first');
    manager.send('first', 'First');
    session.prompts[0].handlers.onEnd('end_turn');
    const directory = store.directory('first');

    manager.dispose();

    expect(session.kill).toHaveBeenCalledOnce();
    expect(existsSync(directory)).toBe(true);
  });

  it('restores a nondefault remembered pair in new conversations before and after restart', () => {
    const seeded = fixture();
    const models = seeded.manager.view().models;
    const initial = models[0];
    const remembered = models.find((pair) => pair.harness !== initial.harness || pair.model !== initial.model)!;
    try {
      expect(remembered).toBeDefined();
      expect(remembered).not.toEqual(initial);
      seeded.manager.create('first');
      expect(seeded.manager.view().windows[0].pair).toEqual(initial);
      expect(seeded.manager.selectModel('first', remembered)).toBe(true);
      seeded.manager.create('second');
      expect(seeded.manager.view().windows.find((window) => window.id === 'second')?.pair)
        .toEqual(remembered);
    } finally {
      seeded.manager.dispose();
    }
    const restarted = fixture();
    try {
      restarted.manager.create('third');
      expect(restarted.manager.view().windows[0].pair).toEqual(remembered);
    } finally {
      restarted.manager.dispose();
    }
  });

  it('falls back to the first available model when the remembered pair is retired', () => {
    new ConversationStore({ home }).writeLastUsedPair({ harness: 'opencode', model: 'retired/model-0' });
    const { manager } = fixture();
    try {
      manager.create('first');
      expect(manager.view().windows[0].pair).toEqual(manager.view().models[0]);
    } finally {
      manager.dispose();
    }
  });

  it('persists every successful selection and leaves the remembered pair unchanged on rejection', () => {
    const { manager, store } = fixture();
    const write = vi.spyOn(store, 'writeLastUsedPair');
    try {
      manager.create('first');
      const models = manager.view().models;
      const initial = models[0];
      const different = models.find((pair) => pair.harness !== initial.harness || pair.model !== initial.model)!;
      expect(different).toBeDefined();
      expect(different).not.toEqual(initial);
      for (const [index, pair] of [initial, different, different].entries()) {
        expect(manager.selectModel('first', pair)).toBe(true);
        expect(write).toHaveBeenCalledTimes(index + 1);
        expect(write).toHaveBeenLastCalledWith(pair);
        expect(new ConversationStore({ home }).readLastUsedPair()).toEqual(pair);
      }
      expect(manager.selectModel('missing', initial)).toBe(false);
      expect(manager.selectModel('first', { harness: 'opencode', model: 'retired/model-0' })).toBe(false);
      expect(write).toHaveBeenCalledTimes(3);
      expect(new ConversationStore({ home }).readLastUsedPair()).toEqual(different);
    } finally {
      manager.dispose();
    }
  });
});
