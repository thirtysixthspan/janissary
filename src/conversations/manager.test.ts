import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AcpSession, PromptHandlers } from '../acp/types.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
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
  const managers = { tab: { tabs: [] } } as unknown as Managers;
  let time = 100;
  const manager = new ConversationsManager(managers, {
    store,
    sessions: new ConversationSessions(),
    now: () => ++time,
  });
  return { manager, managers, store };
}

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'conversations-manager-'));
  mocks.connectAcp.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(home, { recursive: true, force: true });
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
});
