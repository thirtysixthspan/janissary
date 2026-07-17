import type { TabView, BufferLine } from '@shared/protocol';
import { useTranscriptSearch } from './useTranscriptSearch';

const VIEW_TAB_KINDS = ['image', 'page', 'harness', 'markdown', 'editor', 'files', 'notifications', 'schedules'] as const;

// Whether the active tab is a view tab (no transcript/search) and the transcript search state
// derived from it. Split out of App.tsx to keep it under the file-size limit.
export function useViewSearchState(current: TabView | undefined, lines: BufferLine[]) {
  const isViewTab = VIEW_TAB_KINDS.includes(current?.view as (typeof VIEW_TAB_KINDS)[number]);
  const canSearch = !isViewTab && !current?.activePty;
  const search = useTranscriptSearch(lines, current?.label ?? '');
  const highlight = search.searchOpen && search.currentLineIndex !== null
    ? { lineIndex: search.currentLineIndex, pattern: search.pattern }
    : null;
  return { isViewTab, canSearch, search, highlight };
}
