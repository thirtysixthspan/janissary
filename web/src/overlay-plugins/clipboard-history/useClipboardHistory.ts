import { useSyncExternalStore } from 'react';
import type { ClipboardHistoryStore } from './store';

export function useClipboardHistory(store: ClipboardHistoryStore) {
  const rows = useSyncExternalStore(store.subscribe, store.getRows, store.getRows);
  const selected = useSyncExternalStore(store.subscribe, store.getSelection, store.getSelection);
  return { rows, selected };
}
