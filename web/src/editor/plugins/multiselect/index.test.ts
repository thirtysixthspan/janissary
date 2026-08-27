import { describe, expect, it } from 'vitest';
import type { EditorPluginRequest, EditorPluginResult, EditorSelection } from '../api';
import run from './index';

// The contract allows a handler to answer with a promise; this one never does, so every assertion
// narrows through here rather than awaiting a result that is always already settled.
function select(request: EditorPluginRequest): EditorPluginResult | null {
  const result = run(request);
  expect(result).not.toBeInstanceOf(Promise);
  return result as EditorPluginResult | null;
}

// The request the host builds for a `buffer` binding: the whole document, and the selection set in
// creation order with the primary last.
function request(command: string, text: string, selections: EditorSelection[]): EditorPluginRequest {
  const lines = text.split('\n');
  return {
    command,
    file: 'a.ts',
    selections,
    range: { start: { line: 0, col: 0 }, end: { line: lines.length - 1, col: (lines.at(-1) ?? '').length } },
    lines,
  };
}

const at = (line: number, from: number, to: number): EditorSelection => (
  { anchor: { line, col: from }, cursor: { line, col: to } }
);

const caret = (line: number, col: number): EditorSelection => ({ anchor: null, cursor: { line, col } });

const TEXT = 'foo bar\nfoo baz\nFoo qux';

describe('select-next-occurrence', () => {
  it('adds the next exact occurrence, keeping the one already selected', () => {
    const result = select(request('select-next-occurrence', TEXT, [at(0, 0, 3)]));
    expect(result?.edits).toEqual([]);
    expect(result?.selections).toEqual([at(0, 0, 3), at(1, 0, 3)]);
  });

  it('skips an occurrence that differs in case', () => {
    const result = select(request('select-next-occurrence', TEXT, [at(0, 0, 3), at(1, 0, 3)]));
    // 'Foo' on the last line is not a match, so there is nothing left to add.
    expect(result).toBeNull();
  });

  it('wraps to the top of the buffer', () => {
    const result = select(request('select-next-occurrence', TEXT, [at(1, 0, 3)]));
    expect(result?.selections).toEqual([at(1, 0, 3), at(0, 0, 3)]);
  });

  it('expands a bare caret to the word under it before finding anything', () => {
    const result = select(request('select-next-occurrence', TEXT, [caret(0, 1)]));
    expect(result?.selections).toEqual([at(0, 0, 3)]);
  });

  it('replaces only the primary when expanding a caret alongside other selections', () => {
    const result = select(request('select-next-occurrence', TEXT, [at(0, 0, 3), caret(1, 5)]));
    expect(result?.selections).toEqual([at(0, 0, 3), at(1, 4, 7)]);
  });

  it('does nothing when the caret is on an empty line', () => {
    expect(select(request('select-next-occurrence', 'a\n\nb', [caret(1, 0)]))).toBeNull();
  });

  it('finds the next occurrence of a term that spans lines', () => {
    const text = 'a\nb\nc\na\nb';
    const result = select(request('select-next-occurrence', text, [
      { anchor: { line: 0, col: 0 }, cursor: { line: 1, col: 1 } },
    ]));
    expect(result?.selections?.at(-1)).toEqual({
      anchor: { line: 3, col: 0 },
      cursor: { line: 4, col: 1 },
    });
  });
});

describe('drop-last-selection and collapse-selections', () => {
  it('drops the most recently added selection', () => {
    const result = select(request('drop-last-selection', TEXT, [at(0, 0, 3), at(1, 0, 3)]));
    expect(result?.selections).toEqual([at(0, 0, 3)]);
  });

  it('collapses to the primary, which is the most recently added', () => {
    const result = select(request('collapse-selections', TEXT, [at(0, 0, 3), at(1, 0, 3), at(1, 4, 7)]));
    expect(result?.selections).toEqual([at(1, 4, 7)]);
  });

  it('does nothing to a single selection, so Escape falls through to the editor', () => {
    expect(select(request('drop-last-selection', TEXT, [at(0, 0, 3)]))).toBeNull();
    expect(select(request('collapse-selections', TEXT, [at(0, 0, 3)]))).toBeNull();
  });
});

describe('the multiselect handler', () => {
  it('answers null for a command it does not implement', () => {
    expect(select(request('toggle-comment', TEXT, [at(0, 0, 3)]))).toBeNull();
  });

  it('never edits the buffer', () => {
    const answering: [string, EditorSelection[]][] = [
      ['select-next-occurrence', [at(0, 0, 3)]],
      ['drop-last-selection', [at(0, 0, 3), at(1, 0, 3)]],
      ['collapse-selections', [at(0, 0, 3), at(1, 0, 3)]],
    ];
    for (const [command, selections] of answering) {
      expect(select(request(command, TEXT, selections))?.edits).toEqual([]);
    }
  });
});
