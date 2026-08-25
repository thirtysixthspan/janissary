import { useRef, useState, type RefObject } from 'react';
import type React from 'react';
import type { FileNavigatorRow } from '@shared/protocol';
import { normalizeOperationPaths, type useFileNavigatorSelection } from './useFileNavigatorSelection';
import type { useFileNavigatorDrag } from './useFileNavigatorDrag';

const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

// The right-clicked row and the pointer point the menu opens at, or null when no menu is open.
export type PendingContextMenu = { row: FileNavigatorRow; x: number; y: number };

type RowActions = {
  reroot: () => void;
  toggle: (path: string) => void;
  openFile: (path: string, edit: boolean) => void;
};

type Params = {
  rows: FileNavigatorRow[];
  selection: ReturnType<typeof useFileNavigatorSelection>;
  drag: ReturnType<typeof useFileNavigatorDrag>;
  containerRef: RefObject<HTMLDivElement | null>;
  actions: RowActions;
};

// The file navigator tree's pointer handlers — mouse down (which starts a drag and decides what the
// press selects), click, double-click, and right-click — extracted from `FileNavigatorTab.tsx` so
// that component stays under the file-size limit, the same move `useFileNavigatorKeyDown.ts` and
// `FileNavigatorOverlays.tsx` already represent. Also owns the pending context menu, which is a
// single piece of state with one setter and one clear and so needs no module of its own.
export function useFileNavigatorRowEvents({ rows, selection, drag, containerRef, actions }: Params) {
  const pointerHandledRef = useRef<string | null>(null);
  const [menu, setMenu] = useState<PendingContextMenu | null>(null);

  const onRowMouseDown = (row: FileNavigatorRow, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest('.files-rename-input')) return;
    pointerHandledRef.current = row.path;
    const modified = event.shiftKey || event.metaKey || event.ctrlKey;
    const keepSelection = !modified && selection.selected.has(row.path) && row.path !== '..';
    const next = keepSelection
      ? selection
      : selection.pointer(row.path, event.shiftKey, event.metaKey || event.ctrlKey);
    const sourcePaths = rows.map((candidate) => candidate.path)
      .filter((path) => path !== '..' && next.selected.has(path));
    drag.onRowMouseDown(row, event, sourcePaths, normalizeOperationPaths(rows, next.selected));
    containerRef.current?.focus();
  };

  const onRowClick = (row: FileNavigatorRow) => {
    if (pointerHandledRef.current === row.path) pointerHandledRef.current = null;
    else selection.replace(row.path);
    containerRef.current?.focus();
  };

  const onRowDoubleClick = (row: FileNavigatorRow, shiftKey: boolean) => {
    if (row.path === '..') actions.reroot();
    else if (row.dir) actions.toggle(row.path);
    else actions.openFile(row.path, MARKDOWN_EXTENSION.test(row.path) !== shiftKey);
  };

  // Right-click raises the menu for the clicked row and leaves the selection exactly as it was, so
  // the menu can act on a row that isn't part of it.
  const onRowContextMenu = (row: FileNavigatorRow, event: React.MouseEvent) => {
    event.preventDefault();
    setMenu({ row, x: event.clientX, y: event.clientY });
  };

  return {
    menu,
    closeMenu: () => setMenu(null),
    onRowMouseDown,
    onRowClick,
    onRowDoubleClick,
    onRowContextMenu,
  };
}
