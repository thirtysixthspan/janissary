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
