import { useState } from 'react';
import type { FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { hasRenameCollision, renameResult } from './file-tree-rename';

type PendingRename = { path: string; newName: string; newPath: string };

export function useFileTreeRename(
  rows: FileTreeRow[], client: JanusClient, index: number, setSelected: (path: string | null) => void,
) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingRename | null>(null);
  const send = (rename: PendingRename) => {
    client.send({ method: 'renameFileTreeItem', params: { index, relPath: rename.path, newName: rename.newName } });
    setSelected(rename.newPath);
  };
  const beginRename = (path: string) => setEditing(path);
  const cancel = () => setEditing(null);
  const commit = (rawName: string) => {
    if (!editing) return;
    const result = renameResult(editing, rawName);
    if (result.type === 'noop') { setEditing(null); return; }
    const parent = editing.includes('/') ? editing.slice(0, editing.lastIndexOf('/')) : '';
    const siblings = new Set(rows.filter((row) => (row.path.includes('/') ? row.path.slice(0, row.path.lastIndexOf('/')) : '') === parent && row.path !== editing).map((row) => row.name));
    const rename = { path: editing, ...result };
    if (hasRenameCollision(result.newName, siblings)) {
      setPendingConflict(rename);
      setEditing(null);
      return;
    }
    send(rename);
    setEditing(null);
  };
  const confirmOverwrite = () => {
    if (!pendingConflict) return;
    send(pendingConflict);
    setPendingConflict(null);
  };
  const cancelConflict = () => {
    if (!pendingConflict) return;
    setEditing(pendingConflict.path);
    setPendingConflict(null);
  };
  return { editing, pendingConflict, beginRename, commit, cancel, confirmOverwrite, cancelConflict };
}
