import { describe, expect, it, vi } from 'vitest';
import type { FileNavigatorRow } from '@shared/protocol';
import { handleTreeChord } from './file-navigator-chords';

const rows: FileNavigatorRow[] = [
  { path: '..', name: '..', depth: 0, dir: true },
  { path: 'src', name: 'src', depth: 0, dir: true, expanded: true },
  { path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false },
];

function makeHandlers() {
  return {
    sendUndo: vi.fn(),
    sendRedo: vi.fn(),
    createNewFile: vi.fn(),
    beginRename: vi.fn(),
    copySelection: vi.fn(),
    cutSelection: vi.fn(),
    paste: vi.fn(),
    selectSiblings: vi.fn(),
  };
}

describe('handleTreeChord', () => {
  it('dispatches undo, and redo when Shift is held', () => {
    const handlers = makeHandlers();
    expect(handleTreeChord('z', false, rows, null, handlers)).toBe(true);
    expect(handlers.sendUndo).toHaveBeenCalled();
    handleTreeChord('Z', true, rows, null, handlers);
    expect(handlers.sendRedo).toHaveBeenCalled();
  });

  it('dispatches new file, copy, cut, and paste', () => {
    const handlers = makeHandlers();
    for (const key of ['n', 'c', 'x', 'v']) {
      expect(handleTreeChord(key, false, rows, null, handlers)).toBe(true);
    }
    expect(handlers.createNewFile).toHaveBeenCalled();
    expect(handlers.copySelection).toHaveBeenCalled();
    expect(handlers.cutSelection).toHaveBeenCalled();
    expect(handlers.paste).toHaveBeenCalled();
  });

  it('renames the selected row, but never the ".." row', () => {
    const handlers = makeHandlers();
    handleTreeChord('r', false, rows, 'src/index.ts', handlers);
    expect(handlers.beginRename).toHaveBeenCalledWith(rows[2]);
    expect(handleTreeChord('r', false, rows, '..', handlers)).toBe(false);
    expect(handlers.beginRename).toHaveBeenCalledTimes(1);
  });

  // Returning true is what makes `useFileNavigatorKeyDown` swallow the chord, so a focused tree
  // takes Cmd/Ctrl+A for itself instead of letting the window open its task picker.
  it('claims Cmd/Ctrl+A for the sibling selection', () => {
    const handlers = makeHandlers();
    expect(handleTreeChord('a', false, rows, 'src/index.ts', handlers)).toBe(true);
    expect(handlers.selectSiblings).toHaveBeenCalled();
  });

  it('leaves every other chord to the window', () => {
    const handlers = makeHandlers();
    expect(handleTreeChord('t', false, rows, 'src', handlers)).toBe(false);
    expect(handleTreeChord('w', true, rows, 'src', handlers)).toBe(false);
  });
});
