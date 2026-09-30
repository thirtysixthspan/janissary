import { describe, expect, it } from 'vitest';
import { compileMatcher, patternError } from './compile-matcher.js';

const off = { regex: false, matchCase: false, wholeWord: false };

function matches(query: string, line: string, modes = off): boolean {
  return compileMatcher(query, modes)?.test(line) ?? false;
}

describe('compileMatcher', () => {
  it('matches a plain-text query literally', () => {
    expect(matches('todo', '  // todo: fix')).toBe(true);
    expect(matches('a.c', 'abc')).toBe(false);
    expect(matches('a.c', 'a.c')).toBe(true);
  });

  it('escapes every regex metacharacter in a plain-text query', () => {
    for (const query of ['a.c', 'a*', 'a+b', 'foo(bar)', '[x]', 'a|b', '^start', 'end$', String.raw`a\b`]) {
      expect(matches(query, `say ${query} now`)).toBe(true);
    }
  });

  it('is case-insensitive by default and case-sensitive on request', () => {
    expect(matches('todo', 'TODO fix')).toBe(true);
    expect(matches('todo', 'TODO fix', { ...off, matchCase: true })).toBe(false);
    expect(matches('todo', 'todo fix', { ...off, matchCase: true })).toBe(true);
  });

  it('reads a regex query as a regular expression', () => {
    const modes = { ...off, regex: true };
    expect(matches('to+do', 'toodo', modes)).toBe(true);
    expect(matches('td', 'toodo', modes)).toBe(false);
    expect(matches('^import', 'import x', modes)).toBe(true);
    expect(matches('^import', '  import x', modes)).toBe(false);
  });

  it('returns null for a regex that will not compile rather than throwing', () => {
    expect(compileMatcher('[unclosed', { ...off, regex: true })).toBeNull();
    expect(compileMatcher('(', { ...off, regex: true })).toBeNull();
  });

  it('refuses an empty query', () => {
    expect(compileMatcher('', off)).toBeNull();
    expect(compileMatcher('', { ...off, regex: true })).toBeNull();
  });

  it('refuses a pattern that can match the empty string', () => {
    expect(compileMatcher('.*', { ...off, regex: true })).toBeNull();
    expect(compileMatcher('a*', { ...off, regex: true })).toBeNull();
  });

  it('bounds a plain-text whole-word match on both sides', () => {
    const modes = { ...off, wholeWord: true };
    expect(matches('cat', 'the cat sat', modes)).toBe(true);
    expect(matches('cat', 'concatenate', modes)).toBe(false);
    expect(matches('cat', 'cats', modes)).toBe(false);
    expect(matches('cat', 'cat.', modes)).toBe(true);
    expect(matches('cat', '(cat)', modes)).toBe(true);
  });

  it('treats an underscore as part of a word', () => {
    expect(matches('cat', 'my_cat_name', { ...off, wholeWord: true })).toBe(false);
  });

  it('bounds a whole-word match at the start and end of a line', () => {
    const modes = { ...off, wholeWord: true };
    expect(matches('todo', 'todo', modes)).toBe(true);
    expect(matches('todo', 'todo:', modes)).toBe(true);
  });

  it('composes whole word with a regex query', () => {
    const modes = { ...off, regex: true, wholeWord: true };
    expect(matches('to+do', 'a toodo b', modes)).toBe(true);
    expect(matches('to+do', 'atoodo', modes)).toBe(false);
  });

  it('composes whole word with case sensitivity', () => {
    const modes = { ...off, wholeWord: true, matchCase: true };
    expect(matches('cat', 'the CAT sat', modes)).toBe(false);
    expect(matches('cat', 'the cat sat', modes)).toBe(true);
    expect(matches('cat', 'the Cat sat', modes)).toBe(false);
  });

  it('refuses a whole-word query whose pattern will not compile', () => {
    expect(compileMatcher('[unclosed', { ...off, regex: true, wholeWord: true })).toBeNull();
  });
});

describe('Matcher.locate', () => {
  const locate = (query: string, line: string, modes = off) => compileMatcher(query, modes)?.locate(line);

  it('locates the first occurrence of a plain-text query', () => {
    expect(locate('todo', '  // todo: todo')).toEqual({ start: 5, end: 9 });
  });

  it('locates a case-insensitive match in the case the line has', () => {
    expect(locate('todo', 'x TODO')).toEqual({ start: 2, end: 6 });
  });

  it('spans the text a regex actually matched', () => {
    expect(locate('to+do', 'a toooodo b', { ...off, regex: true })).toEqual({ start: 2, end: 9 });
  });

  it('spans the word itself under whole word, not the boundary around it', () => {
    expect(locate('cat', 'concatenate, the cat', { ...off, wholeWord: true })).toEqual({ start: 17, end: 20 });
  });

  it('finds nothing on a line the matcher does not accept', () => {
    const matcher = compileMatcher('cat', { ...off, wholeWord: true })!;
    for (const line of ['concatenate', 'cats', 'dog', '']) {
      expect(matcher.test(line)).toBe(false);
      expect(matcher.locate(line)).toBeNull();
    }
  });
});

describe('patternError', () => {
  it('answers the engine\'s message for a regex that will not compile', () => {
    expect(patternError('[unclosed', { ...off, regex: true })).toMatch(/Invalid regular expression: \/\[unclosed\//);
  });

  it('names the user\'s own pattern in whole-word mode, not the wrapper around it', () => {
    const message = patternError('[unclosed', { ...off, regex: true, wholeWord: true }) ?? '';
    expect(message).toContain('/[unclosed/');
    expect(message).not.toContain('(?<!');
  });

  it('answers null for plain text, a valid regex, and an empty query', () => {
    expect(patternError('[unclosed', off)).toBeNull();
    expect(patternError('to+do', { ...off, regex: true })).toBeNull();
    expect(patternError('', { ...off, regex: true })).toBeNull();
  });
});
