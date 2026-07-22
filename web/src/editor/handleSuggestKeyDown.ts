import type React from 'react';
import type { EditorApi } from './useEditor';
import type { EditorSuggestApi } from './useEditorSuggest';
import { completePersonaName } from './suggest-request';

// Intercepts editor keydowns for the in-editor persona-suggestion surface — pending hunk a/d
// resolution, the Ctrl/Cmd+Enter query trigger, and Tab-completion of a persona name after `>` —
// ahead of the normal key-action pipeline. Returns true once it has handled (and prevented) the
// event, so EditorTab's onKeyDown stops there. Split out to keep EditorTab.tsx under the
// 200-line cap (Decision 12).
export function handleSuggestKeyDown(e: React.KeyboardEvent, api: EditorApi, suggest: EditorSuggestApi): boolean {
  const s = api.stateRef.current;
  if (suggest.pending) {
    e.preventDefault();
    if (s) {
      const key = e.key.toLowerCase();
      if (key === 'a') suggest.acceptFocused(s);
      else if (key === 'd') suggest.declineFocused(s);
    }
    return true;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    if (s) suggest.fireOnLine(s, s.cursor.line);
    return true;
  }
  if (e.key === 'Tab' && s) {
    const completion = completePersonaName(s.lines[s.cursor.line], s.cursor.col, suggest.personas);
    if (completion) {
      e.preventDefault();
      const lineText = s.lines[s.cursor.line];
      const newLine = `${lineText.slice(0, completion.start)}${completion.name} ${lineText.slice(completion.end)}`;
      const lines = [...s.lines];
      lines[s.cursor.line] = newLine;
      const col = completion.start + completion.name.length + 1;
      api.setState({ ...s, lines, cursor: { line: s.cursor.line, col }, anchor: null });
      return true;
    }
  }
  return false;
}
