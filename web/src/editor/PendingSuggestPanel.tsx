import React from 'react';
import type { PendingSuggest } from './useEditorSuggest';

// The pending in-editor persona-suggestion banner: instructions and a remaining-hunk counter. Every
// unresolved hunk previews inline in the buffer at once, each with its own accept/decline icons
// (see EditorLines.tsx's diff rendering) rather than one focused hunk with keyboard shortcuts. The
// banner itself is skipped when only one change is proposed — the inline icons are affordance
// enough, and a "1 of 1 remaining" counter added nothing.
// Split out of EditorTab.tsx to keep that file under the 200-line cap.
export function PendingSuggestPanel({ pending }: { pending: PendingSuggest | null }) {
  if (!pending || pending.hunks.length <= 1) return null;
  const remaining = pending.resolved.filter((r) => !r).length;
  return (
    <div className="editor-suggest-panel">
      <div className="editor-suggest-title">Accept or decline each change below</div>
      <div className="editor-suggest-counter">{remaining} of {pending.hunks.length} remaining</div>
    </div>
  );
}
