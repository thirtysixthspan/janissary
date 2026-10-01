import { useCallback } from 'react';
import type { BufferLine, TabView } from '@shared/protocol';
import type { PickerCommands } from '../../shared/command-bar/picker-commands';
import { closeQuitsApp } from '@shared/tab/placement';
import { openOverlayForCommand } from '../../shared/contributed-overlays';
import { resolveSearchInterception } from './command-interceptions';
import { typedCloseIndex } from './close-interception';
import type { useTranscriptSearch } from '../../shared/search-bar/useTranscriptSearch';

// The nine intercepted openers are the shared `PickerCommands` shape rather than a restatement of it:
// this feature and `pickers` both name them, and neither may import the other, so they arrive as one
// bag rather than nine arguments. A command word a plugin claims is a tenth kind, reached through the
// shared overlay seam rather than named here, so adding a plugin's command adds no line to this chain.
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

// The bare-word openers, keyed by command word. A table rather than six branches: the chain below sits
// at this file's cognitive-complexity limit, and adding a seventh entry to a list is cheaper than
// adding a seventh branch to it. `nav` is not among them — it carries an argument and toggles when
// already open, which is a branch of its own rather than a bare word.
type BareOpeners = Pick<PickerCommands, 'openPicker' | 'openThemePicker' | 'openAppThemePicker' | 'openQueue' | 'openTaskPicker' | 'openProfilePicker'>;

const BARE_OPENERS = {
  hist: 'openPicker',
  'syntax theme': 'openThemePicker',
  theme: 'openAppThemePicker',
  queue: 'openQueue',
  tasks: 'openTaskPicker',
  'profile launch': 'openProfilePicker',
} as const satisfies Record<string, keyof PickerCommands>;

// Opens the overlay a bare command word names, or reports that the word names none.
function openBareOverlay(trimmed: string, pickers: BareOpeners): boolean {
  const name = BARE_OPENERS[trimmed as keyof typeof BARE_OPENERS];
  if (!name) return false;
  pickers[name]();
  return true;
}

// Opens the overlay a plugin claims this command word for, loading its chunk on the way. False means
// no plugin claims it and the chain carries on to the next check.
function openClaimedOverlay(command: string): boolean {
  return openOverlayForCommand(command, null);
}

// The command bar's `onSubmit` interception chain: several client-side commands (`hist`,
// `syntax theme`, `queue`, `nav`, `quit`/`close`/`exit`) are handled locally instead of reaching
// the server — split out of App.tsx to keep it under the file-size limit. A `close <name>` still
// goes to the server unless the named tab holds unsaved work, which only the client can see.
//
// The nine overlay openers stay the bag they arrive as, so a sixth bare word costs one table row
// rather than a sixth branch through a callback already at its cognitive-complexity limit.
export function useCommandBarSubmit(params: Params): (text: string) => void {
  const {
    canSearch, lines, search,
    navOpen, setNavOpen, openTabNavWithQuery, tabs, openQuitConfirm, guardRef, activeTab, runCommand,
    ...pickers
  } = params;

  return useCallback((text: string) => {
    const searchPattern = resolveSearchInterception(text, canSearch, lines);
    if (searchPattern !== null) { search.open(searchPattern); return; }
    const trimmed = text.trim().toLowerCase();
    if (openBareOverlay(trimmed, pickers)) return;
    // A plugin may claim a command word of its own, and `clip` is the first. Resolved through the
    // shared overlay seam rather than named here, so adding a plugin's command adds no line to this
    // chain — the same reason the six above live in a table.
    if (openClaimedOverlay(trimmed)) return;
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
    canSearch, lines, search, pickers,
    navOpen, setNavOpen, openTabNavWithQuery, tabs, openQuitConfirm, guardRef, activeTab, runCommand,
  ]);
}
