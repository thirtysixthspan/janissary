import type { Tab } from '../types.js';
import { stripComments } from './index.js';

// Appends `text` (after stripping shell comments) to `tab`'s command history, deduping an
// immediate repeat and capping at 100 entries, and resets the history-scroll cursor. Returns the
// stripped text for the caller to actually run.
export function recordHistory(tab: Tab | undefined, text: string): string {
  const trimmed = stripComments(text);
  if (tab) {
    if (trimmed && tab.cmdHistory.at(-1) !== trimmed) {
      tab.cmdHistory = [...tab.cmdHistory, trimmed].slice(-100);
    }
    tab.cmdHistoryIdx = -1;
  }
  return trimmed;
}
