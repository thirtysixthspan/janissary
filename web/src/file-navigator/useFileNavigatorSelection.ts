import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileNavigatorRestoreHint, FileNavigatorRow } from '@shared/protocol';
import { clearNavigatorSelection, publishNavigatorSelection } from './file/navigator-selection-registry';
import { siblingSelection } from './file/navigator-siblings';
import {
  EMPTY_SELECTION,
  focusHintStatus,
  normalizeOperationPaths,
  rangeSelection,
  reconcileSelection,
  replaceRenamedPath,
  replaceSelection,
  selectFromPointer,
  selectionFromRestore,
  type FileNavigatorSelection,
} from './file/navigator-selection';

type FocusHintOutcome = 'pending' | 'applied' | 'dropped';
type FocusHintRecord = { revision: number; outcome: FocusHintOutcome };

export function useFileNavigatorSelection(
  rows: FileNavigatorRow[], absoluteRoot: string, label?: string, restore?: FileNavigatorRestoreHint,
) {
  const [state, setState] = useState<FileNavigatorSelection>(EMPTY_SELECTION);
  const [recordedFocus, setRecordedFocus] = useState<FocusHintRecord | undefined>(undefined);
  const previousRows = useRef(rows);
  const previousRoot = useRef(absoluteRoot);
  const appliedRestore = useRef<number | undefined>(undefined);
  const focusOrigin = useRef<{ revision?: number; root: string }>({ root: absoluteRoot });
  const userMoved = useRef(false);

  const recordFocusOutcome = useCallback((revision: number, outcome: FocusHintOutcome) => {
    setRecordedFocus((current) => current?.revision === revision && current.outcome === outcome
      ? current
      : { revision, outcome });
  }, []);

  useEffect(() => {
    const rootChanged = previousRoot.current !== absoluteRoot;
    const rowsBefore = previousRows.current;
    const pendingRestore = restore && appliedRestore.current !== restore.revision ? restore : undefined;
    if (!rootChanged && rowsBefore === rows && !pendingRestore) return;
    previousRoot.current = absoluteRoot;
    previousRows.current = rows;

    if (pendingRestore?.focus === true && focusOrigin.current.revision !== pendingRestore.revision) {
      focusOrigin.current = { revision: pendingRestore.revision, root: absoluteRoot };
      userMoved.current = false;
    }
    const focusStatus = pendingRestore?.focus === true
      ? focusHintStatus(
        pendingRestore, rows, absoluteRoot, focusOrigin.current.root, appliedRestore.current, userMoved.current,
      )
      : 'none';

    const resetOrReconcile = (current: FileNavigatorSelection): FileNavigatorSelection =>
      (rootChanged ? EMPTY_SELECTION : reconcileSelection(current, rowsBefore, rows));

    if (pendingRestore && focusStatus === 'pending') {
      setState(resetOrReconcile);
      recordFocusOutcome(pendingRestore.revision, 'pending');
      return;
    }

    if (pendingRestore && focusStatus === 'ready') {
      setState((current) => selectionFromRestore(pendingRestore, rows, resetOrReconcile(current)));
      appliedRestore.current = pendingRestore.revision;
      recordFocusOutcome(pendingRestore.revision, 'applied');
      return;
    }

    if (pendingRestore && focusStatus === 'dropped') {
      setState(resetOrReconcile);
      appliedRestore.current = pendingRestore.revision;
      recordFocusOutcome(pendingRestore.revision, 'dropped');
      return;
    }

    if (pendingRestore) appliedRestore.current = pendingRestore.revision;

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
  }, [absoluteRoot, recordFocusOutcome, restore, rows]);

  // Publish into the registry `ws.ts` answers a `collect-tree-state` request from, and drop this
  // navigator's entry when it unmounts.
  useEffect(() => {
    if (label === undefined) return;
    publishNavigatorSelection(label, state);
  }, [label, state]);

  useEffect(() => {
    if (label === undefined) return;
    return () => { clearNavigatorSelection(label); };
  }, [label]);

  const focusHint = restore?.focus === true && recordedFocus?.revision === restore.revision
    ? recordedFocus
    : undefined;

  const dropPendingFocus = useCallback(() => {
    if (focusHint?.outcome !== 'pending') return;
    userMoved.current = true;
    recordFocusOutcome(focusHint.revision, 'dropped');
  }, [focusHint, recordFocusOutcome]);

  const replace = useCallback((path: string | null) => {
    dropPendingFocus();
    setState(replaceSelection(path));
  }, [dropPendingFocus]);
  // Shift+Arrow's counterpart to a Shift-click: the range math stays in `rangeSelection`, and an
  // empty selection anchors on the top row so the first shifted arrow behaves like a plain one.
  const extend = useCallback((path: string) => {
    dropPendingFocus();
    setState((current) => rangeSelection(
      current.anchor === null && current.cursor === null
        ? { ...current, cursor: rows[0]?.path ?? null }
        : current,
      rows,
      path,
    ));
  }, [dropPendingFocus, rows]);
  const selectSiblings = useCallback(() => {
    dropPendingFocus();
    setState((current) => siblingSelection(current, rows));
  }, [dropPendingFocus, rows]);
  const pointer = useCallback((
    path: string,
    shiftKey: boolean,
    toggleKey: boolean,
  ): FileNavigatorSelection => {
    dropPendingFocus();
    const next = selectFromPointer(state, rows, path, shiftKey, toggleKey);
    setState(next);
    return next;
  }, [dropPendingFocus, rows, state]);
  const rename = useCallback((oldPath: string, newPath: string) => {
    setState((current) => replaceRenamedPath(current, oldPath, newPath));
  }, []);

  return {
    ...state,
    focusHint,
    replace,
    extend,
    selectSiblings,
    pointer,
    rename,
    operationPaths: normalizeOperationPaths(rows, state.selected),
  };
}
