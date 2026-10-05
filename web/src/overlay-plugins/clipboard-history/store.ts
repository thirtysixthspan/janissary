import { displayLine, type OverlayPluginItem } from '../api';
import { subscribeClipboardCopies } from '../../shared/clipboard-captures';

// The clipboard history, which the plugin owns rather than the host: the ordering, the dedupe, and
// the cap are all this module's decisions, and they live inside the plugin's chunk rather than in the
// shared capture seam, which stays a list of listeners and holds no text of its own.
//
// Newest at the bottom, matching the history picker this popup is modelled on — the row nearest the
// command line is the most recent copy. Re-copying text already here moves its one row to the bottom
// rather than adding a second, which is what `getRecentHistory` does for command history and for the
// same reason: a cap filled with duplicates is not a history.
//
// A copy that is empty or only whitespace is not recorded at all. `copyText` already refuses an empty
// string; whitespace-only is an accidental copy of nothing, and its display line would be a blank row
// the user cannot read or choose.

export const FALLBACK_MAX_ENTRIES = 15;

// A row as the popup draws it: the contract's item, plus the `(N lines)` postfix shown beside the label
// and never pasted.
export type ClipboardHistoryRow = OverlayPluginItem & { postfix: string };

const PLUGIN_ID = 'clipboard-history';

const entries: { id: string; text: string }[] = [];
const listeners = new Set<() => void>();
let selected = 0;
const fallbackCap = () => FALLBACK_MAX_ENTRIES;
// Where the cap comes from rather than the cap itself: the plugin starts at launch, before the
// configured number has arrived, so it is read again at every copy and every open.
let capSource: () => number = fallbackCap;
let unsubscribe: (() => void) | null = null;
let sequence = 0;
let revision = 0;

// Rebuilt only when something changes: `useSyncExternalStore` compares its snapshot by identity, so a
// fresh array on every call would put the popup in an endless render loop.
let snapshot: readonly ClipboardHistoryRow[] = [];
let snapshotRevision = -1;

function notify(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeToHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function rows(): readonly ClipboardHistoryRow[] {
  if (snapshotRevision !== revision) {
    snapshot = entries.map((entry) => ({ id: entry.id, text: entry.text, ...displayLine(entry.text) }));
    snapshotRevision = revision;
  }
  return snapshot;
}

export function selection(): number {
  return selected;
}

export function textAt(index: number): string | undefined {
  return entries[index]?.text;
}

export function size(): number {
  return entries.length;
}

function clampSelection(): void {
  selected = Math.max(0, Math.min(entries.length - 1, selected));
}

function cap(): number {
  const next = capSource();
  return Number.isSafeInteger(next) && next > 0 ? next : FALLBACK_MAX_ENTRIES;
}

// Applying a cap lower than what is already held trims at once, so the visible list always matches the
// configured number rather than holding entries the setting says should be gone.
function trim(): void {
  const limit = cap();
  if (entries.length > limit) entries.splice(0, entries.length - limit);
  clampSelection();
}

export function record(text: string): void {
  if (!text.trim()) return;
  const existing = entries.findIndex((entry) => entry.text === text);
  if (existing !== -1) entries.splice(existing, 1);
  sequence += 1;
  entries.push({ id: `${PLUGIN_ID}-${sequence}`, text });
  trim();
  selected = entries.length - 1;
  notify();
}

// The `useState`-shaped setter the shared `handlePickerKey` asks for: it hands over a function of the
// previous value rather than a value, so the arrows clamp against whatever the selection is now
// rather than against a value captured when the key handler was built.
export function setSelection(updater: number | ((previous: number) => number)): void {
  selected = typeof updater === 'function' ? updater(selected) : updater;
  clampSelection();
  notify();
}

// A first open highlights the most recent copy, which is the one the user is nearly always reaching
// for — the same rule the history picker's `openPicker` follows. It trims first, so a cap that arrived
// lower than what was copied before it is applied by the time the list is on screen.
export function selectNewest(): void {
  trim();
  selected = Math.max(0, entries.length - 1);
  clampSelection();
  notify();
}

export function applyMaxEntries(source: () => number): void {
  capSource = source;
  trim();
  notify();
}

export function startHistory(source: () => number): void {
  applyMaxEntries(source);
  if (unsubscribe) return;
  unsubscribe = subscribeClipboardCopies(record);
}

export function disposeHistory(): void {
  unsubscribe?.();
  unsubscribe = null;
  entries.length = 0;
  selected = 0;
  capSource = fallbackCap;
  notify();
}
