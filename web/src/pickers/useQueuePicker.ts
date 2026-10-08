import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JanusClient } from '../ws';
import type { TabView } from '@shared/protocol';
import { hostsCommandBar } from '../shared/command-bar/hosts-command-bar';

// A queue popup needs both an opted-in queue and a command bar to edit its rows.
function ownsQueueLine(tab: TabView | undefined): tab is TabView {
  return tab?.hasCommandQueue === true && hostsCommandBar(tab);
}

// State and handlers for the Ctrl+E / `queue` command-queue picker (mirrors the `hist` picker's
// shape in App, split out to keep App.tsx under the file-size limit). Selection (arrow move or
// row click) copies the selected row's text into the command line, which is the sole edit
// surface — typing there patches the selected row server-side via `editQueuedCommand`.
//
// `tab` is the tab the popup belongs to: the tab a plugin bar raised it from, or else the current tab.
// Its rows are that tab's queue, and edits and deletes name it, so a popup over a docked shell edits
// the shell's queue while an agent is the current tab. The opener is told its source directly, because
// it runs before the app records that source and `tab` still names the previous owner.
export function useQueuePicker(
  client: JanusClient,
  tab: TabView | undefined,
  tabs: readonly TabView[] = [],
) {
  const items = useMemo(() => tab?.commandQueue ?? [], [tab]);
  const label = tab?.label;
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueIndex, setQueueIndexState] = useState(0);

  useEffect(() => {
    if (!ownsQueueLine(tab)) setQueueOpen(false);
  }, [tab]);

  // Clamp the selector without re-copying text when the queue shrinks (a drain or a delete
  // racing the open popup) — the command line keeps whatever it currently holds.
  useEffect(() => {
    setQueueIndexState((prev) => Math.max(0, Math.min(items.length - 1, prev)));
  }, [items.length]);

  const selectQueueIndex = useCallback((index: number) => {
    setQueueIndexState(index);
  }, []);

  const openQueue = useCallback((sourceTab?: string) => {
    const owner = sourceTab === undefined ? tab : tabs.find((candidate) => candidate.label === sourceTab);
    if (!ownsQueueLine(owner)) return;
    setQueueOpen(true);
    setQueueIndexState(0);
  }, [tab, tabs]);

  const setQueueIndex = useCallback((setter: (prev: number) => number) => {
    selectQueueIndex(Math.max(0, Math.min(items.length - 1, setter(queueIndex))));
  }, [items.length, queueIndex, selectQueueIndex]);

  const onEditQueued = useCallback((text: string) => {
    client.send({ method: 'editQueuedCommand', params: { index: queueIndex, text, tab: label } });
  }, [client, queueIndex, label]);

  const onDeleteQueued = useCallback(() => {
    client.send({ method: 'deleteQueuedCommand', params: { index: queueIndex, tab: label } });
  }, [client, queueIndex, label]);

  return {
    queueOpen, queueIndex, setQueueIndex, setQueueOpen, openQueue, selectQueueIndex, onEditQueued, onDeleteQueued,
  };
}
