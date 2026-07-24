import { useRef, useState, type RefObject } from 'react';
import type { FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { resolveDropTarget, type DropTarget } from './file-navigator-drag';
import type { CommandInputDropHandle } from './CommandInput';

// Ignore incidental pointer jitter between mousedown and the first real move — below this, a
// press-release is just a click, not a drag.
const DRAG_THRESHOLD_PX = 4;

// `source` tracks which RPC produced the conflict, so `confirmOverwrite` retries the right one:
// a drag-drop move sends its own fromRelPath/toRelPath, while an undo/redo retry just resends
// itself with `overwrite: true` — the server already knows which stack entry is pending.
type PendingConflict = { fromRelPath: string; toRelPath: string; source: 'move' | 'undo' | 'redo' };

// Click-drag-release to move a file tree row into a directory row. Manages its own window-level
// mousemove/mouseup listeners for the duration of one gesture (mirroring the editor's own mouse
// handling in `editor/useEditorMouse.ts`) rather than reusing `drag-resize.ts`'s `startDrag`, which
// has no way to signal the drop moment back to the caller. A movement threshold gates when a
// mousedown actually becomes a drag; a plain click never sets `draggedPath`.
export function useFileNavigatorDrag(
  rows: FileTreeRow[],
  client: JanusClient,
  index: number,
  dropRef?: RefObject<CommandInputDropHandle | null>,
) {
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const dropTargetRef = useRef<DropTarget>(null);
  dropTargetRef.current = dropTarget;
  const gestureRef = useRef<{ path: string; x: number; y: number; started: boolean } | null>(null);
  const overCommandBarRef = useRef(false);

  const hoveredRowPath = (x: number, y: number): string | null => {
    const element = document.elementFromPoint(x, y);
    const row = element instanceof Element ? element.closest('[data-path]') : null;
    return row instanceof HTMLElement ? (row.dataset.path ?? null) : null;
  };

  // True when the pointer is over the command bar's hit-test marker — present only while
  // `CommandInput` is mounted for the currently active tab (see Decision 4 in the drag-to-command-
  // bar plan). Not present for a harness tab, a docked file tree tab, or while transcript search
  // has replaced the command bar.
  const hoveredCommandBar = (x: number, y: number): boolean => {
    const element = document.elementFromPoint(x, y);
    return element instanceof Element && element.closest('[data-command-bar]') !== null;
  };

  const send = (fromRelPath: string, toRelPath: string) => {
    client.send({ method: 'moveFileTreeItem', params: { index, fromRelPath, toRelPath } });
  };

  const setCommandBarHighlighted = (active: boolean) => {
    overCommandBarRef.current = active;
    dropRef?.current?.setDropHighlighted(active);
  };

  const resetGestureState = () => {
    gestureRef.current = null;
    setDraggedPath(null);
    setDragPosition(null);
    setDropTarget(null);
    setCommandBarHighlighted(false);
  };

  const drop = () => {
    const gesture = gestureRef.current;
    if (gesture?.started && overCommandBarRef.current) {
      dropRef?.current?.insertAtCaret(gesture.path);
      resetGestureState();
      return;
    }
    const target = dropTargetRef.current;
    if (gesture?.started && target) {
      if (target.conflict) setPendingConflict({ fromRelPath: gesture.path, toRelPath: target.path, source: 'move' });
      else send(gesture.path, target.path);
    }
    resetGestureState();
  };

  const removeGestureListeners = () => {
    globalThis.removeEventListener('mousemove', onWindowMove);
    globalThis.removeEventListener('mouseup', onWindowUp);
    globalThis.removeEventListener('blur', onWindowBlur);
    globalThis.removeEventListener('keydown', onWindowKeyDown);
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
    const overBar = hoveredCommandBar(e.clientX, e.clientY);
    if (overBar !== overCommandBarRef.current) setCommandBarHighlighted(overBar);
    setDropTarget(overBar ? null : resolveDropTarget(rowsRef.current, gesture.path, hoveredRowPath(e.clientX, e.clientY)));
  };

  const onWindowUp = () => {
    drop();
    removeGestureListeners();
  };

  // A blur never commits a move, regardless of what's under the pointer — the window losing focus
  // (switching apps, virtual desktops) is the only signal we get for a release that lands entirely
  // outside the browser window, where no mouseup event reaches the page at all.
  const onWindowBlur = () => {
    resetGestureState();
    removeGestureListeners();
  };

  // Same cancel-without-committing path as blur, triggered by Escape instead of a focus change.
  const onWindowKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !gestureRef.current) return;
    resetGestureState();
    removeGestureListeners();
  };

  const onRowMouseDown = (row: FileTreeRow, e: React.MouseEvent) => {
    if (row.path === '..') return;
    e.preventDefault();
    gestureRef.current = { path: row.path, x: e.clientX, y: e.clientY, started: false };
    globalThis.addEventListener('mousemove', onWindowMove);
    globalThis.addEventListener('mouseup', onWindowUp);
    globalThis.addEventListener('blur', onWindowBlur);
    globalThis.addEventListener('keydown', onWindowKeyDown);
  };

  const confirmOverwrite = () => {
    if (!pendingConflict) return;
    if (pendingConflict.source === 'move') send(pendingConflict.fromRelPath, pendingConflict.toRelPath);
    else client.send({ method: pendingConflict.source === 'undo' ? 'undoFileTreeItem' : 'redoFileTreeItem', params: { index, overwrite: true } });
    setPendingConflict(null);
  };

  const cancelConflict = () => setPendingConflict(null);

  type UndoRedoResult = { conflict?: { fromRelPath: string; toRelPath: string } };

  const sendUndo = async () => {
    const result = await client.request<UndoRedoResult>({ method: 'undoFileTreeItem', params: { index } });
    if (result.conflict) setPendingConflict({ ...result.conflict, source: 'undo' });
  };

  const sendRedo = async () => {
    const result = await client.request<UndoRedoResult>({ method: 'redoFileTreeItem', params: { index } });
    if (result.conflict) setPendingConflict({ ...result.conflict, source: 'redo' });
  };

  return { draggedPath, dragPosition, dropTarget, pendingConflict, onRowMouseDown, drop, confirmOverwrite, cancelConflict, sendUndo, sendRedo };
}
