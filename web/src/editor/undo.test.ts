import { describe, it, expect } from 'vitest';
import { UndoBuffer } from './undo';
import type { EditorState } from './model';

const snap = (text: string, col = 0): EditorState => ({ lines: [text], cursor: { line: 0, col }, anchor: null });

describe('UndoBuffer', () => {
  it('coalesces consecutive typing into one undo step', () => {
    const buffer = new UndoBuffer();
    buffer.record(snap('', 0), 'typing', 1000);
    buffer.record(snap('a', 1), 'typing', 1100);
    buffer.record(snap('ab', 2), 'typing', 1200);
    const restored = buffer.undo(snap('abc', 3));
    expect(restored?.lines).toEqual(['']);
    expect(buffer.undo(snap('', 0))).toBeNull();
  });

  it('a pause breaks the coalescing group', () => {
    const buffer = new UndoBuffer();
    buffer.record(snap('', 0), 'typing', 1000);
    buffer.record(snap('a', 1), 'typing', 5000);
    expect(buffer.undo(snap('ab', 2))?.lines).toEqual(['a']);
    expect(buffer.undo(snap('a', 1))?.lines).toEqual(['']);
  });

  it('a different edit kind breaks the group', () => {
    const buffer = new UndoBuffer();
    buffer.record(snap('ab', 2), 'typing', 1000);
    buffer.record(snap('abc', 3), 'delete', 1100);
    expect(buffer.depth).toBe(2);
  });

  it('seal() ends the group so the next keystroke starts fresh', () => {
    const buffer = new UndoBuffer();
    buffer.record(snap('', 0), 'typing', 1000);
    buffer.seal();
    buffer.record(snap('a', 1), 'typing', 1100);
    expect(buffer.depth).toBe(2);
  });

  it("'other' edits never coalesce", () => {
    const buffer = new UndoBuffer();
    buffer.record(snap('a', 1), 'other', 1000);
    buffer.record(snap('b', 1), 'other', 1100);
    expect(buffer.depth).toBe(2);
  });

  it('redo replays an undone state; a new edit clears the redo stack', () => {
    const buffer = new UndoBuffer();
    buffer.record(snap('', 0), 'other', 1000);
    const current = snap('x', 1);
    const previous = buffer.undo(current)!;
    expect(buffer.redo(previous)?.lines).toEqual(['x']);
    buffer.undo(current);
    buffer.record(snap('y', 1), 'other', 2000);
    expect(buffer.redo(snap('y', 1))).toBeNull();
  });

  it('snapshots restore the cursor position', () => {
    const buffer = new UndoBuffer();
    buffer.record(snap('hello', 5), 'other', 1000);
    expect(buffer.undo(snap('hello!', 6))?.cursor).toEqual({ line: 0, col: 5 });
  });

  it('caps the undo stack', () => {
    const buffer = new UndoBuffer(3);
    for (let index = 0; index < 10; index++) buffer.record(snap(String(index), 0), 'other', index * 5000);
    expect(buffer.depth).toBe(3);
  });
});
