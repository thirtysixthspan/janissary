// keydown → symbolic editor action. Pure (takes only the event's key fields) so the whole
// binding table is unit-testable. Special keys (arrows, page, home, end, enter, tab, backspace,
// delete, escape) and printable characters are handled here so preventDefault() supresses the
// browser's native behaviour (including macOS Press-and-Hold) and key-repeat works. Paste
// (Cmd/Ctrl+V) is deliberately not handled — it flows through the hidden textarea's paste event.
// Bindings target macOS conventions: Cmd for app chords, Ctrl free for the Emacs-style subset.

import type { Direction } from './motion';

export type KeyAction =
  | { kind: 'move'; dir: Direction; extend: boolean }
  | { kind: 'page'; dir: -1 | 1; extend: boolean }
  | { kind: 'lineEdge'; edge: 'home' | 'end'; extend: boolean }
  | { kind: 'docEdge'; edge: 'start' | 'end'; extend: boolean }
  | { kind: 'insert'; text: string }
  | { kind: 'deleteBackward' }
  | { kind: 'deleteForward' }
  | { kind: 'kill' }
  | { kind: 'yank' }
  | { kind: 'escape' }
  | { kind: 'save' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'selectAll' }
  | { kind: 'copy' }
  | { kind: 'cut' };

export type KeyLike = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

const ARROW_DIRS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

function metaAction(e: KeyLike): KeyAction | null {
  switch (e.key.toLowerCase()) {
    case 's': { return { kind: 'save' }; }
    case 'z': { return e.shiftKey ? { kind: 'redo' } : { kind: 'undo' }; }
    case 'a': { return { kind: 'selectAll' }; }
    case 'c': { return { kind: 'copy' }; }
    case 'x': { return { kind: 'cut' }; }
    // Cmd+Left/Right = line edges (many Mac keyboards have no Home/End); Cmd+Up/Down = document edges.
    case 'arrowleft': { return { kind: 'lineEdge', edge: 'home', extend: e.shiftKey }; }
    case 'arrowright': { return { kind: 'lineEdge', edge: 'end', extend: e.shiftKey }; }
    case 'arrowup': { return { kind: 'docEdge', edge: 'start', extend: e.shiftKey }; }
    case 'arrowdown': { return { kind: 'docEdge', edge: 'end', extend: e.shiftKey }; }
    // Cmd+V paste is deliberately unhandled: it flows through the hidden textarea's paste event.
    default: { return null; }
  }
}

function ctrlAction(e: KeyLike): KeyAction | null {
  switch (e.key.toLowerCase()) {
    // Emacs-style subset (macOS supports these in every native text field).
    case 'a': { return { kind: 'lineEdge', edge: 'home', extend: e.shiftKey }; }
    case 'e': { return { kind: 'lineEdge', edge: 'end', extend: e.shiftKey }; }
    case 'f': { return { kind: 'move', dir: 'right', extend: e.shiftKey }; }
    case 'b': { return { kind: 'move', dir: 'left', extend: e.shiftKey }; }
    case 'n': { return { kind: 'move', dir: 'down', extend: e.shiftKey }; }
    case 'p': { return { kind: 'move', dir: 'up', extend: e.shiftKey }; }
    case 'd': { return { kind: 'deleteForward' }; }
    case 'k': { return { kind: 'kill' }; }
    case 'y': { return { kind: 'yank' }; }
    case 's': { return { kind: 'save' }; }
    case 'z': { return e.shiftKey ? { kind: 'redo' } : { kind: 'undo' }; }
    case 'home': { return { kind: 'docEdge', edge: 'start', extend: e.shiftKey }; }
    case 'end': { return { kind: 'docEdge', edge: 'end', extend: e.shiftKey }; }
    default: { return null; }
  }
}

function plainAction(e: KeyLike): KeyAction | null {
  const dir = ARROW_DIRS[e.key];
  if (dir) return { kind: 'move', dir, extend: e.shiftKey };
  switch (e.key) {
    case 'PageUp': { return { kind: 'page', dir: -1, extend: e.shiftKey }; }
    case 'PageDown': { return { kind: 'page', dir: 1, extend: e.shiftKey }; }
    case 'Home': { return { kind: 'lineEdge', edge: 'home', extend: e.shiftKey }; }
    case 'End': { return { kind: 'lineEdge', edge: 'end', extend: e.shiftKey }; }
    case 'Enter': { return { kind: 'insert', text: '\n' }; }
    // Tab must insert, never move browser focus out of the editor.
    case 'Tab': { return { kind: 'insert', text: '\t' }; }
    case 'Backspace': { return { kind: 'deleteBackward' }; }
    case 'Delete': { return { kind: 'deleteForward' }; }
    case 'Escape': { return { kind: 'escape' }; }
    default: { return e.key.length === 1 ? { kind: 'insert', text: e.key } : null; }
  }
}

// The action bound to a keydown, or null when the key is not an editor binding (printable
// characters fall through to the hidden textarea).
export function actionForKey(e: KeyLike): KeyAction | null {
  if (e.altKey) return null;
  if (e.metaKey) return metaAction(e);
  if (e.ctrlKey) return ctrlAction(e);
  return plainAction(e);
}
