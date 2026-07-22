import React from 'react';
import type { PendingSuggest } from './useEditorSuggest';

// The pending in-editor persona-suggestion panel: one focused hunk at a time, titled per Decision
// 7 of the plan. Split out of EditorTab.tsx to keep that file under the 200-line cap.
export function PendingSuggestPanel({ pending }: { pending: PendingSuggest | null }) {
  if (!pending) return null;
  const hunk = pending.hunks[pending.index];
  return (
    <div className="editor-suggest-panel">
      <div className="editor-suggest-title">(A)ccept or (D)ecline this change?</div>
      <div className="editor-suggest-counter">{pending.index + 1} of {pending.hunks.length}</div>
      {hunk.anchor && <pre className="editor-suggest-anchor">{hunk.anchor}</pre>}
      <pre className="editor-suggest-replacement">{hunk.replacement}</pre>
    </div>
  );
}
