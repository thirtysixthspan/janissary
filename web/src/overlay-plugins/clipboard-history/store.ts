import { displayLine, type OverlayPluginItem } from '../api';
import { subscribeClipboardCopies as subscribeToClipboardCopies } from '../../shared/clipboard-captures';

export const FALLBACK_MAX_ENTRIES = 15;

export type ClipboardHistoryRow = OverlayPluginItem & { postfix: string };
export type ClipboardCopyListener = (text: string) => void;
export type ClipboardCopySubscription = (listener: ClipboardCopyListener) => () => void;

export type ClipboardHistoryStore = {
  subscribe(listener: () => void): () => void;
  getRows(): readonly ClipboardHistoryRow[];
  getSelection(): number;
  getTextAt(index: number): string | undefined;
  size(): number;
  record(text: string): void;
  setSelection(updater: number | ((previous: number) => number)): void;
  selectNewest(): void;
  applyMaxEntries(source: () => number): void;
  start(source: () => number): void;
  dispose(): void;
};

const PLUGIN_ID = 'clipboard-history';
const fallbackCap = () => FALLBACK_MAX_ENTRIES;

export function createClipboardHistoryStore(
  subscribeCopies: ClipboardCopySubscription = subscribeToClipboardCopies,
): ClipboardHistoryStore {
  const entries: { id: string; text: string }[] = [];
  const listeners = new Set<() => void>();
  let selected = 0;
  let capSource = fallbackCap;
  let unsubscribe: (() => void) | null = null;
  let sequence = 0;
  let revision = 0;
  let snapshot: readonly ClipboardHistoryRow[] = [];
  let snapshotRevision = -1;

  const notify = (): void => {
    revision += 1;
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };

  const getRows = (): readonly ClipboardHistoryRow[] => {
    if (snapshotRevision !== revision) {
      snapshot = entries.map((entry) => ({ id: entry.id, text: entry.text, ...displayLine(entry.text) }));
      snapshotRevision = revision;
    }
    return snapshot;
  };

  const clampSelection = (): void => {
    selected = Math.max(0, Math.min(entries.length - 1, selected));
  };

  const cap = (): number => {
    const next = capSource();
    return Number.isSafeInteger(next) && next > 0 ? next : FALLBACK_MAX_ENTRIES;
  };

  const trim = (): void => {
    const limit = cap();
    if (entries.length > limit) entries.splice(0, entries.length - limit);
    clampSelection();
  };

  const record = (text: string): void => {
    if (!text.trim()) return;
    const existing = entries.findIndex((entry) => entry.text === text);
    if (existing !== -1) entries.splice(existing, 1);
    sequence += 1;
    entries.push({ id: `${PLUGIN_ID}-${sequence}`, text });
    trim();
    selected = entries.length - 1;
    notify();
  };

  const setSelection = (updater: number | ((previous: number) => number)): void => {
    selected = typeof updater === 'function' ? updater(selected) : updater;
    clampSelection();
    notify();
  };

  const selectNewest = (): void => {
    trim();
    selected = Math.max(0, entries.length - 1);
    clampSelection();
    notify();
  };

  const applyMaxEntries = (source: () => number): void => {
    capSource = source;
    trim();
    notify();
  };

  const start = (source: () => number): void => {
    applyMaxEntries(source);
    unsubscribe ??= subscribeCopies(record);
  };

  const dispose = (): void => {
    unsubscribe?.();
    unsubscribe = null;
    if (entries.length === 0 && selected === 0 && capSource === fallbackCap) return;
    entries.length = 0;
    selected = 0;
    capSource = fallbackCap;
    notify();
  };

  return {
    subscribe,
    getRows,
    getSelection: () => selected,
    getTextAt: (index) => entries[index]?.text,
    size: () => entries.length,
    record,
    setSelection,
    selectNewest,
    applyMaxEntries,
    start,
    dispose,
  };
}
