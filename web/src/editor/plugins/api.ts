// The editor-plugin contract. An editor plugin binds a keyboard chord in the editor tab and answers
// with the edits to make and where to leave the selections — that is the whole extension point. It
// runs entirely in the client: declarations are static data in ./registry.ts and implementations are
// lazily imported modules, so nothing about an editor plugin reaches the server.

import { selectionBounds as hostSelectionBounds, textIn as hostTextIn, wordRangeAt as hostWordRangeAt, type Pos } from '../model';
import { offsetToPos as hostOffsetToPos, posToOffset as hostPosToOffset } from '../offsets';

// A document position, published here so a plugin takes its coordinate vocabulary from the contract
// rather than from the editor's own model.
export type { Pos } from '../model';

// Version 2 replaced the single `selection` on a request and a result with the whole selection set,
// so a command can create, drop, or collapse carets rather than only move one.
export const EDITOR_PLUGIN_API_VERSION = 2;

// A chord is only ever matched against a keydown the core editor table left unbound (see
// ./chords.ts), so `key` is the raw `KeyboardEvent.key` and every modifier defaults to "must be up".
export type EditorChord = {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
};

// How much of the buffer a binding's handler is given. `selection` passes the whole lines the
// selection covers (the caret's line when nothing is selected); `buffer` passes the whole document.
// Declared rather than inferred so a reader can see a plugin's reach from its declaration alone.
export type EditorPluginSlice = 'selection' | 'buffer';

export type EditorPluginBinding = {
  command: string;
  chord: EditorChord;
  needs: EditorPluginSlice;
};

export type EditorPluginDeclaration = {
  id: string;
  version: string;
  apiVersion: number;
  bindings: readonly EditorPluginBinding[];
};

// One binding paired with the plugin that declared it, which is what chord matching resolves to.
export type BoundBinding = EditorPluginBinding & { plugin: string };

export type EditorRange = { start: Pos; end: Pos };

// Mirrors the editor's own cursor/anchor pair (see ../model.ts): `anchor` is null when nothing is
// selected, and the selection spans anchor..cursor in either order.
export type EditorSelection = { anchor: Pos | null; cursor: Pos };

// `range` is the document range `lines` was taken from, always whole lines, so a handler can turn a
// slice-relative index into an absolute position by adding `range.start.line`. `file` is the tab's
// file name, which is how a plugin branches on language — the declaration carries no language field.
export type EditorPluginRequest = {
  command: string;
  file: string;
  // Every selection in creation order, the primary — the most recently created caret — last. Never
  // empty: an editor always has at least one caret.
  selections: readonly EditorSelection[];
  range: EditorRange;
  lines: readonly string[];
};

// The primary selection — the most recently created caret, and the one a command that thinks in
// terms of a single selection (commenting, indenting) acts on.
export const primarySelection = (request: EditorPluginRequest): EditorSelection => request.selections.at(-1)!;

// The buffer helpers a plugin may use, published here so a plugin never reaches into the editor's
// own model and offset modules for them.
//
// Each signature is written out rather than inherited from the host function, and that is the point:
// a bare re-export would leave the plugin-visible signature defined in `../model` and `../offsets`,
// so a refactor of the editor's caret and offset helpers would change what a plugin sees without
// touching this contract or its version number. Spelled here, such a refactor fails to typecheck in
// the versioned module — which is where the decision to bump `EDITOR_PLUGIN_API_VERSION` belongs.
export const selectionBounds: (selection: EditorSelection) => EditorRange = hostSelectionBounds;
export const textIn: (lines: readonly string[], range: EditorRange) => string = hostTextIn;
export const wordRangeAt: (lines: readonly string[], line: number, col: number) => EditorRange = hostWordRangeAt;
export const posToOffset: (lines: readonly string[], pos: Pos) => number = hostPosToOffset;
export const offsetToPos: (lines: readonly string[], offset: number) => Pos = hostOffsetToPos;

// One range replacement, in absolute document coordinates regardless of which slice was requested.
export type EditorPluginEdit = { start: Pos; end: Pos; text: string };

// `selections` omitted leaves the editor's set alone; a list replaces it whole, in creation order
// with the new primary last. An explicitly empty list is refused — see ./apply-edits.ts.
export type EditorPluginResult = {
  edits: readonly EditorPluginEdit[];
  selections?: readonly EditorSelection[];
};

export type EditorPluginHandler = (
  request: EditorPluginRequest,
) => EditorPluginResult | null | Promise<EditorPluginResult | null>;

// What a lazily-imported implementation module must default-export.
export type EditorPluginModule = { default: EditorPluginHandler };

export type EditorPluginLoader = () => Promise<EditorPluginModule>;

// Resolution: first match by exact chord, with duplicate chords refused when the registry is
// validated, so array position never breaks a tie beyond that first-wins rule. Ordering: a plugin
// chord is only ever consulted for a keydown the core table left unbound, so core bindings always
// win and no plugin can shadow Cmd+S. Async: the handler may return a promise and is raced against a
// per-call budget; a handler that blocks synchronously cannot be interrupted, and because this runs
// on the UI thread it would hang the window — bundled plugins are trusted code and that is not
// defended against. Empty return: `null` means the plugin chose to do nothing, which is
// indistinguishable in effect from no plugin claiming the chord — the buffer, selection, and undo
// stack are all left untouched.
