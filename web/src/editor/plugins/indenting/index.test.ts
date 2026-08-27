import { describe, expect, it } from 'vitest';
import type { EditorPluginRequest, EditorPluginResult } from '../api';
import run from './index';

// The contract allows a handler to answer with a promise; this one never does, so every assertion
// narrows through here rather than awaiting a result that is always already settled.
function shift(request: EditorPluginRequest): EditorPluginResult | null {
  const result = run(request);
  expect(result).not.toBeInstanceOf(Promise);
  return result as EditorPluginResult | null;
}

function request(command: string, text: string, from: number, to: number): EditorPluginRequest {
  const lines = text.split('\n');
  return {
    command,
    file: 'a.ts',
    selection: { anchor: { line: from, col: 0 }, cursor: { line: to, col: lines[to].length } },
    range: { start: { line: from, col: 0 }, end: { line: to, col: lines[to].length } },
    lines: lines.slice(from, to + 1),
  };
}

function caretRequest(command: string, text: string, col: number): EditorPluginRequest {
  return {
    command,
    file: 'a.ts',
    selection: { anchor: null, cursor: { line: 0, col } },
    range: { start: { line: 0, col: 0 }, end: { line: 0, col: text.length } },
    lines: [text],
  };
}

describe('the indenting handler', () => {
  it('dispatches indent to a rightward shift', () => {
    const result = shift(caretRequest('indent', 'a', 1));
    expect(result).toEqual({
      edits: [{ start: { line: 0, col: 0 }, end: { line: 0, col: 0 }, text: '  ' }],
      selection: { anchor: null, cursor: { line: 0, col: 3 } },
    });
  });

  it('dispatches outdent to a leftward shift', () => {
    const result = shift(caretRequest('outdent', '    a', 5));
    expect(result).toEqual({
      edits: [{ start: { line: 0, col: 0 }, end: { line: 0, col: 4 }, text: '  ' }],
      selection: { anchor: null, cursor: { line: 0, col: 3 } },
    });
  });

  it('answers null for a command it does not implement', () => {
    expect(shift(caretRequest('toggle-comment', '  a', 0))).toBeNull();
  });

  it('answers null rather than an empty edit list when nothing can move', () => {
    expect(shift(request('outdent', 'a\nb', 0, 1))).toBeNull();
  });

  it('leaves a range selection covering the same whole lines', () => {
    const result = shift(request('indent', '  a\n  b', 0, 1));
    expect(result?.selection).toEqual({
      anchor: { line: 0, col: 0 },
      cursor: { line: 1, col: 5 },
    });
  });

  it('keeps a bare caret on the same character of its line', () => {
    // The caret sits after `b` at column 3; indenting its line carries it to column 5.
    expect(shift(caretRequest('indent', '  b', 3))?.selection)
      .toEqual({ anchor: null, cursor: { line: 0, col: 5 } });
  });

  it('never moves a bare caret past the start of its outdented line', () => {
    expect(shift(caretRequest('outdent', '  a', 1))?.selection)
      .toEqual({ anchor: null, cursor: { line: 0, col: 0 } });
  });

  it('ignores the file name, so an extension with no comment syntax still indents', () => {
    const result = shift({ ...caretRequest('indent', 'a', 0), file: 'notes.log' });
    expect(result?.edits).toHaveLength(1);
  });
});
