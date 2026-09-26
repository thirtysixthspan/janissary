import { useCallback } from 'react';
import type { BufferLine, TabView } from '@shared/protocol';
import type { PickerCommands } from '../../shared/command-bar/picker-commands';
import { closeQuitsApp } from '@shared/tab/placement';
import { resolveSearchInterception } from './command-interceptions';
import { typedCloseIndex } from './close-interception';
import type { useTranscriptSearch } from '../../shared/search-bar/useTranscriptSearch';

// The nine intercepted openers are the shared `PickerCommands` shape rather than a restatement of it:
// this feature and `pickers` both name them, and neither may import the other.
type Params = PickerCommands & {
  canSearch: boolean;
  lines: BufferLine[];
  search: ReturnType<typeof useTranscriptSearch>;
  tabs: TabView[];
  openQuitConfirm: () => void;
  guardRef: React.RefObject<((index: number) => boolean) | null>;
  activeTab: number;
  runCommand: (text: string) => void;
};

// The command bar's `onSubmit` interception chain: several client-side commands (`hist`,
// `syntax theme`, `queue`, `nav`, `quit`/`close`/`exit`) are handled locally instead of reaching
// the server — split out of App.tsx to keep it under the file-size limit. A `close <name>` still
// goes to the server unless the named tab holds unsaved work, which only the client can see.
export function useCommandBarSubmit(params: Params): (text: string) => void {
  const {
    canSearch, lines, search, openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
    navOpen, setNavOpen, openTabNavWithQuery, tabs, openQuitConfirm, guardRef, activeTab, runCommand,
  } = params;

  return useCallback((text: string) => {
    const searchPattern = resolveSearchInterception(text, canSearch, lines);
    if (searchPattern !== null) { search.open(searchPattern); return; }
    const trimmed = text.trim().toLowerCase();
    if (trimmed === 'hist') { openPicker(); return; }
    if (trimmed === 'syntax theme') { openThemePicker(); return; }
    if (trimmed === 'theme') { openAppThemePicker(); return; }
    if (trimmed === 'queue') { openQueue(); return; }
    if (trimmed === 'tasks') { openTaskPicker(); return; }
    if (trimmed === 'profile launch') { openProfilePicker(); return; }
    if (trimmed === 'nav' || trimmed.startsWith('nav ')) {
      if (navOpen) setNavOpen(false);
      else openTabNavWithQuery(text.trim().slice(3).trim());
      return;
    }
    if (trimmed === 'quit' || ((trimmed === 'close' || trimmed === 'exit') && closeQuitsApp(tabs, activeTab))) {
      openQuitConfirm();
      return;
    }
    const closing = typedCloseIndex(text, tabs, activeTab);
    if (closing >= 0 && guardRef.current?.(closing)) return;
    runCommand(text);
  }, [
    canSearch, lines, search, openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
    navOpen, setNavOpen, openTabNavWithQuery, tabs, openQuitConfirm, guardRef, activeTab, runCommand,
  ]);
}
