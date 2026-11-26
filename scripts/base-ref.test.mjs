import { describe, expect, it } from 'vitest';
import { parseBaseRef } from './base-ref.mjs';

describe('parseBaseRef', () => {
  it('takes the ref from a separate argument and keeps the rest in order', () => {
    expect(parseBaseRef(['--seq', '--base', 'origin/master', 'a.ts'])).toEqual({ base: 'origin/master', rest: ['--seq', 'a.ts'], error: undefined });
  });

  it('takes the ref from the --base= form', () => {
    expect(parseBaseRef(['--base=origin/master', '--fix'])).toEqual({ base: 'origin/master', rest: ['--fix'], error: undefined });
  });

  it('leaves the base undefined when the flag is absent', () => {
    expect(parseBaseRef(['--fix', 'a.ts'])).toEqual({ base: undefined, rest: ['--fix', 'a.ts'], error: undefined });
  });

  it('reports an error when --base has no ref', () => {
    expect(parseBaseRef(['--base']).error).toBe('--base needs a git ref');
    expect(parseBaseRef(['--base', '--seq']).error).toBe('--base needs a git ref');
    expect(parseBaseRef(['--base=']).error).toBe('--base needs a git ref');
  });
});
