import { useCallback, useEffect, useRef, useState } from 'react';
import { isSaveEditResult } from '@shared/plugins/image/shared';
import type { TabPluginClientCapabilities } from '../api';
import {
  activeOperations, applyOperation, emptyEditModel, outputSize,
  redoOperation, undoOperation, type ImageOperation, type Size,
} from './edit-model';
import { flattenToPng, renderOperations } from './edit-render';

// How long the saved-file name stays in the image tab's header after a save.
const CONFIRMATION_MS = 4000;

// The editor's whole state: the operation list with its undo cursor, the decoded source dimensions,
// the save intent, and the dirty handle the host's close guard reads. The canvas is re-rendered from
// the source on every change, so nothing is destructively baked in until Save.
export function useImageEdit(capabilities: TabPluginClientCapabilities) {
  const sourceRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState(emptyEditModel);
  const [sourceSize, setSourceSize] = useState<Size | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where the cursor stood when this tab last wrote a file. Dirty is the distance from there, not
  // from the original: a save leaves the edits on the canvas but settles the unsaved question, and
  // undoing back to the saved position makes the tab clean again.
  const [savedCursor, setSavedCursor] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = model.cursor !== savedCursor;
  const dimensions = sourceSize ? outputSize(sourceSize, activeOperations(model)) : null;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const compose = useCallback((): HTMLCanvasElement | null => {
    const source = sourceRef.current;
    if (!source || !sourceSize) return null;
    return renderOperations(source, sourceSize, activeOperations(model));
  }, [model, sourceRef, sourceSize]);

  // Replay onto the visible canvas. The rendered surface is the authority on its own dimensions, so
  // a rotate resizes the element rather than squashing the drawing into the old box.
  useEffect(() => {
    const canvas = canvasRef.current;
    const rendered = compose();
    if (!canvas || !rendered) return;
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    canvas.getContext('2d')?.drawImage(rendered, 0, 0);
  }, [canvasRef, compose]);

  const apply = useCallback((operation: ImageOperation) => {
    setModel((previous) => applyOperation(previous, operation));
  }, []);
  const undo = useCallback(() => { setModel(undoOperation); }, []);
  const redo = useCallback(() => { setModel(redoOperation); }, []);

  const save = useCallback(async () => {
    const rendered = compose();
    if (!rendered) return;
    const cursor = model.cursor;
    setBusy(true);
    try {
      const result = await capabilities.intent<unknown>('save-edit', { dataUrl: flattenToPng(rendered) });
      if (!isSaveEditResult(result)) {
        capabilities.reportFailure('invalid save-edit result');
        return;
      }
      // The edits stay live and the tab keeps the original's identity, so the user can keep working
      // and save again as the next number — names never chain into `photo.edit-1.edit-1.png`.
      setSavedCursor(cursor);
      setSaved(result.name);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { setSaved(null); }, CONFIRMATION_MS);
    } catch {
      // The server answered with a rejection or a write failure; it has already reported it.
    } finally {
      setBusy(false);
    }
  }, [capabilities, compose, model.cursor]);

  // A plugin tab stays mounted while hidden, so the undo chords consult the host's `active` flag
  // rather than assuming this editor is the one on screen.
  useEffect(() => {
    if (!capabilities.active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (event.shiftKey) setModel(redoOperation);
      else setModel(undoOperation);
    };
    globalThis.addEventListener('keydown', onKey);
    return () => { globalThis.removeEventListener('keydown', onKey); };
  }, [capabilities.active]);

  // Read through refs so the handle can answer for the latest state without the host having to be
  // told about every keystroke — but re-register whenever the dirty answer itself changes, because
  // that is how the tab strip learns to show or drop the unsaved marker.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const register = capabilities.registerDirtyHandle;
    if (!register) return;
    register({
      isDirty: () => dirtyRef.current,
      save: () => saveRef.current(),
      focus: () => canvasRef.current?.focus(),
    });
    return () => { register(null); };
  }, [canvasRef, capabilities, dirty]);

  const onSourceLoad = useCallback((element: HTMLImageElement) => {
    setSourceSize({ width: element.naturalWidth, height: element.naturalHeight });
  }, []);

  return {
    sourceRef, canvasRef, model, dimensions, sourceSize, dirty, saved, busy,
    apply, undo, redo, save, onSourceLoad,
  };
}
