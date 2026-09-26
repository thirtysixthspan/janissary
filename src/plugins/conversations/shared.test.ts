import { describe, expect, it } from 'vitest';
import { isConversationsPayload, type ConversationTabPayload } from './shared.js';

const conversation: ConversationTabPayload = {
  kind: 'conversation',
  conversation: {
    id: 'first', title: 'New conversation', turns: [], hasOlder: false,
    pair: { harness: 'claude', model: 'claude-sonnet' },
  },
  models: [{ harness: 'claude', model: 'claude-sonnet' }],
};

describe('conversation draft payload validation', () => {
  it('accepts a conversation without an initial draft', () => {
    expect(isConversationsPayload(conversation)).toBe(true);
  });

  it.each([undefined, '', 'selected text', 'first line\nsecond line'])('accepts draft %j', (draftQuery) => {
    expect(isConversationsPayload({ ...conversation, draftQuery })).toBe(true);
  });

  it.each([null, [], {}, 42, false])('rejects malformed draft %j', (draftQuery) => {
    expect(isConversationsPayload({ ...conversation, draftQuery })).toBe(false);
  });

  it('preserves list validation', () => {
    expect(isConversationsPayload({ kind: 'list', entries: [] })).toBe(true);
    expect(isConversationsPayload({
      kind: 'list', entries: [{ id: 'first', title: 'First', updatedAt: 1 }],
    })).toBe(true);
    expect(isConversationsPayload({ kind: 'list', entries: [{ id: 'first' }] })).toBe(false);
  });
});

// Both of these arrive from whatever the client sent, so a payload that is not a record at all — or
// a turn inside one that is not — has to be refused before anything reads a field off it.
describe('conversation payload validation against a malformed shape', () => {
  it.each([undefined, null, 'conversation', 42, [], true])('rejects %j, which is not a record', (value) => {
    expect(isConversationsPayload(value)).toBe(false);
  });

  it.each([undefined, 'a turn', 7, [], null])('rejects a %j turn inside a valid conversation', (turn) => {
    const withTurn = {
      ...conversation,
      conversation: {
        ...conversation.conversation,
        turns: [{ query: 'q', response: 'r', pair: { harness: 'claude', model: 'claude-sonnet' } }, turn],
      },
    };
    expect(isConversationsPayload(withTurn)).toBe(false);
  });

  it('rejects a conversation whose window is not a record', () => {
    expect(isConversationsPayload({ ...conversation, conversation: 'first' })).toBe(false);
  });
});
