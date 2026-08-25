import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileNavigatorRow } from '@shared/protocol';
import { clearNavigatorSelection, publishNavigatorSelection } from './file-navigator-selection-registry';
import { siblingSelection } from './file-navigator-siblings';
import { dirname } from '../rel-path';

export type FileNavigatorSelection = {
  cursor: string | null;
  anchor: string | null;
  selected: Set<string>;
};

const EMPTY_SELECTION: FileNavigatorSelection = {
  cursor: null,
  anchor: null,
  selected: new Set(),
};

export function replaceSelection(path: string | null): FileNavigatorSelection {
  return { cursor: path, anchor: path, selected: new Set(path === null ? [] : [path]) };
}

export function rangeSelection(
  state: FileNavigatorSelection,
  rows: FileNavigatorRow[],
  path: string,
): FileNavigatorSelection {
  if (path === '..') return replaceSelection(path);
  const startPath = state.anchor ?? state.cursor ?? path;
  const start = rows.findIndex((row) => row.path === startPath);
  const end = rows.findIndex((row) => row.path === path);
  if (start === -1 || end === -1) return replaceSelection(path);
  const [from, to] = start < end ? [start, end] : [end, start];
  const paths = rows.slice(from, to + 1).map((row) => row.path).filter((candidate) => candidate !== '..');
  return { cursor: path, anchor: startPath, selected: new Set(paths) };
}

export function toggleSelection(state: FileNavigatorSelection, path: string): FileNavigatorSelection {
  if (path === '..') return replaceSelection(path);
  const selected = new Set(state.selected);
  if (selected.has(path)) selected.delete(path);
  else selected.add(path);
  return { cursor: path, anchor: path, selected };
}

export function selectFromPointer(
  state: FileNavigatorSelection,
  rows: FileNavigatorRow[],
  path: string,
  shiftKey: boolean,
  toggleKey: boolean,
): FileNavigatorSelection {
  if (shiftKey) return rangeSelection(state, rows, path);
  if (toggleKey) return toggleSelection(state, path);
  return replaceSelection(path);
}

export function normalizeOperationPaths(rows: FileNavigatorRow[], selected: Set<string>): string[] {
  const ordered = rows.map((row) => row.path).filter((path) => path !== '..' && selected.has(path));
  return ordered.filter((path, index) =>
    ordered.indexOf(path) === index
    && ordered.every((candidate) => candidate === path || !path.startsWith(`${candidate}/`)));
}

export function replaceRenamedPath(
  state: FileNavigatorSelection,
  oldPath: string,
  newPath: string,
): FileNavigatorSelection {
  const selected = new Set(state.selected);
  if (selected.delete(oldPath)) selected.add(newPath);
  return {
    cursor: state.cursor === oldPath ? newPath : state.cursor,
    anchor: state.anchor === oldPath ? newPath : state.anchor,
    selected,
  };
}

function nearestVisibleAncestor(path: string, visible: Set<string>): string | null {
  let candidate = path;
  while (candidate.includes('/')) {
    candidate = dirname(candidate);
    if (visible.has(candidate)) return candidate;
  }
  return null;
}

export function reconcileSelection(
  state: FileNavigatorSelection,
  previousRows: FileNavigatorRow[],
  nextRows: FileNavigatorRow[],
): FileNavigatorSelection {
  const visible = new Set(nextRows.map((row) => row.path));
  const selected = new Set<string>();
  for (const path of state.selected) {
    if (visible.has(path)) selected.add(path);
  }
  let cursor = state.cursor;
  if (cursor !== null && !visible.has(cursor)) {
    const oldIndex = previousRows.findIndex((row) => row.path === cursor);
    cursor = nearestVisibleAncestor(cursor, visible)
      ?? nextRows[Math.min(Math.max(oldIndex, 0), Math.max(nextRows.length - 1, 0))]?.path
      ?? null;
  }
  const anchor = state.anchor !== null && visible.has(state.anchor) ? state.anchor : cursor;
  return { cursor, anchor, selected };
}

// A tree view restored from a profile, as it arrives on the navigator's payload.
export type TreeRestoreHint = {
  revision: number;
  cursor?: string;
  anchor?: string;
  selected: string[];
};

// Turn a restore hint into a selection, dropping every path with no visible row — a directory that
// vanished between the save and the launch simply doesn't come back. Exported (rather than inlined
// in the effect below) so it is testable without rendering, matching `reconcileSelection`.
export function selectionFromRestore(
  hint: TreeRestoreHint, rows: FileNavigatorRow[],
): FileNavigatorSelection {
  const visible = new Set(rows.map((row) => row.path));
  const survives = (path: string | undefined): string | null =>
    (path !== undefined && visible.has(path) ? path : null);
  return {
    cursor: survives(hint.cursor),
    anchor: survives(hint.anchor),
    selected: new Set(hint.selected.filter((path) => visible.has(path))),
  };
}

export function useFileNavigatorSelection(
  rows: FileNavigatorRow[], absoluteRoot: string, index?: number, restore?: TreeRestoreHint,
) {
  const [state, setState] = useState<FileNavigatorSelection>(EMPTY_SELECTION);
  const previousRows = useRef(rows);
  const previousRoot = useRef(absoluteRoot);
  const appliedRestore = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (previousRoot.current !== absoluteRoot) {
      previousRoot.current = absoluteRoot;
      previousRows.current = rows;
      setState(EMPTY_SELECTION);
      return;
    }
    setState((current) => reconcileSelection(current, previousRows.current, rows));
    previousRows.current = rows;
  }, [absoluteRoot, rows]);

  // A restore hint is applied once per revision, so the repeated full-state broadcasts never
  // overwrite a selection the user has changed since the launch.
  useEffect(() => {
    if (!restore || appliedRestore.current === restore.revision) return;
    appliedRestore.current = restore.revision;
    setState(selectionFromRestore(restore, rows));
  }, [restore, rows]);

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
