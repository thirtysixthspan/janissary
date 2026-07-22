import React from 'react';
import type { PendingSuggest } from './useEditorSuggest';

// The pending in-editor persona-suggestion banner: accept/decline instructions and a counter for
// the focused hunk (per Decision 7 of the original plan). The change itself previews inline in the
// buffer (see EditorLines.tsx's diff rendering) rather than as text here. Split out of
// EditorTab.tsx to keep that file under the 200-line cap.
export function PendingSuggestPanel({ pending }: { pending: PendingSuggest | null }) {
  if (!pending) return null;
  return (
    <div className="editor-suggest-panel">
      <div className="editor-suggest-title">(A)ccept or (D)ecline this change?</div>
      <div className="editor-suggest-counter">{pending.index + 1} of {pending.hunks.length}</div>
    </div>
  );
}
