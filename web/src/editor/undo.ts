// Undo/redo stacks of EditorState snapshots (lines arrays are shared structurally, so snapshots
// are cheap). Consecutive edits of the same kind within the coalesce window collapse into one
// undo step; a pause, a cursor move (seal()), or a different edit kind starts a new group.

import type { EditorState } from './model';

export type EditKind = 'typing' | 'delete' | 'other';

const COALESCE_MS = 1000;

export class UndoBuffer {
  private undoStack: EditorState[] = [];
  private redoStack: EditorState[] = [];
  private lastKind: EditKind | null = null;
  private lastTime = 0;

  constructor(private readonly cap = 500) {}

  // Record `before` (the state prior to an edit of `kind`) as an undo point. Any new edit
  // invalidates the redo stack.
  record(before: EditorState, kind: EditKind, now = Date.now()): void {
    const coalesce = kind !== 'other' && kind === this.lastKind && now - this.lastTime <= COALESCE_MS;
    if (!coalesce) {
      this.undoStack.push(before);
      if (this.undoStack.length > this.cap) this.undoStack.shift();
    }
    this.lastKind = kind;
    this.lastTime = now;
    this.redoStack = [];
  }

  // Cursor-only movement / selection changes are not undo steps, but they seal the current
  // coalescing group so the next keystroke starts a fresh one.
  seal(): void {
    this.lastKind = null;
  }

  undo(current: EditorState): EditorState | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(current);
    this.lastKind = null;
    return previous;
  }

  redo(current: EditorState): EditorState | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(current);
    this.lastKind = null;
    return next;
  }

  get depth(): number {
    return this.undoStack.length;
  }
}
