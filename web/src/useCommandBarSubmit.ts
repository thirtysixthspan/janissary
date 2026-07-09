import { useCallback } from 'react';
import type { BufferLine, TabView } from '@shared/protocol';
import { resolveSearchInterception } from './command-interceptions';
import type { useTranscriptSearch } from './useTranscriptSearch';

type Params = {
  canSearch: boolean;
  lines: BufferLine[];
  search: ReturnType<typeof useTranscriptSearch>;
  openPicker: () => void;
  openThemePicker: () => void;
  openQueue: () => void;
  openTaskPicker: () => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  openTabNavWithQuery: (query: string) => void;
  tabs: TabView[];
  openQuitConfirm: () => void;
  guardRef: React.RefObject<((index: number) => boolean) | null>;
  activeTab: number;
  runCommand: (text: string) => void;
};

// The command bar's `onSubmit` interception chain: several client-side commands (`hist`,
// `syntax theme`, `queue`, `nav`, `quit`/`close`/`exit`) are handled locally instead of reaching
// the server — split out of App.tsx to keep it under the file-size limit.
export function useCommandBarSubmit(params: Params): (text: string) => void {
  const {
    canSearch, lines, search, openPicker, openThemePicker, openQueue, openTaskPicker,
    navOpen, setNavOpen, openTabNavWithQuery, tabs, openQuitConfirm, guardRef, activeTab, runCommand,
  } = params;

  return useCallback((text: string) => {
    const searchPattern = resolveSearchInterception(text, canSearch, lines);
    if (searchPattern !== null) { search.open(searchPattern); return; }
    const trimmed = text.trim().toLowerCase();
    if (trimmed === 'hist') { openPicker(); return; }
    if (trimmed === 'syntax theme') { openThemePicker(); return; }
    if (trimmed === 'queue') { openQueue(); return; }
    if (trimmed === 'tasks') { openTaskPicker(); return; }
    if (trimmed === 'nav' || trimmed.startsWith('nav ')) {
      if (navOpen) setNavOpen(false);
      else openTabNavWithQuery(text.trim().slice(3).trim());
      return;
    }
    if (trimmed === 'quit' || ((trimmed === 'close' || trimmed === 'exit') && tabs.filter((t) => !t.dock).length === 1)) {
      openQuitConfirm();
      return;
    }
    if ((trimmed === 'close' || trimmed === 'exit') && guardRef.current?.(activeTab)) return;
    runCommand(text);
  }, [
    canSearch, lines, search, openPicker, openThemePicker, openQueue, openTaskPicker,
    navOpen, setNavOpen, openTabNavWithQuery, tabs, openQuitConfirm, guardRef, activeTab, runCommand,
  ]);
}
