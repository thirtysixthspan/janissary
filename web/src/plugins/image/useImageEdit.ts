import { useCallback, useEffect, useRef, useState } from 'react';
import { isSaveEditResult } from '@shared/plugins/image/shared';
import type { TabPluginClientCapabilities } from '../api';
import {
  activeOperations, applyOperation, emptyEditModel, outputSize,
  redoOperation, sameOperations, undoOperation, type EditModel, type ImageOperation, type Size,
} from './edit-model';
import { flattenToPng, renderOperations } from './edit-render';

// How long the saved-file name stays in the image tab's header after a save.
const CONFIRMATION_MS = 4000;
const EDIT_STATE_KEY = 'image-edit';

type ImageEditSnapshot = {
  model: EditModel;
  sourceSize: Size | null;
  savedOperations: readonly ImageOperation[];
};

const EMPTY_SNAPSHOT: ImageEditSnapshot = {
  model: emptyEditModel,
  sourceSize: null,
  savedOperations: [],
};

// The editor's whole state: the operation list with its undo cursor, the decoded source dimensions,
// the save intent, and the dirty handle the host's close guard reads. The canvas is re-rendered from
// the source on every change, so nothing is destructively baked in until Save.
export function useImageEdit(capabilities: TabPluginClientCapabilities) {
  const sourceRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [initialSnapshot] = useState(
    () => capabilities.tabState?.get<ImageEditSnapshot>(EDIT_STATE_KEY) ?? EMPTY_SNAPSHOT,
  );
  const snapshotRef = useRef(initialSnapshot);
  const modelRef = useRef(initialSnapshot.model);
  const savedOperationsRef = useRef(initialSnapshot.savedOperations);
  const [model, setModel] = useState(initialSnapshot.model);
  const [sourceSize, setSourceSize] = useState<Size | null>(initialSnapshot.sourceSize);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The operations this tab last wrote, not the cursor position they stood at. Dirty is the distance
  // from that sequence, not from the original: a save leaves the edits on the canvas but settles the
  // unsaved question, and undoing back to the saved sequence makes the tab clean again. A cursor
  // number cannot stand in for the sequence — editing after an undo rewrites the list beneath the
  // same position, which is how a flip applied over an undone save used to read as saved.
  const [savedOperations, setSavedOperations] = useState<readonly ImageOperation[]>(initialSnapshot.savedOperations);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = activeOperations(model);
  const dirty = !sameOperations(active, savedOperations);
  const dimensions = sourceSize ? outputSize(sourceSize, active) : null;

  const writeSnapshot = useCallback((update: Partial<ImageEditSnapshot>) => {
    const current = capabilities.tabState?.get<ImageEditSnapshot>(EDIT_STATE_KEY) ?? snapshotRef.current;
    const next = { ...current, ...update };
    snapshotRef.current = next;
    capabilities.tabState?.set(EDIT_STATE_KEY, next);
    return next;
  }, [capabilities.tabState]);

  useEffect(() => {
    const syncSnapshot = () => {
      const snapshot = capabilities.tabState?.get<ImageEditSnapshot>(EDIT_STATE_KEY);
      if (!snapshot) return;
      snapshotRef.current = snapshot;
      if (snapshot.savedOperations === savedOperationsRef.current) return;
      savedOperationsRef.current = snapshot.savedOperations;
      setSavedOperations(snapshot.savedOperations);
    };
    const unsubscribe = capabilities.tabState?.subscribe?.(syncSnapshot);
    syncSnapshot();
    return unsubscribe;
  }, [capabilities.tabState]);

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

  const updateModel = useCallback((update: (previous: EditModel) => EditModel) => {
    const next = update(modelRef.current);
    modelRef.current = next;
    setModel(next);
    writeSnapshot({ model: next });
  }, [writeSnapshot]);
  const apply = useCallback((operation: ImageOperation) => {
    updateModel((previous) => applyOperation(previous, operation));
  }, [updateModel]);
  const undo = useCallback(() => { updateModel(undoOperation); }, [updateModel]);
  const redo = useCallback(() => { updateModel(redoOperation); }, [updateModel]);

  // Throws on every outcome that leaves the edits unwritten. The host's close guard closes a tab on
  // a resolved save (see `TabDirtyHandle`), so resolving after a failed write would discard the
  // operation list the user was asked about.
  const save = useCallback(async () => {
    const rendered = compose();
    if (!rendered) throw new Error('No rendered image to save');
    // The sequence this request carries, captured before the await. Recording the latest model on
    // completion instead would mark an edit made while the save was in flight as saved.
    const sent = activeOperations(model);
    setBusy(true);
    try {
      const result = await capabilities.intent<unknown>('save-edit', { dataUrl: flattenToPng(rendered) });
      if (!isSaveEditResult(result)) {
        capabilities.reportFailure('invalid save-edit result');
        throw new Error('invalid save-edit result');
      }
      // The edits stay live and the tab keeps the original's identity, so the user can keep working
      // and save again as the next number — names never chain into `photo.edit-1.edit-1.png`.
      const snapshot = writeSnapshot({ savedOperations: sent });
      savedOperationsRef.current = snapshot.savedOperations;
      setSavedOperations(snapshot.savedOperations);
      setSaved(result.name);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { setSaved(null); }, CONFIRMATION_MS);
    } finally {
      setBusy(false);
    }
  }, [capabilities, compose, model, writeSnapshot]);

  // A plugin tab stays mounted while hidden, so the undo chords consult the host's `active` flag
  // rather than assuming this editor is the one on screen.
  useEffect(() => {
    if (!capabilities.active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (event.shiftKey) updateModel(redoOperation);
      else updateModel(undoOperation);
    };
    globalThis.addEventListener('keydown', onKey);
    return () => { globalThis.removeEventListener('keydown', onKey); };
  }, [capabilities.active, updateModel]);

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
    const size = { width: element.naturalWidth, height: element.naturalHeight };
    setSourceSize(size);
    writeSnapshot({ sourceSize: size });
  }, [writeSnapshot]);

  return {
    sourceRef, canvasRef, model, dimensions, sourceSize, dirty, saved, busy,
    apply, undo, redo, save, onSourceLoad,
  };
}
