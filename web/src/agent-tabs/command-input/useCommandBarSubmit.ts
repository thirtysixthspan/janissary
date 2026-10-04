import { useCallback } from 'react';
import type { BufferLine, TabView } from '@shared/protocol';
import type { PickerCommands } from '../../shared/command-bar/picker-commands';
import { useAppCommandLine } from '../../shared/command-bar/AppCommandBar';
import { resolveSearchInterception } from './command-interceptions';
import type { useTranscriptSearch } from '../../shared/search-bar/useTranscriptSearch';

// The nine intercepted openers are the shared `PickerCommands` shape rather than a restatement of it:
// this feature and `pickers` both name them, and neither may import the other, so they arrive as one
// bag rather than nine arguments.
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

// The command bar's `onSubmit`: a transcript search, then the shared interception every command bar
// runs, then `nav`, and otherwise the line to the server — split out of App.tsx to keep it under the
// file-size limit.
//
// The middle step is not this chain's own. `useAppCommandLine` is the same interception a plugin
// tab's bar runs, so a bare word opens its picker and `quit` asks first wherever the line was typed.
export function useCommandBarSubmit(params: Params): (text: string) => void {
  const {
    canSearch, lines, search,
    navOpen, setNavOpen, openTabNavWithQuery, runCommand,
  } = params;

  const intercept = useAppCommandLine(params);

  return useCallback((text: string) => {
    const searchPattern = resolveSearchInterception(text, canSearch, lines);
    if (searchPattern !== null) { search.open(searchPattern); return; }
    if (intercept(text)) return;
    // `nav` is the one intercepted word the shared classification does not carry: it takes an argument
    // and toggles when already open, so it is a branch here rather than a table row beside the rest.
    const trimmed = text.trim().toLowerCase();
    if (trimmed === 'nav' || trimmed.startsWith('nav ')) {
      if (navOpen) setNavOpen(false);
      else openTabNavWithQuery(text.trim().slice(3).trim());
      return;
    }
    runCommand(text);
  }, [canSearch, lines, search, intercept, navOpen, setNavOpen, openTabNavWithQuery, runCommand]);
}