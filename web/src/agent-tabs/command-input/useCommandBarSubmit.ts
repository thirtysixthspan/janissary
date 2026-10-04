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
// runs, and otherwise the line to the server — split out of App.tsx to keep it under the file-size
// limit.
//
// The middle step is not this chain's own. `useAppCommandLine` is the same interception a plugin
// tab's bar runs, so a bare word opens its picker, `nav` opens the tab navigator, and `quit` asks
// first wherever the line was typed.
export function useCommandBarSubmit(params: Params): (text: string) => void {
  const { canSearch, lines, search, runCommand } = params;

  const intercept = useAppCommandLine(params);

  return useCallback((text: string) => {
    const searchPattern = resolveSearchInterception(text, canSearch, lines);
    if (searchPattern !== null) { search.open(searchPattern); return; }
    if (intercept(text)) return;
    runCommand(text);
  }, [canSearch, lines, search, intercept, runCommand]);
}