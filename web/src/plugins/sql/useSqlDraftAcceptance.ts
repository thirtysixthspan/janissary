import { useCallback, useRef, useState } from 'react';
import type { SqlInsertCell } from '@shared/plugins/sql/shared';
import type { SqlActions } from './useSqlActions';

export function useSqlDraftAcceptance() {
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  const submit = useCallback(async (request: () => Promise<boolean>, onAccepted: () => void): Promise<boolean> => {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    try {
      const accepted = await request();
      if (accepted) onAccepted();
      return accepted;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, []);

  return { pending, submit };
}

export function useSqlGridDrafts(actions: SqlActions, object: string, onInserting: (open: boolean) => void) {
  const acceptance = useSqlDraftAcceptance();
  const [editing, setEditing] = useState<{ row: string; column: string } | null>(null);
  const editingDraft = useRef<{ row: string; column: string; value: string | null } | null>(null);

  const beginCellEdit = (row: string, column: string, value: string | null) => {
    editingDraft.current = { row, column, value };
    setEditing({ row, column });
  };
  const updateCellDraft = (row: string, column: string, value: string | null) => {
    editingDraft.current = { row, column, value };
  };
  const cancelCellEdit = () => {
    editingDraft.current = null;
    setEditing(null);
  };
  const commitCell = (row: string, column: string, value: string | null) => {
    void acceptance.submit(() => actions.updateCell(row, column, value), () => {
      const draft = editingDraft.current;
      if (draft?.row !== row || draft.column !== column || draft.value !== value) return;
      editingDraft.current = null;
      setEditing((current) => current?.row === row && current.column === column ? null : current);
    });
  };
  const insertRow = (cells: SqlInsertCell[]) => {
    void acceptance.submit(() => actions.insertRow(object, cells), () => onInserting(false));
  };

  return {
    editing, pending: acceptance.pending, beginCellEdit, updateCellDraft,
    cancelCellEdit, commitCell, insertRow,
  };
}
