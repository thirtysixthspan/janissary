import { useEffect } from 'react';
import type { JanusClient } from '../ws';
import { registerHarnessDrop } from '../shared/drop-registry';

// A file-navigator drag released over the terminal types its paths into the harness. Focus moves
// here first: the drag started in the file tree, where the letters the user types next are a
// type-to-select gesture rather than text. A tab still provisioning has no PTY to write to, so it
// publishes nothing.
export function useHarnessPtyDrop(ptyId: string, client: JanusClient, focus: () => void): void {
  useEffect(() => {
    if (!ptyId) return;
    return registerHarnessDrop(ptyId, {
      insertAtCaret: (text: string) => {
        focus();
        client.send({ method: 'ptyInput', params: { id: ptyId, data: text } });
      },
    });
  }, [ptyId, client, focus]);
}
