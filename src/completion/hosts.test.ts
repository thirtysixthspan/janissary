import { describe, it, expect } from 'vitest';
import { readCompletionCursor } from './cursor.js';
import { completeSavedHost, isSavedHostSlot } from './hosts.js';

const complete = (input: string, names: string[], at = input.length) =>
  completeSavedHost(readCompletionCursor(input, at), names);

describe('completeSavedHost', () => {
  it('offers names at all five slots with an empty or a partial token', () => {
    for (const line of ['ssh ', 'shell on ', 'harness claude on ', 'agent on ', 'hosts remove ']) {
      expect(complete(line, ['lab'])?.newInput).toBe(`${line}lab `);
      expect(complete(`${line}la`, ['lab'])?.newInput).toBe(`${line}lab `);
    }
  });

  it('matches the subcommand case-insensitively', () => {
    expect(complete('HOSTS REMOVE la', ['lab'])?.newInput).toBe('HOSTS REMOVE lab ');
  });

  it('inserts the stored spelling of a unique mixed-case match', () => {
    expect(complete('ssh LAB', ['Lab'])).toEqual({ newInput: 'ssh Lab ', newCursor: 8, matches: ['Lab'] });
  });

  it('extends the typed prefix using the folded common prefix for multiple matches', () => {
    expect(complete('ssh la', ['Lab', 'Labs'])).toEqual({
      newInput: 'ssh lab', newCursor: 7, matches: ['Lab', 'Labs'],
    });
    expect(complete('ssh LA', ['Lab', 'Labs'])?.newInput).toBe('ssh LAb');
    expect(complete('ssh la', ['LAB', 'other'])?.newInput).toBe('ssh LAB ');
  });

  it('accepts a hyphen-prefixed name from a bare hyphen prefix', () => {
    expect(complete('ssh -d', ['-dev'])?.newInput).toBe('ssh -dev ');
    expect(complete('ssh -', ['-dev', '-prod'])?.matches).toEqual(['-dev', '-prod']);
  });

  it('keeps text after the cursor and omits the appended space when whitespace follows', () => {
    expect(complete('shell on la in group eng', ['lab'], 11)).toEqual({
      newInput: 'shell on lab in group eng', newCursor: 12, matches: ['lab'],
    });
    expect(complete('harness claude on la with build the app', ['lab'], 20)?.newInput)
      .toBe('harness claude on lab with build the app');
    expect(complete('agent on la execute task.md --flag', ['lab'], 11)?.newInput)
      .toBe('agent on lab execute task.md --flag');
  });

  it('leaves qualified addresses to the existing completion chain', () => {
    expect(complete('ssh user@ho', ['lab'])).toBeNull();
    expect(complete('ssh host:pa', ['lab'])).toBeNull();
    expect(complete('shell on user@host', ['lab'])).toBeNull();
    expect(complete('harness claude on host:path', ['lab'])).toBeNull();
  });

  it('leaves unrelated or constrained positions to the existing completion chain', () => {
    for (const [input, at] of [
      ['cat la', undefined],
      ['ssh -p 2222 la', undefined],
      ['ssh lab uname', 7],
      ['shell on la in group eng', undefined],
      ['harness capture la', undefined],
      ['harness transcript la', undefined],
      ['harness claude on la with build the app', undefined],
      ['agent on la execute task.md', undefined],
      ['agent on la execute task.md --flag', undefined],
      ['ssh "la', undefined],
      ['shell "my tab on la', undefined],
    ] as const) {
      expect(complete(input, ['lab'], at)).toBeNull();
    }
  });

  it('does not complete a cursor partway through a token', () => {
    expect(complete('ssh lab', ['lab'], 6)).toBeNull();
  });

  it('returns null when no saved name matches so the filesystem fallback remains', () => {
    expect(complete('ssh la', [])).toBeNull();
    expect(complete('ssh la', ['other'])).toBeNull();
  });

  it('exposes the slot predicate for callers that resolve names lazily', () => {
    expect(isSavedHostSlot(readCompletionCursor('ssh la', 6))).toBe(true);
    expect(isSavedHostSlot(readCompletionCursor('shell on la', 11))).toBe(true);
    expect(isSavedHostSlot(readCompletionCursor('cat la', 6))).toBe(false);
  });
});
