import React from 'react';
import type { PendingSuggest } from './useEditorSuggest';

// The pending in-editor persona-suggestion banner: instructions and a remaining-hunk counter. Every
// unresolved hunk previews inline in the buffer at once, each with its own accept/decline icons
// (see EditorLines.tsx's diff rendering) rather than one focused hunk with keyboard shortcuts.
// Split out of EditorTab.tsx to keep that file under the 200-line cap.
export function PendingSuggestPanel({ pending }: { pending: PendingSuggest | null }) {
  if (!pending) return null;
  const remaining = pending.resolved.filter((r) => !r).length;
  return (
    <div className="editor-suggest-panel">
      <div className="editor-suggest-title">Accept or decline each change below</div>
      <div className="editor-suggest-counter">{remaining} of {pending.hunks.length} remaining</div>
    </div>
  );
}
