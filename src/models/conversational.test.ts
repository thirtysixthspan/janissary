import { describe, expect, it } from 'vitest';
import { conversationalRecords, isConversationalModel } from './conversational.js';

describe('isConversationalModel', () => {
  it.each([
    'claude-opus-5-5',
    'gpt-6-sol',
    'opencode-go/hy4-flash-free',
    'google/gemini-3.1-flash-lite',
  ])('accepts the conversational id %s', (id) => {
    expect(isConversationalModel(id)).toBe(true);
  });

  it.each([
    'google/gemini-embedding-001',
    'openai/gpt-4o-tts',
    'openai/gpt-4o-transcribe',
    'google/gemini-2.5-flash-live',
    'google/gemini-2.5-flash-image',
    'veo-3.1',
    'google/veo-3',
    'google/lyria-2',
  ])('rejects the non-conversational id %s', (id) => {
    expect(isConversationalModel(id)).toBe(false);
  });
});

describe('conversationalRecords', () => {
  it('drops non-conversational records and keeps the order and names of the rest', () => {
    expect(conversationalRecords([
      { id: 'chat-one', name: 'One' },
      { id: 'google/gemini-embedding-001', name: 'Embedding' },
      { id: 'chat-two' },
      { id: 'openai/gpt-4o-tts' },
    ])).toEqual([
      { id: 'chat-one', name: 'One' },
      { id: 'chat-two' },
    ]);
  });
});
