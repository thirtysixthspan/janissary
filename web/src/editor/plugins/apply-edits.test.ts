import { describe, expect, it } from 'vitest';
import type { EditorState } from '../model';
import type { EditorPluginResult } from './api';
import { applyPluginResult } from './apply-edits';

function stateOf(text: string): EditorState {
  return { lines: text.split('\n'), cursor: { line: 0, col: 0 }, anchor: null };
}

const insertAt = (line: number, col: number, text: string) => ({
  start: { line, col }, end: { line, col }, text,
});

describe('applyPluginResult — applying', () => {
  it('applies several edits back-to-front with the right final text', () => {
    const state = stateOf('one\ntwo\nthree');
    const result: EditorPluginResult = {
      edits: [insertAt(0, 0, '// '), insertAt(1, 0, '// '), insertAt(2, 0, '// ')],
    };
    const outcome = applyPluginResult(state, result);
    expect(outcome.ok && outcome.state.lines).toEqual(['// one', '// two', '// three']);
  });

  it('applies edits given out of document order', () => {
    const state = stateOf('one\ntwo');
    const outcome = applyPluginResult(state, {
      edits: [insertAt(1, 0, 'B'), insertAt(0, 0, 'A')],
    });
    expect(outcome.ok && outcome.state.lines).toEqual(['Aone', 'Btwo']);
  });

  it('applies an edit spanning several lines', () => {
    const state = stateOf('one\ntwo\nthree');
    const outcome = applyPluginResult(state, {
      edits: [{ start: { line: 0, col: 1 }, end: { line: 2, col: 2 }, text: 'X' }],
    });
    expect(outcome.ok && outcome.state.lines).toEqual(['oXree']);
  });

  it('applies an edit whose text introduces new lines', () => {
    const state = stateOf('ab');
    const outcome = applyPluginResult(state, { edits: [insertAt(0, 1, '\n')] });
    expect(outcome.ok && outcome.state.lines).toEqual(['a', 'b']);
  });

  it('allows two edits that merely touch at a boundary', () => {
    const state = stateOf('abcd');
    const outcome = applyPluginResult(state, {
      edits: [
        { start: { line: 0, col: 0 }, end: { line: 0, col: 2 }, text: 'X' },
        { start: { line: 0, col: 2 }, end: { line: 0, col: 4 }, text: 'Y' },
      ],
    });
    expect(outcome.ok && outcome.state.lines).toEqual(['XY']);
  });

  it('applies a selection-only result with no edits', () => {
    const state = stateOf('one\ntwo');
    const outcome = applyPluginResult(state, {
      edits: [],
      selection: { anchor: { line: 0, col: 0 }, cursor: { line: 1, col: 3 } },
    });
    expect(outcome.ok && outcome.state.lines).toEqual(['one', 'two']);
    expect(outcome.ok && outcome.state.anchor).toEqual({ line: 0, col: 0 });
    expect(outcome.ok && outcome.state.cursor).toEqual({ line: 1, col: 3 });
  });

  it('accepts a selection that only the edited buffer can hold', () => {
    const state = stateOf('a');
    const outcome = applyPluginResult(state, {
      edits: [insertAt(0, 0, '// ')],
      selection: { anchor: null, cursor: { line: 0, col: 4 } },
    });
    expect(outcome.ok && outcome.state.cursor).toEqual({ line: 0, col: 4 });
  });

  it('collapses an anchor equal to the cursor to no selection', () => {
    const state = stateOf('one');
    const outcome = applyPluginResult(state, {
      edits: [],
      selection: { anchor: { line: 0, col: 2 }, cursor: { line: 0, col: 2 } },
    });
    expect(outcome.ok && outcome.state.anchor).toBeNull();
  });
});

describe('applyPluginResult — refusing', () => {
  const original = 'one\ntwo';

  function refuses(result: EditorPluginResult): string {
    const state = stateOf(original);
    const outcome = applyPluginResult(state, result);
    expect(outcome.ok).toBe(false);
    // Nothing is applied, and the state handed in is not mutated on the way out.
    expect(state.lines).toEqual(original.split('\n'));
    return outcome.ok ? '' : outcome.reason;
  }

  it('refuses an edit past the last line', () => {
    expect(refuses({ edits: [insertAt(9, 0, 'x')] })).toContain('outside a 2-line document');
  });

  it('refuses an edit past the end of its line', () => {
    expect(refuses({ edits: [insertAt(0, 99, 'x')] })).toContain('outside a 3-character line');
  });

  it('refuses a negative position', () => {
    expect(refuses({ edits: [insertAt(-1, 0, 'x')] })).toContain('outside a 2-line document');
    expect(refuses({ edits: [insertAt(0, -1, 'x')] })).toContain('outside a 3-character line');
  });

  it('refuses a non-integer position', () => {
    expect(refuses({ edits: [insertAt(0.5, 0, 'x')] })).toContain('not an integer position');
  });

  it('refuses a range that ends before it starts', () => {
    expect(refuses({
      edits: [{ start: { line: 1, col: 0 }, end: { line: 0, col: 0 }, text: 'x' }],
    })).toContain('ends before it starts');
  });

  it('refuses two overlapping edits', () => {
    expect(refuses({
      edits: [
        { start: { line: 0, col: 0 }, end: { line: 0, col: 3 }, text: 'X' },
        { start: { line: 0, col: 1 }, end: { line: 0, col: 3 }, text: 'Y' },
      ],
    })).toContain('overlapping');
  });

  it('refuses a selection the edited buffer cannot hold', () => {
    expect(refuses({
      edits: [],
      selection: { anchor: null, cursor: { line: 5, col: 0 } },
    })).toContain('selection cursor');
  });

  it('refuses an out-of-range anchor', () => {
    expect(refuses({
      edits: [],
      selection: { anchor: { line: 5, col: 0 }, cursor: { line: 0, col: 0 } },
    })).toContain('selection anchor');
  });
});
