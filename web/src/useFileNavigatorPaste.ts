import { useState, useSyncExternalStore } from 'react';
import type { BulkConflictPolicy, BulkMoveResult, FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { newFileTargetDir } from './file-navigator-new-file';
import { clearClipboard, getClipboardSnapshot, isPendingCut, subscribeClipboard, type ClipboardMode } from './file-navigator-clipboard';

type PendingPasteConflict = {
  sources: string[];
  destinationPath: string;
  mode: ClipboardMode;
  title: string;
};

function conflictTitle(sources: string[], destinationPath: string): string {
  if (sources.length === 1) {
    const name = sources[0].slice(sources[0].lastIndexOf('/') + 1);
    return `"${name}" already exists here. Overwrite it?`;
  }
  const folderName = destinationPath.slice(destinationPath.lastIndexOf('/') + 1);
  return `Some items already exist in "${folderName}".`;
}

// Owns the paste flow (`Ctrl+V`), mirroring `useFileNavigatorMoveOperations`'s conflict/retry
// shape. Subscribes to the app-wide clipboard so the tree re-renders when it changes elsewhere
// (a copy/cut in another navigator, or this one), which is what keeps the cut-row dimming live.
export function useFileNavigatorPaste(client: JanusClient, index: number, absoluteRoot: string) {
  useSyncExternalStore(subscribeClipboard, getClipboardSnapshot, getClipboardSnapshot);
  const [pendingConflict, setPendingConflict] = useState<PendingPasteConflict | null>(null);

  const sendPaste = async (
    sources: string[],
    destinationPath: string,
    mode: ClipboardMode,
    policy?: BulkConflictPolicy,
  ) => {
    const result = await client.request<BulkMoveResult>({
      method: 'pasteFileNavigatorItems',
      params: { index, sources, destinationPath, mode, policy },
    });
    if ('conflictPaths' in result) {
      setPendingConflict({ sources, destinationPath, mode, title: conflictTitle(sources, destinationPath) });
      return;
    }
    setPendingConflict(null);
    if (mode === 'cut') clearClipboard();
  };

  const paste = (rows: FileNavigatorRow[], cursor: string | null) => {
    const snapshot = getClipboardSnapshot();
    if (!snapshot) return;
    void sendPaste(snapshot.paths, newFileTargetDir(rows, cursor) ?? '', snapshot.mode);
  };

  const retry = (policy: BulkConflictPolicy) => {
    if (!pendingConflict) return;
    void sendPaste(pendingConflict.sources, pendingConflict.destinationPath, pendingConflict.mode, policy);
  };

  return {
    pendingConflict,
    paste,
    confirmOverwrite: () => retry('overwrite-all'),
    skipConflicts: () => retry('skip-conflicts'),
    cancelConflict: () => setPendingConflict(null),
    isCut: (path: string) => isPendingCut(absoluteRoot, path),
  };
}
