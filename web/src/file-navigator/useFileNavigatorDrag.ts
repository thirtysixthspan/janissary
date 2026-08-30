import { useRef, useState, type RefObject } from 'react';
import type { FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { parentPath, resolveDropTarget, type DropTarget } from './file-navigator-drag';
import { joinCommandPaths, remoteNavigatorPath } from './file-navigator-relative-path';
import { useFileNavigatorMoveOperations } from './useFileNavigatorMoveOperations';
import type { CommandInputDropHandle, EditorDropHandle } from '../drop-handles';

const DRAG_THRESHOLD_PX = 4;

type Gesture = {
  leadPath: string;
  sourcePaths: string[];
  operationPaths: string[];
  x: number;
  y: number;
  started: boolean;
};

export function useFileNavigatorDrag(
  rows: FileNavigatorRow[],
  client: JanusClient,
  index: number,
  absoluteRootOrDropRef: string | RefObject<CommandInputDropHandle | null> = '',
  displayRootOrEditorRef: string | RefObject<EditorDropHandle | null> = '',
  targetCwd = '',
  providedDropRef?: RefObject<CommandInputDropHandle | null>,
  providedEditorDropRef?: RefObject<EditorDropHandle | null>,
  remoteHost?: string,
) {
  const legacy = typeof absoluteRootOrDropRef !== 'string' || typeof displayRootOrEditorRef !== 'string';
  const absoluteRoot = legacy ? '' : absoluteRootOrDropRef;
  const displayRoot = typeof displayRootOrEditorRef === 'string' ? displayRootOrEditorRef : '';
  const dropRef = legacy && typeof absoluteRootOrDropRef !== 'string'
    ? absoluteRootOrDropRef
    : providedDropRef;
  const editorDropRef = legacy
    ? displayRootOrEditorRef as RefObject<EditorDropHandle | null>
    : providedEditorDropRef;
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [draggedCount, setDraggedCount] = useState(0);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const moves = useFileNavigatorMoveOperations(client, index);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const dropTargetRef = useRef<DropTarget>(null);
  dropTargetRef.current = dropTarget;
  const gestureRef = useRef<Gesture | null>(null);
  const overCommandBarRef = useRef(false);
  const overEditorRef = useRef(false);

  const hovered = (x: number, y: number, selector: string): Element | null => {
    const element = document.elementFromPoint(x, y);
    return element instanceof Element ? element.closest(selector) : null;
  };
  const hoveredRowInfo = (
    x: number, y: number,
  ): { path: string | null; host?: string; root?: string } => {
    const row = hovered(x, y, '[data-path]');
    if (!(row instanceof HTMLElement)) return { path: null };
    const tree = row.closest('.files-tab');
    const host = tree instanceof HTMLElement ? tree.dataset.filesHost || undefined : undefined;
    const root = tree instanceof HTMLElement ? tree.dataset.filesRoot : undefined;
    return { path: row.dataset.path ?? null, host, root };
  };
  const setCommandBarHighlighted = (active: boolean) => {
    overCommandBarRef.current = active;
    dropRef?.current?.setDropHighlighted(active);
  };
  const resetGestureState = () => {
    gestureRef.current = null;
    setDraggedPath(null);
    setDraggedCount(0);
    setDragPosition(null);
    setDropTarget(null);
    setCommandBarHighlighted(false);
    overEditorRef.current = false;
  };
  const drop = () => {
    const gesture = gestureRef.current;
    if (gesture?.started && overCommandBarRef.current) {
      dropRef?.current?.insertAtCaret(joinCommandPaths(absoluteRoot, gesture.sourcePaths, targetCwd, remoteHost));
      resetGestureState();
      return;
    }
    if (gesture?.started && overEditorRef.current) {
      editorDropRef?.current?.insertAtCaret(
        remoteHost
          ? gesture.sourcePaths.map((path) => remoteNavigatorPath(remoteHost, absoluteRoot, path)).join('\n')
          : gesture.sourcePaths.join('\n'),
      );
      resetGestureState();
      return;
    }
    const target = dropTargetRef.current;
    if (gesture?.started && target) {
      const targetRow = rowsRef.current.find((row) => row.path === target.path);
      moves.requestMove(
        gesture.operationPaths.filter((source) => parentPath(source) !== target.path),
        target.path,
        targetRow?.name ?? (target.path || displayRoot),
        target.conflict,
      );
    }
    resetGestureState();
  };
  const removeGestureListeners = () => {
    globalThis.removeEventListener('mousemove', onWindowMove);
    globalThis.removeEventListener('mouseup', onWindowUp);
    globalThis.removeEventListener('blur', onWindowBlur);
    globalThis.removeEventListener('keydown', onWindowKeyDown);
  };
  const onWindowMove = (event: MouseEvent) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (!gesture.started) {
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < DRAG_THRESHOLD_PX) return;
      gesture.started = true;
      setDraggedPath(gesture.leadPath);
      setDraggedCount(gesture.sourcePaths.length);
    }
    setDragPosition({ x: event.clientX, y: event.clientY });
    const overBar = hovered(event.clientX, event.clientY, '[data-command-bar]') !== null;
    if (overBar !== overCommandBarRef.current) setCommandBarHighlighted(overBar);
    const overEditor = !overBar && hovered(event.clientX, event.clientY, '[data-editor-drop]') !== null;
    overEditorRef.current = overEditor;
    const row = hoveredRowInfo(event.clientX, event.clientY);
    const otherRoot = row.root !== undefined && row.root !== absoluteRoot;
    setDropTarget(overBar || overEditor || otherRoot ? null : resolveDropTarget(
      rowsRef.current, gesture.operationPaths, row.path, remoteHost, row.host,
    ));
  };
  const onWindowUp = () => {
    drop();
    removeGestureListeners();
  };
  const onWindowBlur = () => {
    resetGestureState();
    removeGestureListeners();
  };
  const onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !gestureRef.current) return;
    resetGestureState();
    removeGestureListeners();
  };
  const onRowMouseDown = (
    row: FileNavigatorRow,
    event: React.MouseEvent,
    sourcePaths: string[] = [row.path],
    operationPaths: string[] = sourcePaths,
  ) => {
    if ((event.button !== undefined && event.button !== 0) || row.path === '..') return;
    event.preventDefault();
    gestureRef.current = {
      leadPath: row.path,
      sourcePaths,
      operationPaths,
      x: event.clientX,
      y: event.clientY,
      started: false,
    };
    globalThis.addEventListener('mousemove', onWindowMove);
    globalThis.addEventListener('mouseup', onWindowUp);
    globalThis.addEventListener('blur', onWindowBlur);
    globalThis.addEventListener('keydown', onWindowKeyDown);
  };

  return {
    draggedPath,
    draggedCount,
    dragPosition,
    dropTarget,
    onRowMouseDown,
    drop,
    ...moves,
  };
}
