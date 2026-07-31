import { useRef, type RefObject } from 'react';
import type React from 'react';
import type { FileNavigatorRow } from '@shared/protocol';
import { handleFileNavigatorKey, typeAheadMatch } from './file-navigator-keys';
import { handleTreeChord, type ChordHandlers } from './file-navigator-chords';
import { runFileNavigatorAction } from './file-navigator-actions';
import { clearClipboard, getClipboardSnapshot } from './file-navigator-clipboard';
import type { useFileNavigatorSelection } from './useFileNavigatorSelection';
import type { useFileNavigatorOpener } from './useFileNavigatorOpener';
import type { useFileNavigatorRename } from './useFileNavigatorRename';
import type { useFileNavigatorDelete } from './useFileNavigatorDelete';

const TYPEAHEAD_RESET_MS = 700;
const ROW_HEIGHT_PX = 22;
// Printable, unmodified single characters — used for type-ahead. Excludes space (the action key).
const PRINTABLE = /^[ -~]$/;
const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' ']);

type NavActions = {
  reroot: () => void;
  rerootTo: (path: string) => void;
  toggle: (path: string) => void;
  openFile: (path: string, edit: boolean) => void;
  editFile: (path: string) => void;
};

type Params = {
  rows: FileNavigatorRow[];
  selection: ReturnType<typeof useFileNavigatorSelection>;
  opener: ReturnType<typeof useFileNavigatorOpener>;
  rename: ReturnType<typeof useFileNavigatorRename>;
  deletion: ReturnType<typeof useFileNavigatorDelete>;
  containerRef: RefObject<HTMLDivElement | null>;
  chordHandlers: ChordHandlers;
  actions: NavActions;
};

// The file navigator tree's own `onKeyDown` handler, extracted from `FileNavigatorTab.tsx` so that
// component stays under the file-size limit. Owns the rename-field bypass, the ctrl/meta chord
// dispatch, delete, arrow/paging navigation, and type-ahead.
export function useFileNavigatorKeyDown({
  rows, selection, opener, rename, deletion, containerRef, chordHandlers, actions,
}: Params): (e: React.KeyboardEvent<HTMLDivElement>) => void {
  const typeahead = useRef<{ buffer: string; timer?: ReturnType<typeof setTimeout> }>({ buffer: '' });

  return (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest('.files-rename-input')) return;
    if (opener.onKeyDown(e)) return;
    // While the rename field is open, its own Enter/Escape/typing handling in `InlineEditInput`
    // owns every keystroke; without this, those keydowns bubble here too and get double-handled
    // (e.g. Enter also re-triggering the tree's own "open selected row" navigation action).
    if (rename.editing !== null) return;
    if (e.ctrlKey || e.metaKey) {
      const handled = handleTreeChord(e.key, e.shiftKey, rows, selection.cursor, chordHandlers);
      if (handled) { e.preventDefault(); e.stopPropagation(); }
      return; // tab-management chords go to the window handler
    }
    // Escape clears the whole selection, cursor included, and disarms the clipboard along with it —
    // one key puts the tree back to "nothing chosen, nothing pending". The clipboard is app-wide, so
    // this clears the copy/cut mark in every navigator, not just this one. Only swallowed when
    // there is something to clear; with nothing selected and nothing armed Escape stays the
    // window's to handle.
    if (e.key === 'Escape') {
      const armed = getClipboardSnapshot() !== null;
      if (selection.selected.size === 0 && selection.cursor === null && !armed) return;
      e.preventDefault();
      e.stopPropagation();
      selection.replace(null);
      clearClipboard();
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selection.operationPaths.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      deletion.request(selection.operationPaths);
      return;
    }
    if (NAV_KEYS.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const pageSize = Math.max(1, Math.floor((containerRef.current?.clientHeight ?? ROW_HEIGHT_PX * 10) / ROW_HEIGHT_PX));
      const result = handleFileNavigatorKey(rows, selection.cursor, e.key, e.shiftKey, pageSize);
      selection.replace(result.selection);
      runFileNavigatorAction(result.action, {
        reroot: (path) => { if (path === '..') actions.reroot(); else actions.rerootTo(path); },
        toggle: actions.toggle,
        open: (path) => actions.openFile(path, false),
        edit: actions.editFile,
      });
      return;
    }
    if (PRINTABLE.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const state = typeahead.current;
      clearTimeout(state.timer);
      state.buffer += e.key;
      const match = typeAheadMatch(rows, state.buffer);
      if (match) selection.replace(match);
      state.timer = setTimeout(() => { state.buffer = ''; }, TYPEAHEAD_RESET_MS);
    }
  };
}
