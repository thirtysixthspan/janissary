import { useRef, useState } from 'react';
import type { FileSelectionAction } from '@shared/protocol';
import type { JanusClient } from './ws';

// The entry a tab plugin contributes for a whole selection of rows, for the row context menu.
// Queried only when a menu opens on a row that belongs to a multi-row selection: every other menu
// entry acts on the clicked row alone, so a single-row menu has nothing to ask about and issues no
// request at all. The server answers with a label or with nothing, and only ever offers an action it
// is willing to run — the client sends back the same paths and that action name, never a plugin.
export function useSelectionAction(client: JanusClient, index: number) {
  const [entry, setEntry] = useState<FileSelectionAction | null>(null);
  const generation = useRef(0);

  const clear = () => {
    generation.current += 1;
    setEntry(null);
  };

  const query = (paths: string[]) => {
    clear();
    if (paths.length < 2 || typeof client.request !== 'function') return;
    const queryGeneration = generation.current;
    void client.request<FileSelectionAction | null>({
      method: 'fileNavigatorSelectionAction', params: { index, paths },
    }).then((result) => {
      if (generation.current === queryGeneration) setEntry(result ?? null);
    });
  };

  const run = (paths: string[]) => {
    if (!entry) return;
    client.send({
      method: 'runFileNavigatorSelectionAction', params: { index, paths, action: entry.action },
    });
  };

  return { entry, query, run, clear };
}
