import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JanusClient } from './ws';
import type { TabView } from '@shared/protocol';

// State and handlers for the Cmd+E / `queue` command-queue picker (mirrors the `hist` picker's
// shape in App, split out to keep App.tsx under the file-size limit). Selection (arrow move or
// row click) copies the selected row's text into the command line, which is the sole edit
// surface — typing there patches the selected row server-side via `editQueuedCommand`.
export function useQueuePicker(
  client: JanusClient,
  current: TabView | undefined,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  const items = useMemo(() => current?.commandQueue ?? [], [current]);
  // `Cmd+E` / `queue` no-ops when the exposed tab isn't an agent tab (mirroring `canSearch`).
  const isAgentTab = current?.view === undefined || current?.view === 'agent';
  // Assigned `CommandInput`'s `recall` (the `guardRef` pattern) so selection can push a row's
  // text into the command line.
  const recallRef = useRef<((text: string) => void) | null>(null);
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
    if (text !== undefined) recallRef.current?.(text);
    inputRef.current?.focus();
  }, [items, inputRef]);

  const openQueue = useCallback(() => {
    if (!isAgentTab) return;
    setQueueOpen(true);
    selectQueueIndex(0);
  }, [isAgentTab, selectQueueIndex]);

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
    queueOpen, queueIndex, setQueueIndex, setQueueOpen, openQueue, selectQueueIndex, onEditQueued, onDeleteQueued, recallRef,
  };
}
