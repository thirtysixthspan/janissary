import type React from 'react';
import type { EditorState } from './model';

// Delegates clicks on the `run` status pill (rendered on the ephemeral agent query line's row by
// render.tsx's EditorLine) up to the shared `.editor-body` container, mirroring how mouse-down
// selection already delegates there. Only one query line can ever be open, so there is no line to
// look up — firing just needs the live buffer to prime the request with (Decision 2).
export function handleSuggestPillClick(
  e: React.MouseEvent,
  state: EditorState | null,
  fireOnLine: (bufferState: EditorState) => void,
): void {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('editor-suggest-pill-run')) return;
  if (state) fireOnLine(state);
}
