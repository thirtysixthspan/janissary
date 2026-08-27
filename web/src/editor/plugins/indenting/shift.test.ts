import { describe, expect, it } from 'vitest';
import type { EditorPluginRequest, EditorPluginResult } from '../api';
import { applyPluginResult } from '../apply-edits';
import type { EditorState } from '../../model';
import { shiftLines } from './shift';

function stateOf(text: string): EditorState {
  return { lines: text.split('\n'), cursor: { line: 0, col: 0 }, anchor: null };
}

// Builds the request the host would build for a whole-line selection over `from`..`to`.
function request(text: string, from: number, to: number): EditorPluginRequest {
  const lines = text.split('\n');
  return {
    command: 'indent',
    file: 'a.ts',
    selections: [{ anchor: { line: from, col: 0 }, cursor: { line: to, col: lines[to].length } }],
    range: { start: { line: from, col: 0 }, end: { line: to, col: lines[to].length } },
    lines: lines.slice(from, to + 1),
  };
}

function caretRequest(text: string, line: number, col: number): EditorPluginRequest {
  const lines = text.split('\n');
  return {
    command: 'indent',
    file: 'a.ts',
    selections: [{ anchor: null, cursor: { line, col } }],
    range: { start: { line, col: 0 }, end: { line, col: lines[line].length } },
    lines: [lines[line]],
  };
}

// The transform only ever describes edits, so every assertion runs them through the real applier.
function applied(text: string, result: EditorPluginResult | null): string {
  expect(result).not.toBeNull();
  const outcome = applyPluginResult(stateOf(text), result as EditorPluginResult);
  expect(outcome.ok, outcome.ok ? '' : outcome.reason).toBe(true);
  return outcome.ok ? outcome.state.lines.join('\n') : '';
}

describe('shiftLines', () => {
  it('indents a single line by two spaces and outdents it back', () => {
    const text = 'const a = 1;';
    const indented = applied(text, shiftLines(caretRequest(text, 0, 3), 'indent'));
    expect(indented).toBe('  const a = 1;');
    expect(applied(indented, shiftLines(caretRequest(indented, 0, 5), 'outdent'))).toBe(text);
  });

  it('shifts every line in a range and preserves relative indentation', () => {
    const text = 'a\n  b\n    c';
    expect(applied(text, shiftLines(request(text, 0, 2), 'indent'))).toBe('  a\n    b\n      c');
  });

  it('round-trips a block that started with at least one indent level', () => {
    const text = '  a\n    b\n  c';
    const indented = applied(text, shiftLines(request(text, 0, 2), 'indent'));
    expect(applied(indented, shiftLines(request(indented, 0, 2), 'outdent'))).toBe(text);
  });

  it('removes the one space a line has rather than refusing to move it', () => {
    const text = ' a\n   b';
    expect(applied(text, shiftLines(request(text, 0, 1), 'outdent'))).toBe('a\n b');
  });

  it('leaves a flush-left line alone while its neighbours still shift', () => {
    const text = 'a\n    b';
    expect(applied(text, shiftLines(request(text, 0, 1), 'outdent'))).toBe('a\n  b');
  });

  it('answers null when a range has nothing to outdent', () => {
    const text = 'a\nb';
    expect(shiftLines(request(text, 0, 1), 'outdent')).toBeNull();
  });

  it('leaves blank and whitespace-only lines byte-for-byte unchanged in both directions', () => {
    const text = '  a\n\n    \n  b';
    expect(applied(text, shiftLines(request(text, 0, 3), 'indent'))).toBe('    a\n\n    \n    b');
    expect(applied(text, shiftLines(request(text, 0, 3), 'outdent'))).toBe('a\n\n    \nb');
  });

  it('excludes a blank line from the edits entirely', () => {
    const text = '  a\n\n  b';
    const result = shiftLines(request(text, 0, 2), 'indent');
    expect(result?.edits.map((edit) => edit.start.line)).toEqual([0, 2]);
  });

  it('answers null for a range of only blank lines', () => {
    const text = '\n   \n';
    expect(shiftLines(request(text, 0, 2), 'indent')).toBeNull();
  });

  it('expands each leading tab to two spaces before shifting', () => {
    const text = '\ta\n\t\tb';
    expect(applied(text, shiftLines(request(text, 0, 1), 'indent'))).toBe('    a\n      b');
  });

  it('outdents a tab-indented line by expanding it first', () => {
    const text = '\t\ta';
    expect(applied(text, shiftLines(request(text, 0, 0), 'outdent'))).toBe('  a');
  });

  it('leaves a tab past the first non-whitespace character untouched', () => {
    const text = '  a\tb';
    expect(applied(text, shiftLines(request(text, 0, 0), 'indent'))).toBe('    a\tb');
  });

  it('treats a line of only tabs as blank and skips it', () => {
    const text = '  a\n\t\t\n  b';
    const result = shiftLines(request(text, 0, 2), 'indent');
    expect(result?.edits.map((edit) => edit.start.line)).toEqual([0, 2]);
    expect(applied(text, result)).toBe('    a\n\t\t\n    b');
  });

  it('answers absolute document coordinates offset by the slice base line', () => {
    const text = 'x\ny\n  a\n  b\nz';
    const result = shiftLines(request(text, 2, 3), 'indent');
    const twoLevels = ' '.repeat(4);
    expect(result?.edits).toEqual([
      { start: { line: 2, col: 0 }, end: { line: 2, col: 2 }, text: twoLevels },
      { start: { line: 3, col: 0 }, end: { line: 3, col: 2 }, text: twoLevels },
    ]);
    expect(applied(text, result)).toBe('x\ny\n    a\n    b\nz');
  });
});
