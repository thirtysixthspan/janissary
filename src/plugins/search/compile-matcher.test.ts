import { describe, expect, it } from 'vitest';
import { compileMatcher } from './compile-matcher.js';

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
