import { useRef, useState } from 'react';
import type { FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { resolveDropTarget, type DropTarget } from './file-tree-drag';

// Ignore incidental pointer jitter between mousedown and the first real move — below this, a
// press-release is just a click, not a drag.
const DRAG_THRESHOLD_PX = 4;

type PendingConflict = { fromRelPath: string; toRelPath: string };

// Click-drag-release to move a file tree row into a directory row. Manages its own window-level
// mousemove/mouseup listeners for the duration of one gesture (mirroring the editor's own mouse
// handling in `editor/useEditorMouse.ts`) rather than reusing `drag-resize.ts`'s `startDrag`, which
// has no way to signal the drop moment back to the caller. A movement threshold gates when a
// mousedown actually becomes a drag; a plain click never sets `draggedPath`.
export function useFileTreeDrag(rows: FileTreeRow[], client: JanusClient, index: number) {
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const dropTargetRef = useRef<DropTarget>(null);
  dropTargetRef.current = dropTarget;
  const gestureRef = useRef<{ path: string; x: number; y: number; started: boolean } | null>(null);

  const hoveredRowPath = (x: number, y: number): string | null => {
    const element = document.elementFromPoint(x, y);
    const row = element instanceof Element ? element.closest('[data-path]') : null;
    return row instanceof HTMLElement ? (row.dataset.path ?? null) : null;
  };

  const send = (fromRelPath: string, toRelPath: string) => {
    client.send({ method: 'moveFileTreeItem', params: { index, fromRelPath, toRelPath } });
  };

  const drop = () => {
    const gesture = gestureRef.current;
    const target = dropTargetRef.current;
    if (gesture?.started && target) {
      if (target.conflict) setPendingConflict({ fromRelPath: gesture.path, toRelPath: target.path });
      else send(gesture.path, target.path);
    }
    gestureRef.current = null;
    setDraggedPath(null);
    setDragPosition(null);
    setDropTarget(null);
  };

  const onWindowMove = (e: MouseEvent) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (!gesture.started) {
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < DRAG_THRESHOLD_PX) return;
      gesture.started = true;
      setDraggedPath(gesture.path);
    }
    setDragPosition({ x: e.clientX, y: e.clientY });
    setDropTarget(resolveDropTarget(rowsRef.current, gesture.path, hoveredRowPath(e.clientX, e.clientY)));
  };

  const onWindowUp = () => {
    drop();
    globalThis.removeEventListener('mousemove', onWindowMove);
    globalThis.removeEventListener('mouseup', onWindowUp);
  };

  const onRowMouseDown = (row: FileTreeRow, e: React.MouseEvent) => {
    if (row.path === '..') return;
    e.preventDefault();
    gestureRef.current = { path: row.path, x: e.clientX, y: e.clientY, started: false };
    globalThis.addEventListener('mousemove', onWindowMove);
    globalThis.addEventListener('mouseup', onWindowUp);
  };

  const confirmOverwrite = () => {
    if (pendingConflict) send(pendingConflict.fromRelPath, pendingConflict.toRelPath);
    setPendingConflict(null);
  };

  const cancelConflict = () => setPendingConflict(null);

  return { draggedPath, dragPosition, dropTarget, pendingConflict, onRowMouseDown, drop, confirmOverwrite, cancelConflict };
}
