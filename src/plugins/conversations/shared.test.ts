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
