import type React from 'react';
import type { EditorApi } from './useEditor';
import type { EditorSuggestApi } from './useEditorSuggest';
import { completePersonaName, suggestPillLabel } from './suggest-request';

// Intercepts editor keydowns for the in-editor persona-suggestion surface — blocking edits while
// any hunk is pending (resolution itself is click-only, via each hunk's accept/decline icons; see
// EditorLines.tsx), the Ctrl/Cmd+Enter query trigger, Tab-completion of a persona name after `>`,
// and Tab/Enter keyboard focus on a runnable status pill — ahead of the normal key-action pipeline.
// Returns true once it has handled (and prevented) the event, so EditorTab's onKeyDown stops
// there. Split out to keep EditorTab.tsx under the 200-line cap (Decision 12).
export function handleSuggestKeyDown(e: React.KeyboardEvent, api: EditorApi, suggest: EditorSuggestApi): boolean {
  if (suggest.pending) {
    e.preventDefault();
    return true;
  }
  const s = api.stateRef.current;
  if (s && suggest.focusedPillLine === s.cursor.line) {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      suggest.setFocusedPillLine(null);
      suggest.fireOnLine(s, s.cursor.line);
      return true;
    }
    if (e.key !== 'Tab') suggest.setFocusedPillLine(null);
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
    // No pending hunk set can reach here — the check at the top of this function already
    // returned for that case — so a pill is never hidden for the pending-review reason.
    const pill = suggestPillLabel(s.lines[s.cursor.line], suggest.personas, suggest.firingLine, null, suggest.noSuggestionLine);
    if (pill?.runnable) {
      e.preventDefault();
      suggest.setFocusedPillLine(s.cursor.line);
      return true;
    }
  }
  return false;
}
