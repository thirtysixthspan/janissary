import { useState } from 'react';
import type { FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { computeRename, hasRenameCollision, parentPath } from './file-tree-rename';

type PendingConflict = { relPath: string; newName: string; newPath: string };

// Inline rename orchestration for one file tree tab: the editable-field state, commit/cancel, the
// same-directory collision check (backed by `MoveConflictDialog`), and the RPC send. Split out of
// `FileTreeTab` to keep it under the file-size limit — mirrors `useFileTreeSearch`/`useFileTreeDrag`.
export function useFileTreeRename(
  client: JanusClient,
  index: number,
  rows: FileTreeRow[],
  setSelected: (path: string | null) => void,
) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);

  const beginRename = (path: string) => setEditing(path);
  const cancel = () => setEditing(null);

  const send = (relPath: string, newName: string, newPath: string) => {
    client.send({ method: 'renameFileTreeItem', params: { index, relPath, newName } });
    setSelected(newPath);
    setEditing(null);
  };

  const commit = (rawName: string) => {
    const relPath = editing;
    if (!relPath) return;
    const newName = rawName.trim();
    const outcome = computeRename(relPath, newName);
    if (outcome.type === 'noop') { setEditing(null); return; }
    const parent = parentPath(relPath);
    const siblingNames = rows.filter((r) => r.path !== relPath && parentPath(r.path) === parent).map((r) => r.name);
    if (hasRenameCollision(newName, siblingNames)) {
      setPendingConflict({ relPath, newName, newPath: outcome.newPath });
      return;
    }
    send(relPath, newName, outcome.newPath);
  };

  const confirmOverwrite = () => {
    if (!pendingConflict) return;
    send(pendingConflict.relPath, pendingConflict.newName, pendingConflict.newPath);
    setPendingConflict(null);
  };

  const cancelConflict = () => {
    setEditing(pendingConflict?.relPath ?? null);
    setPendingConflict(null);
  };

  return { editing, beginRename, commit, cancel, pendingConflict, confirmOverwrite, cancelConflict };
}
