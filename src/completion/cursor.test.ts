import { describe, it, expect } from 'vitest';
import { readCompletionCursor } from './cursor.js';

describe('readCompletionCursor', () => {
  it('splits the line at the cursor and takes the token after the last space', () => {
    expect(readCompletionCursor('send jan rest', 8)).toEqual({
      before: 'send jan',
      after: ' rest',
      tokenStart: 5,
      token: 'jan',
      preceding: ['send'],
      command: 'send',
      argumentIndex: 1,
    });
  });

  it('treats a tab as a token boundary', () => {
    const cursor = readCompletionCursor('send\tjan', 8);
    expect(cursor.tokenStart).toBe(5);
    expect(cursor.token).toBe('jan');
  });

  it('gives an empty token after a trailing space and counts every preceding word', () => {
    const cursor = readCompletionCursor('connection  close ', 18);
    expect(cursor.token).toBe('');
    expect(cursor.preceding).toEqual(['connection', 'close']);
    expect(cursor.argumentIndex).toBe(2);
  });

  it('lowercases the command word and strips a leading slash', () => {
    expect(readCompletionCursor('/Browser use w', 14).command).toBe('browser');
  });

  it('reports an empty command and argument 0 while the command word is being typed', () => {
    const cursor = readCompletionCursor('bro', 3);
    expect(cursor.preceding).toEqual([]);
    expect(cursor.command).toBe('');
    expect(cursor.argumentIndex).toBe(0);
  });
});
