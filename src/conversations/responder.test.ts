import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpSession, PromptHandlers } from '../acp/types.js';
import { ConversationResponder } from './responder.js';
import type { ConversationSessions } from './sessions.js';
import { CONVERSATION_SCHEMA_VERSION, type Conversation, type ConversationStore } from './store.js';
import { DEFAULT_CONVERSATION_TITLE } from './view.js';

const modelsFor = (harness: string) => (harness === 'claude' ? ['sonnet'] : []);

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    id: 'c1',
    title: DEFAULT_CONVERSATION_TITLE,
    createdAt: 1,
    updatedAt: 5,
    pair: { harness: 'claude', model: 'sonnet' },
    turns: [],
    ...overrides,
  };
}

function setup(sessionFails?: Error) {
  const handlers: PromptHandlers[] = [];
  const session: AcpSession = {
    prompt: (_text, promptHandlers) => { handlers.push(promptHandlers); },
    kill: vi.fn(),
    cancel: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
  };
  const sessions = {
    has: vi.fn(() => false),
    session: vi.fn(() => {
      if (sessionFails) throw sessionFails;
      return session;
    }),
    close: vi.fn(() => true),
    dispose: vi.fn(),
  };
  const store = { ensure: vi.fn(() => '/workspace'), write: vi.fn() };
  const changed = vi.fn();
  const reportStorageError = vi.fn();
  let time = 100;
  const responder = new ConversationResponder(
    store as unknown as ConversationStore,
    sessions as unknown as ConversationSessions,
    () => ++time,
    changed,
    reportStorageError,
    modelsFor,
  );
  return { responder, sessions, store, changed, reportStorageError, handlers };
}

describe('ConversationResponder', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('cancel removes the turn, restores the generated title and updatedAt, and notifies', () => {
    const { responder, sessions, changed } = setup();
    const target = conversation();
    expect(responder.send(target, 'hello there')).toBe(true);
    expect(target.title).toBe('hello there');
    expect(target.turns).toHaveLength(1);
    changed.mockClear();

    expect(responder.cancel('c1')).toBe(true);

    expect(target.turns).toEqual([]);
    expect(target.title).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(target.updatedAt).toBe(5);
    expect([...responder.ids()]).toEqual([]);
    expect(sessions.close).toHaveBeenCalledWith('c1');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('cancel keeps a title the user renamed while the reply streamed', () => {
    const { responder } = setup();
    const target = conversation();
    responder.send(target, 'hello there');
    target.title = 'My rename';

    responder.cancel('c1');

    expect(target.title).toBe('My rename');
  });

  it('cancel leaves an already named conversation titled as it was', () => {
    const { responder } = setup();
    const target = conversation({ title: 'Named' });
    responder.send(target, 'hello');

    responder.cancel('c1');

    expect(target.title).toBe('Named');
  });

  it('cancel closes the session and returns false when nothing is in flight', () => {
    const { responder, sessions, changed } = setup();

    expect(responder.cancel('c1')).toBe(false);

    expect(sessions.close).toHaveBeenCalledWith('c1');
    expect(changed).not.toHaveBeenCalled();
  });

  it('a send whose session fails to start is undone and reported', () => {
    const { responder, sessions, changed, reportStorageError } = setup(new Error('no binary'));
    const target = conversation();

    expect(responder.send(target, 'hello there')).toBe(false);

    expect(target.turns).toEqual([]);
    expect(target.title).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(target.updatedAt).toBe(5);
    expect([...responder.ids()]).toEqual([]);
    expect(sessions.close).toHaveBeenCalledWith('c1');
    expect(reportStorageError).toHaveBeenCalledWith('c1', 'Could not start the response: no binary');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('a failed reply keeps the turn with its error and closes the session', () => {
    const { responder, sessions, store, handlers } = setup();
    const target = conversation();
    responder.send(target, 'hello');

    handlers[0]?.onError('boom');

    expect(target.turns[0]).toMatchObject({ error: 'boom' });
    expect(target.turns[0]?.streaming).toBeUndefined();
    expect(sessions.close).toHaveBeenCalledWith('c1');
    expect(store.write).toHaveBeenCalledWith(target);
    expect([...responder.ids()]).toEqual([]);
  });

  it.each([
    ['complete', (h: PromptHandlers) => { h.onEnd(); }],
    ['fail', (h: PromptHandlers) => { h.onError('boom'); }],
  ])('%s clears the pending stream tick', (_name, finish) => {
    const { responder, changed, handlers } = setup();
    responder.send(conversation(), 'hello');
    const [promptHandlers] = handlers;
    promptHandlers?.onChunk('partial');

    if (promptHandlers) finish(promptHandlers);
    const afterFinish = changed.mock.calls.length;
    vi.advanceTimersByTime(500);

    expect(changed).toHaveBeenCalledTimes(afterFinish);
  });

  it('cancel and dispose clear the pending stream tick', () => {
    const { responder, changed, handlers, sessions } = setup();
    responder.send(conversation(), 'hello');
    handlers[0]?.onChunk('partial');
    responder.cancel('c1');
    changed.mockClear();
    vi.advanceTimersByTime(500);
    expect(changed).not.toHaveBeenCalled();

    responder.send(conversation({ id: 'c2' }), 'again');
    handlers[1]?.onChunk('partial');
    changed.mockClear();
    responder.dispose();
    vi.advanceTimersByTime(500);
    expect(changed).not.toHaveBeenCalled();
    expect([...responder.ids()]).toEqual([]);
    expect(sessions.dispose).toHaveBeenCalled();
  });
});
