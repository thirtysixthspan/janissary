import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileNavigatorRestoreHint, FileNavigatorRow } from '@shared/protocol';
import { clearNavigatorSelection, publishNavigatorSelection } from './file/navigator-selection-registry';
import { siblingSelection } from './file/navigator-siblings';
import {
  EMPTY_SELECTION,
  normalizeOperationPaths,
  rangeSelection,
  reconcileSelection,
  replaceRenamedPath,
  replaceSelection,
  selectFromPointer,
  selectionFromRestore,
  type FileNavigatorSelection,
} from './file/navigator-selection';

export function useFileNavigatorSelection(
  rows: FileNavigatorRow[], absoluteRoot: string, index?: number, restore?: FileNavigatorRestoreHint,
) {
  const [state, setState] = useState<FileNavigatorSelection>(EMPTY_SELECTION);
  const previousRows = useRef(rows);
  const previousRoot = useRef(absoluteRoot);
  const appliedRestore = useRef<number | undefined>(undefined);

  useEffect(() => {
    const rootChanged = previousRoot.current !== absoluteRoot;
    const rowsBefore = previousRows.current;
    const pendingRestore = restore && appliedRestore.current !== restore.revision ? restore : undefined;
    if (!rootChanged && rowsBefore === rows && !pendingRestore) return;
    if (pendingRestore) appliedRestore.current = pendingRestore.revision;
    previousRoot.current = absoluteRoot;
    previousRows.current = rows;

    setState((current) => {
      if (rootChanged) {
        const reset = EMPTY_SELECTION;
        return pendingRestore ? selectionFromRestore(pendingRestore, rows, reset) : reset;
      }

      const reconciled = reconcileSelection(current, rowsBefore, rows);
      if (!pendingRestore) return reconciled;

      const replacesSelection = pendingRestore.cursor !== undefined
        && pendingRestore.anchor !== undefined
        && pendingRestore.selected !== undefined;
      if (replacesSelection) return selectionFromRestore(pendingRestore, rows, reconciled);

      return reconcileSelection(
        selectionFromRestore(pendingRestore, rows, current),
        rowsBefore,
        rows,
      );
    });
  }, [absoluteRoot, restore, rows]);

  // Publish into the registry `ws.ts` answers a `collect-tree-state` request from, and drop this
  // navigator's entry when it unmounts.
  useEffect(() => {
    if (index === undefined) return;
    publishNavigatorSelection(index, state);
  }, [index, state]);

  useEffect(() => {
    if (index === undefined) return;
    return () => { clearNavigatorSelection(index); };
  }, [index]);

  const replace = useCallback((path: string | null) => setState(replaceSelection(path)), []);
  // Shift+Arrow's counterpart to a Shift-click: the range math stays in `rangeSelection`, and an
  // empty selection anchors on the top row so the first shifted arrow behaves like a plain one.
  const extend = useCallback((path: string) => {
    setState((current) => rangeSelection(
      current.anchor === null && current.cursor === null
        ? { ...current, cursor: rows[0]?.path ?? null }
        : current,
      rows,
      path,
    ));
  }, [rows]);
  const selectSiblings = useCallback(() => {
    setState((current) => siblingSelection(current, rows));
  }, [rows]);
  const pointer = useCallback((
    path: string,
    shiftKey: boolean,
    toggleKey: boolean,
  ): FileNavigatorSelection => {
    const next = selectFromPointer(state, rows, path, shiftKey, toggleKey);
    setState(next);
    return next;
  }, [rows, state]);
  const rename = useCallback((oldPath: string, newPath: string) => {
    setState((current) => replaceRenamedPath(current, oldPath, newPath));
  }, []);

  return {
    ...state,
    replace,
    extend,
    selectSiblings,
    pointer,
    rename,
    operationPaths: normalizeOperationPaths(rows, state.selected),
  };
}
