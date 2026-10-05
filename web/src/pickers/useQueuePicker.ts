import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JanusClient } from '../ws';
import type { TabView } from '@shared/protocol';
import { hostsCommandBar } from '../shared/command-bar/hosts-command-bar';

// State and handlers for the Ctrl+E / `queue` command-queue picker (mirrors the `hist` picker's
// shape in App, split out to keep App.tsx under the file-size limit). Selection (arrow move or
// row click) copies the selected row's text into the command line, which is the sole edit
// surface — typing there patches the selected row server-side via `editQueuedCommand`.
export function useQueuePicker(
  client: JanusClient,
  current: TabView | undefined,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  recallRef: React.RefObject<((text: string) => void) | null>,
) {
  const items = useMemo(() => current?.commandQueue ?? [], [current]);
  // A plugin tab that declares it hosts the command bar mirrors selection in its own bar instead of
  // the hidden agent input. Other plugin tabs do not own a queue command line.
  const isAgentTab = current?.view === undefined || current?.view === 'agent';
  const isCommandBarTab = hostsCommandBar(current);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueIndex, setQueueIndexState] = useState(0);

  // Clamp the selector without re-copying text when the queue shrinks (a drain or a delete
  // racing the open popup) — the command line keeps whatever it currently holds.
  useEffect(() => {
    setQueueIndexState((prev) => Math.max(0, Math.min(items.length - 1, prev)));
  }, [items.length]);

  const selectQueueIndex = useCallback((index: number) => {
    setQueueIndexState(index);
    const text = items[index];
    if (!isCommandBarTab) {
      if (text !== undefined) recallRef.current?.(text);
      inputRef.current?.focus();
    }
  }, [items, inputRef, isCommandBarTab, recallRef]);

  const openQueue = useCallback(() => {
    if (!isAgentTab && !isCommandBarTab) return;
    setQueueOpen(true);
    selectQueueIndex(0);
  }, [isAgentTab, isCommandBarTab, selectQueueIndex]);

  // Closing the popup (Escape) also clears the command line: the selected row's text was copied
  // there for editing, and leaving it behind after dismissing the popup would be confusing.
  const closeQueue = useCallback((open: boolean) => {
    setQueueOpen(open);
    if (!open) recallRef.current?.('');
  }, [recallRef]);

  const setQueueIndex = useCallback((setter: (prev: number) => number) => {
    selectQueueIndex(Math.max(0, Math.min(items.length - 1, setter(queueIndex))));
  }, [items.length, queueIndex, selectQueueIndex]);

  const onEditQueued = useCallback((text: string) => {
    client.send({ method: 'editQueuedCommand', params: { index: queueIndex, text } });
  }, [client, queueIndex]);

  const onDeleteQueued = useCallback(() => {
    client.send({ method: 'deleteQueuedCommand', params: { index: queueIndex } });
  }, [client, queueIndex]);

  return {
    queueOpen, queueIndex, setQueueIndex, setQueueOpen: closeQueue, openQueue, selectQueueIndex, onEditQueued, onDeleteQueued,
  };
}
