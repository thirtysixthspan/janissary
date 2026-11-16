import { describe, expect, it } from 'vitest';
import { applyHunks } from './hunks.js';
import type { PatchHunk, PatchHunkLine } from './parse-hunks.js';

const context = (text: string): PatchHunkLine => ({ kind: 'context', text });
const remove = (text: string): PatchHunkLine => ({ kind: 'remove', text });
const add = (text: string): PatchHunkLine => ({ kind: 'add', text });
const hunk = (lines: PatchHunkLine[], options: Partial<PatchHunk> = {}): PatchHunk => ({
  lines, endOfFile: false, ...options,
});
const success = (text: string) => ({ ok: true, text });
const failure = (line: string) => ({ ok: false, line });

describe('applyHunks', () => {
  it('replaces a matching line and preserves the final newline state', () => {
    const edit = [hunk([remove('one'), add('two')])];
    expect(applyHunks('one\n', edit)).toEqual(success('two\n'));
    expect(applyHunks('one', edit)).toEqual(success('two'));
  });

  it('matches trailing whitespace in both directions and retains file context', () => {
    expect(applyHunks('one \t\ntwo\n', [hunk([context('one'), remove('two  '), add('new')])]))
      .toEqual(success('one \t\nnew\n'));
    expect(applyHunks('one\n', [hunk([remove('one \t'), add('new')])])).toEqual(success('new\n'));
  });

  it('prefers an exact match anywhere in the remaining range', () => {
    expect(applyHunks('one \none\n', [hunk([remove('one'), add('new')])])).toEqual(success('one \nnew\n'));
  });

  it('reports the first old line exactly on failure', () => {
    expect(applyHunks('other', [hunk([context('  missing \t'), remove('x')])])).toEqual(failure('  missing \t'));
    expect(applyHunks('other', [hunk([remove('missing')])])).toEqual(failure('missing'));
  });

  it('searches sequentially and applies repeated blocks in order', () => {
    const edits = [hunk([remove('x'), add('a')]), hunk([remove('x'), add('b')])];
    expect(applyHunks('x\ny\nx\n', edits)).toEqual(success('a\ny\nb\n'));
    expect(applyHunks('x\ny\n', [hunk([remove('y')]), hunk([remove('x')])])).toEqual(failure('x'));
  });

  it('finds anchors before searching the block and reports the appropriate failure', () => {
    const edit = hunk([remove('x'), add('y')], { anchor: 'anchor' });
    expect(applyHunks('x\nanchor\nx\n', [edit])).toEqual(success('x\nanchor\ny\n'));
    expect(applyHunks('x\n', [edit])).toEqual(failure('anchor'));
    expect(applyHunks('anchor\n', [edit])).toEqual(failure('x'));
    expect(applyHunks('anchor \nanchor\nx\n', [edit])).toEqual(success('anchor \nanchor\ny\n'));
  });

  it('requires end-of-file blocks to end at the last line after the position', () => {
    const end = hunk([remove('x'), add('y')], { endOfFile: true });
    expect(applyHunks('x\nx\n', [end])).toEqual(success('x\ny\n'));
    expect(applyHunks('x\nz\n', [end])).toEqual(failure('x'));
    expect(applyHunks('x\nz\n', [hunk([context('z')]), end])).toEqual(failure('x'));
  });

  it('inserts at the current position, after an anchor, or at the end', () => {
    expect(applyHunks('a\nb\n', [hunk([add('x')])])).toEqual(success('x\na\nb\n'));
    expect(applyHunks('a\nb\n', [hunk([add('x')], { anchor: 'a' })])).toEqual(success('a\nx\nb\n'));
    expect(applyHunks('a', [hunk([add('x')], { endOfFile: true })])).toEqual(success('a\nx'));
  });

  it('preserves insertion order and never searches inserted text', () => {
    expect(applyHunks('a\n', [hunk([add('x')]), hunk([add('y')])])).toEqual(success('x\ny\na\n'));
    expect(applyHunks('a\n', [hunk([add('x')]), hunk([remove('x')])])).toEqual(failure('x'));
  });

  it('preserves the chosen line ending and handles mixed endings', () => {
    const edit = [hunk([remove('two'), add('three')])];
    expect(applyHunks('one\r\ntwo\r\n', edit)).toEqual(success('one\r\nthree\r\n'));
    expect(applyHunks('one\r\ntwo\n', edit)).toEqual(success('one\r\nthree\r\n'));
    expect(applyHunks('one\ntwo\r\n', [hunk([context('two'), add('three')])]))
      .toEqual(success('one\ntwo\r\nthree\n'));
    expect(applyHunks('', [hunk([add('new')])])).toEqual(success('new\n'));
  });

  it('handles zero lines, an empty line, and an unchanged input', () => {
    expect(applyHunks('a\n', [hunk([remove('a')])])).toEqual(success(''));
    expect(applyHunks('\n', [hunk([remove(''), add('x')])])).toEqual(success('x\n'));
    expect(applyHunks('a\r\nb\n', [])).toEqual(success('a\r\nb\n'));
  });
});
