import { useEffect, useState } from 'react';
import type { FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { computeRename, hasRenameCollision, siblingNames } from './file/navigator-rename';

type PendingConflict = { relPath: string; newRelPath: string; newName: string };

// In-place rename for a file navigator row (Cmd+R / Ctrl+R): edit state, commit/cancel, same-directory
// collision handling (via the shared `MoveConflictDialog`), and the RPC send — kept out of
// `FileNavigatorTab.tsx` to stay under the file-size limit, mirroring `useFileNavigatorDrag`/`useFileNavigatorSearch`.
export function useFileNavigatorRename(
  rows: FileNavigatorRow[], client: JanusClient, label: string,
  replaceRenamedPath: (oldPath: string, newPath: string) => void,
  focusTree: () => void,
) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ oldPath: string; newPath: string } | null>(null);

  useEffect(() => {
    if (pendingSelection === null || rows.every((row) => row.path !== pendingSelection.newPath)) return;
    replaceRenamedPath(pendingSelection.oldPath, pendingSelection.newPath);
    setPendingSelection(null);
  }, [pendingSelection, replaceRenamedPath, rows]);

  const begin = (relPath: string, currentName: string) => {
    setEditing(relPath);
    setDraft(currentName);
  };

  const send = async (relPath: string, newName: string, newRelPath: string, overwrite = false) => {
    const result = await client.request<{ total: number; failedPaths: string[] } | { conflict: true }>({
      method: 'renameFileNavigatorItem', params: { label, relPath, newName, ...(overwrite && { overwrite }) },
    });
    if (!result.ok) return;
    if ('conflict' in result.value) {
      setPendingConflict({ relPath, newRelPath, newName });
      return;
    }
    if (result.value.failedPaths.length > 0) return;
    replaceRenamedPath(relPath, newRelPath);
    setPendingSelection({ oldPath: relPath, newPath: newRelPath });
    focusTree();
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
    void send(relPath, newName, outcome.newRelPath);
  };

  const cancel = () => setEditing(null);

  const confirmOverwrite = () => {
    if (!pendingConflict) return;
    void send(pendingConflict.relPath, pendingConflict.newName, pendingConflict.newRelPath, true);
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
