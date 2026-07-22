import { useState } from 'react';
import type { FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { computeRename, hasRenameCollision, siblingNames } from './file-tree-rename';

type PendingConflict = { relPath: string; newRelPath: string; newName: string };

// In-place rename for a file tree row (Cmd+R / Ctrl+R): edit state, commit/cancel, same-directory
// collision handling (via the shared `MoveConflictDialog`), and the RPC send — kept out of
// `FileTreeTab.tsx` to stay under the file-size limit, mirroring `useFileTreeDrag`/`useFileTreeSearch`.
export function useFileTreeRename(rows: FileTreeRow[], client: JanusClient, index: number, setSelected: (path: string) => void) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);

  const begin = (relPath: string, currentName: string) => {
    setEditing(relPath);
    setDraft(currentName);
  };

  const send = (relPath: string, newName: string, newRelPath: string) => {
    client.send({ method: 'renameFileTreeItem', params: { index, relPath, newName } });
    setSelected(newRelPath);
  };

  const commit = () => {
    if (editing === null) return;
    const relPath = editing;
    const outcome = computeRename(relPath, draft);
    setEditing(null);
    if (outcome.type === 'noop') return;
    const newName = draft.trim();
    if (hasRenameCollision(newName, siblingNames(rows, relPath))) {
      setPendingConflict({ relPath, newRelPath: outcome.newRelPath, newName });
      return;
    }
    send(relPath, newName, outcome.newRelPath);
  };

  const cancel = () => setEditing(null);

  const confirmOverwrite = () => {
    if (!pendingConflict) return;
    send(pendingConflict.relPath, pendingConflict.newName, pendingConflict.newRelPath);
    setPendingConflict(null);
  };

  const cancelConflict = () => {
    if (!pendingConflict) return;
    setEditing(pendingConflict.relPath);
    setDraft(pendingConflict.newName);
    setPendingConflict(null);
  };

  return { editing, draft, setDraft, begin, commit, cancel, pendingConflict, confirmOverwrite, cancelConflict };
}
