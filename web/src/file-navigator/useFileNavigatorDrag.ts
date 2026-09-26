import { useEffect, useRef, useState, type RefObject } from 'react';
import type { FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { parentPath, resolveDropTarget, type DropTarget } from './file/navigator-drag';
import { hoveredEditor, hoveredElement, hoveredHarnessPty, hoveredRowInfo } from './drag-hover';
import { joinCommandPaths, joinDropFileNames } from './file/navigator-relative-path';
import { useFileNavigatorMoveOperations } from './useFileNavigatorMoveOperations';
import type { CommandInputDropHandle } from '../shared/drop-handles';
import { editorDropHandle, harnessDropHandle } from '../shared/drop-registry';

const DRAG_THRESHOLD_PX = 4;

type Gesture = {
  leadPath: string;
  sourcePaths: string[];
  operationPaths: string[];
  x: number;
  y: number;
  started: boolean;
};

export type FileNavigatorDragOptions = {
  absoluteRoot: string;
  displayRoot: string;
  targetCwd: string;
  dropRef?: RefObject<CommandInputDropHandle | null>;
  remoteHost?: string;
};

export function useFileNavigatorDrag(
  rows: FileNavigatorRow[],
  client: JanusClient,
  label: string,
  { absoluteRoot, displayRoot, targetCwd, dropRef, remoteHost }: FileNavigatorDragOptions,
) {
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [draggedCount, setDraggedCount] = useState(0);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const moves = useFileNavigatorMoveOperations(client, label);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const dropTargetRef = useRef<DropTarget>(null);
  dropTargetRef.current = dropTarget;
  const gestureRef = useRef<Gesture | null>(null);
  // The exact listener-removal closure for the live gesture, if any. One disposer serves every way
  // a gesture ends — mouse-up, blur, Escape, the public `drop`, and unmount — so a gesture can
  // never outlive the surface that started it.
  const endGestureRef = useRef<(() => void) | null>(null);
  const overCommandBarRef = useRef(false);
  const overEditorRef = useRef<string | null>(null);
  const overHarnessRef = useRef<string | null>(null);

  const releaseGestureListeners = () => {
    endGestureRef.current?.();
    endGestureRef.current = null;
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
    overEditorRef.current = null;
    overHarnessRef.current = null;
  };
  const drop = () => {
    const gesture = gestureRef.current;
    try {
      if (gesture?.started && overCommandBarRef.current) {
        dropRef?.current?.insertAtCaret(joinDropFileNames(absoluteRoot, gesture.sourcePaths, remoteHost, ' '));
        return;
      }
      // Keyed by the label on the editor body under the pointer, so the drop lands in that editor or
      // nowhere — never in another editor that happens to hold focus in the other split pane.
      const editorLabel = overEditorRef.current;
      if (gesture?.started && editorLabel !== null) {
        editorDropHandle(editorLabel)?.insertAtCaret(
          joinDropFileNames(absoluteRoot, gesture.sourcePaths, remoteHost, '\n'),
        );
        return;
      }
      // A harness terminal is a command line, so the paths arrive in the same space-separated,
      // working-directory-relative form the command bar takes: newlines would submit all but the last
      // of them to the harness as commands.
      const harnessPty = overHarnessRef.current;
      if (gesture?.started && harnessPty) {
        harnessDropHandle(harnessPty)?.insertAtCaret(
          joinCommandPaths(absoluteRoot, gesture.sourcePaths, targetCwd, remoteHost),
        );
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
    } finally {
      // The gesture ends exactly once however the drop completes: a throwing destination must not
      // retain the window listeners.
      resetGestureState();
      releaseGestureListeners();
    }
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
    const overBar = hoveredElement(event.clientX, event.clientY, '[data-command-bar]') !== null;
    if (overBar !== overCommandBarRef.current) setCommandBarHighlighted(overBar);
    const overEditor = overBar ? null : hoveredEditor(event.clientX, event.clientY);
    overEditorRef.current = overEditor;
    const overHarness = overBar || overEditor !== null ? null : hoveredHarnessPty(event.clientX, event.clientY);
    overHarnessRef.current = overHarness;
    const row = hoveredRowInfo(event.clientX, event.clientY);
    const otherRoot = row.root !== undefined && row.root !== absoluteRoot;
    setDropTarget(overBar || overEditor !== null || overHarness !== null || otherRoot ? null : resolveDropTarget(
      rowsRef.current, gesture.operationPaths, row.path, remoteHost, row.host,
    ));
  };
  const onWindowUp = () => {
    drop();
  };
  const onWindowBlur = () => {
    resetGestureState();
    releaseGestureListeners();
  };
  const onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !gestureRef.current) return;
    resetGestureState();
    releaseGestureListeners();
  };
  const onRowMouseDown = (
    row: FileNavigatorRow,
    event: React.MouseEvent,
    sourcePaths: string[] = [row.path],
    operationPaths: string[] = sourcePaths,
  ) => {
    if ((event.button !== undefined && event.button !== 0) || row.path === '..') return;
    event.preventDefault();
    // Replace any previous gesture before registering another: its listeners come down with it.
    releaseGestureListeners();
    gestureRef.current = {
      leadPath: row.path,
      sourcePaths,
      operationPaths,
      x: event.clientX,
      y: event.clientY,
      started: false,
    };
    endGestureRef.current = () => {
      globalThis.removeEventListener('mousemove', onWindowMove);
      globalThis.removeEventListener('mouseup', onWindowUp);
      globalThis.removeEventListener('blur', onWindowBlur);
      globalThis.removeEventListener('keydown', onWindowKeyDown);
    };
    globalThis.addEventListener('mousemove', onWindowMove);
    globalThis.addEventListener('mouseup', onWindowUp);
    globalThis.addEventListener('blur', onWindowBlur);
    globalThis.addEventListener('keydown', onWindowKeyDown);
  };

  // Unmount during a drag cancels it without moving files or inserting text: clear the retained
  // gesture and remove any command-bar highlight directly, without setting local React state after
  // teardown.
  useEffect(() => () => {
    gestureRef.current = null;
    releaseGestureListeners();
    overCommandBarRef.current = false;
    dropRef?.current?.setDropHighlighted(false);
    overEditorRef.current = null;
    overHarnessRef.current = null;
  }, [dropRef]);

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
