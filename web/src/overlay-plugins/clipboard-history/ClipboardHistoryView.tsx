import React from 'react';
import type { ClipboardHistoryStore } from './store';
import { ClipboardHistoryPopup } from './Popup';
import { useClipboardHistory } from './useClipboardHistory';

export function ClipboardHistoryView({
  store, choose,
}: {
  store: ClipboardHistoryStore;
  choose(text: string): void;
}) {
  const { rows, selected } = useClipboardHistory(store);
  return <ClipboardHistoryPopup rows={rows} selected={selected} choose={choose} />;
}
