import type React from 'react';
import type { EditorState } from './model';

// Delegates clicks on the `[run]` status pill (rendered inline at the end of a `>`-led request
// line by render.tsx's EditorLine) up to the shared `.editor-body` container, mirroring how
// mouse-down selection already delegates there — keeps EditorLine a cheap, stable React.memo with
// no per-line click callback prop.
export function handleSuggestPillClick(
  e: React.MouseEvent,
  state: EditorState | null,
  fireOnLine: (state: EditorState, lineIndex: number) => void,
): void {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('editor-suggest-pill-run')) return;
  const row = target.closest<HTMLElement>('[data-editor-line]');
  const lineAttr = row?.dataset.editorLine;
  if (lineAttr !== undefined && state) fireOnLine(state, Number(lineAttr));
}
