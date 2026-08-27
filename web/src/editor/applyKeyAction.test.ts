import { describe, it, expect, vi } from 'vitest';
import type { EditorState } from './model';
import { UndoBuffer } from './undo';
import { applyKeyAction, type EditSurface } from './applyKeyAction';

function makeSurface(initial: EditorState, onSave = vi.fn()): EditSurface & { get: () => EditorState } {
  let state = initial;
  return {
    getState: () => state,
    setState: (s: EditorState) => { state = s; },
    undo: new UndoBuffer(),
    kill: { text: '' },
    onSave,
    get: () => state,
  };
}

const st = (text: string, col = text.length): EditorState => ({ lines: [text], cursor: { line: 0, col }, anchor: null });

describe('applyKeyAction', () => {
  it('save calls surface.onSave without touching state', () => {
    const onSave = vi.fn();
    const surface = makeSurface(st('abc'), onSave);
    applyKeyAction(surface, { kind: 'save' }, 20);
    expect(onSave).toHaveBeenCalled();
    expect(surface.get().lines).toEqual(['abc']);
  });

  it('insert coalesces consecutive typing into one undo step', () => {
    const surface = makeSurface(st(''));
    applyKeyAction(surface, { kind: 'insert', text: 'a' }, 20);
    applyKeyAction(surface, { kind: 'insert', text: 'b' }, 20);
    expect(surface.get().lines).toEqual(['ab']);
    applyKeyAction(surface, { kind: 'undo' }, 20);
    expect(surface.get().lines).toEqual(['']);
  });

  it('selectAll selects the whole document', () => {
    const surface = makeSurface(st('abc', 0));
    applyKeyAction(surface, { kind: 'selectAll' }, 20);
    expect(surface.get().anchor).toEqual({ line: 0, col: 0 });
    expect(surface.get().cursor).toEqual({ line: 0, col: 3 });
  });

  it('copy writes the selection to the clipboard without changing state', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const surface = makeSurface({ lines: ['abc'], cursor: { line: 0, col: 3 }, anchor: { line: 0, col: 0 } });
    applyKeyAction(surface, { kind: 'copy' }, 20);
    expect(writeText).toHaveBeenCalledWith('abc');
    expect(surface.get().lines).toEqual(['abc']);
    vi.unstubAllGlobals();
  });

  it('cut removes the selection and writes it to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const surface = makeSurface({ lines: ['abc'], cursor: { line: 0, col: 3 }, anchor: { line: 0, col: 0 } });
    applyKeyAction(surface, { kind: 'cut' }, 20);
    expect(writeText).toHaveBeenCalledWith('abc');
    expect(surface.get().lines).toEqual(['']);
    vi.unstubAllGlobals();
  });

  it('undo/redo round-trip through the surface undo buffer', () => {
    const surface = makeSurface(st(''));
    applyKeyAction(surface, { kind: 'insert', text: 'x' }, 20);
    applyKeyAction(surface, { kind: 'undo' }, 20);
    expect(surface.get().lines).toEqual(['']);
    applyKeyAction(surface, { kind: 'redo' }, 20);
    expect(surface.get().lines).toEqual(['x']);
  });

  it('move seals the undo coalescing group', () => {
    const surface = makeSurface(st('ab', 0));
    applyKeyAction(surface, { kind: 'move', dir: 'right', extend: false }, 20);
    expect(surface.get().cursor).toEqual({ line: 0, col: 1 });
  });

  it('vertical move uses resolveVertical when it resolves a target', () => {
    const surface = makeSurface({ lines: ['ab', 'cd'], cursor: { line: 0, col: 1 }, anchor: null });
    const resolveVertical = vi.fn().mockReturnValue({ line: 1, col: 0 });
    applyKeyAction(surface, { kind: 'move', dir: 'down', extend: false }, 20, resolveVertical);
    expect(resolveVertical).toHaveBeenCalledWith('down');
    expect(surface.get().cursor).toEqual({ line: 1, col: 0 });
  });

  it('kill records the removed text into the kill buffer for a later yank', () => {
    const surface = makeSurface(st('abc', 0));
    applyKeyAction(surface, { kind: 'kill' }, 20);
    expect(surface.get().lines).toEqual(['']);
    applyKeyAction(surface, { kind: 'yank' }, 20);
    expect(surface.get().lines).toEqual(['abc']);
  });

  it('does nothing when the surface has no state', () => {
    const setState = vi.fn();
    const surface: EditSurface = { getState: () => null, setState, undo: new UndoBuffer(), kill: { text: '' }, onSave: vi.fn() };
    applyKeyAction(surface, { kind: 'selectAll' }, 20);
    expect(setState).not.toHaveBeenCalled();
  });
});

// Three selections over the three `foo`s of 'foo foo foo', the middle one primary-last so the
// creation order the editor keeps is exercised alongside document order.
const threeFoos = (): EditorState => ({
  lines: ['foo foo foo'],
  cursor: { line: 0, col: 11 },
  anchor: { line: 0, col: 8 },
  extraSelections: [
    { anchor: { line: 0, col: 0 }, cursor: { line: 0, col: 3 } },
    { anchor: { line: 0, col: 4 }, cursor: { line: 0, col: 7 } },
  ],
});

describe('applyKeyAction — several selections', () => {
  it('types at every selection as one undo step', () => {
    const surface = makeSurface(threeFoos());
    applyKeyAction(surface, { kind: 'insert', text: 'q' }, 20);
    expect(surface.get().lines).toEqual(['q q q']);
    applyKeyAction(surface, { kind: 'undo' }, 20);
    expect(surface.get().lines).toEqual(['foo foo foo']);
  });

  it('deletes backward at every selection', () => {
    const surface = makeSurface(threeFoos());
    applyKeyAction(surface, { kind: 'deleteBackward' }, 20);
    expect(surface.get().lines).toEqual(['  ']);
  });

  it('deletes forward one character at every bare caret', () => {
    const surface = makeSurface({
      lines: ['abc'],
      cursor: { line: 0, col: 2 },
      anchor: null,
      extraSelections: [{ anchor: null, cursor: { line: 0, col: 0 } }],
    });
    applyKeyAction(surface, { kind: 'deleteForward' }, 20);
    expect(surface.get().lines).toEqual(['b']);
  });

  it('copies every selection joined by newlines, in document order', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    applyKeyAction(makeSurface(threeFoos()), { kind: 'copy' }, 20);
    expect(writeText).toHaveBeenCalledWith('foo\nfoo\nfoo');
    vi.unstubAllGlobals();
  });

  it('cuts every selection, writing the same text it would have copied', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const surface = makeSurface(threeFoos());
    applyKeyAction(surface, { kind: 'cut' }, 20);
    expect(writeText).toHaveBeenCalledWith('foo\nfoo\nfoo');
    expect(surface.get().lines).toEqual(['  ']);
    vi.unstubAllGlobals();
  });

  it('distributes a paste whose line count matches the selection count', () => {
    const surface = makeSurface(threeFoos());
    applyKeyAction(surface, { kind: 'insert', text: 'one\ntwo\nthree' }, 20);
    expect(surface.get().lines).toEqual(['one two three']);
  });

  it('pastes text whose line count does not match into every selection whole', () => {
    const surface = makeSurface(threeFoos());
    applyKeyAction(surface, { kind: 'insert', text: 'x\ny' }, 20);
    expect(surface.get().lines).toEqual(['x', 'y x', 'y x', 'y']);
  });

  it('inserts a line break at every caret rather than distributing Enter', () => {
    const surface = makeSurface({
      lines: ['ab'],
      cursor: { line: 0, col: 2 },
      anchor: null,
      extraSelections: [{ anchor: null, cursor: { line: 0, col: 1 } }],
    });
    applyKeyAction(surface, { kind: 'insert', text: '\n' }, 20);
    expect(surface.get().lines).toEqual(['a', 'b', '']);
  });

  it('moves every caret independently, keeping the set alive', () => {
    const surface = makeSurface(threeFoos());
    // → collapses each selection to its own right edge, exactly as it does for one selection.
    applyKeyAction(surface, { kind: 'move', dir: 'right', extend: false }, 20);
    expect(surface.get().extraSelections).toEqual([
      { anchor: null, cursor: { line: 0, col: 3 }, goalCol: undefined },
      { anchor: null, cursor: { line: 0, col: 7 }, goalCol: undefined },
    ]);
    expect(surface.get().cursor).toEqual({ line: 0, col: 11 });

    applyKeyAction(surface, { kind: 'move', dir: 'right', extend: true }, 20);
    expect(surface.get().extraSelections).toEqual([
      { anchor: { line: 0, col: 3 }, cursor: { line: 0, col: 4 }, goalCol: undefined },
      { anchor: { line: 0, col: 7 }, cursor: { line: 0, col: 8 }, goalCol: undefined },
    ]);
  });

  it('ignores the measured vertical target, which only the primary caret has', () => {
    const surface = makeSurface({
      lines: ['abc', 'def'],
      cursor: { line: 0, col: 2 },
      anchor: null,
      extraSelections: [{ anchor: null, cursor: { line: 0, col: 0 } }],
    });
    const resolveVertical = vi.fn().mockReturnValue({ line: 1, col: 0 });
    applyKeyAction(surface, { kind: 'move', dir: 'down', extend: false }, 20, resolveVertical);
    expect(resolveVertical).not.toHaveBeenCalled();
    expect(surface.get().cursor).toEqual({ line: 1, col: 2 });
    expect(surface.get().extraSelections).toEqual([{ anchor: null, cursor: { line: 1, col: 0 }, goalCol: 0 }]);
  });

  it('collapses the set before saving', () => {
    const onSave = vi.fn();
    const surface = makeSurface(threeFoos(), onSave);
    applyKeyAction(surface, { kind: 'save' }, 20);
    expect(onSave).toHaveBeenCalled();
    expect(surface.get().extraSelections).toBeUndefined();
    expect(surface.get().lines).toEqual(['foo foo foo']);
  });

  it('collapses the set on Escape and on select-all', () => {
    const escaped = makeSurface(threeFoos());
    applyKeyAction(escaped, { kind: 'escape' }, 20);
    expect(escaped.get().extraSelections).toBeUndefined();

    const all = makeSurface(threeFoos());
    applyKeyAction(all, { kind: 'selectAll' }, 20);
    expect(all.get().extraSelections).toBeUndefined();
  });

  it('leaves an empty set behaving exactly as one selection does today', () => {
    const surface = makeSurface({ ...st('abc', 0), extraSelections: [] });
    applyKeyAction(surface, { kind: 'insert', text: 'x' }, 20);
    expect(surface.get().lines).toEqual(['xabc']);
  });
});
