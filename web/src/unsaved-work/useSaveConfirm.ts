import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveChoice } from './SaveChangesDialog';

// Which tab a dialog is asking about, held as its label rather than its position. The tab list is
// server-driven and replaced whole on every change, so a position captured when the dialog opened
// can name a different tab by the time a button is pressed — a label cannot. The request is either
// a single-tab close or the quit walk, which carries the labels already answered and the choice
// made on the label it is asking about now.
export type SaveConfirmRequest =
  | { kind: 'close'; label: string }
  | { kind: 'quit'; label: string; answered: ReadonlySet<string>; selection: SaveChoice };

export function useSaveConfirm() {
  const [request, setRequest] = useState<SaveConfirmRequest | null>(null);
  const labelRef = useRef('');
  const generationRef = useRef(0);
  const pendingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => { generationRef.current++; }, []);

  const openClose = useCallback((label: string) => {
    generationRef.current++;
    pendingRef.current = false;
    setSaving(false);
    labelRef.current = label;
    setRequest({ kind: 'close', label });
  }, []);

  const openQuitWalk = useCallback((label: string) => {
    generationRef.current++;
    pendingRef.current = false;
    setSaving(false);
    labelRef.current = label;
    setRequest({ kind: 'quit', label, answered: new Set<string>(), selection: 'save' });
  }, []);

  // The previous label and selection are read from the request in the updater rather than from
  // `labelRef` or the captured request, so a selection made after this handler was created still
  // carries to the next label.
  const advanceQuitWalk = useCallback((nextLabel: string) => {
    if (request?.kind !== 'quit') return;
    generationRef.current++;
    pendingRef.current = false;
    setSaving(false);
    labelRef.current = nextLabel;
    setRequest((previous) => {
      if (previous?.kind !== 'quit') return previous;
      const answered = new Set(previous.answered);
      answered.add(previous.label);
      return { kind: 'quit', label: nextLabel, answered, selection: previous.selection };
    });
  }, [request]);

  const dismiss = useCallback(() => {
    generationRef.current++;
    pendingRef.current = false;
    setSaving(false);
    setRequest(null);
  }, []);

  const select = useCallback((selection: SaveChoice) => {
    setRequest((previous) => (previous?.kind === 'quit' ? { ...previous, selection } : previous));
  }, []);

  const startSave = useCallback(() => {
    if (request === null || pendingRef.current) return;
    pendingRef.current = true;
    setSaving(true);
    return { label: labelRef.current, generation: generationRef.current };
  }, [request]);

  const isCurrentAttempt = useCallback((attempt: { generation: number }) =>
    attempt.generation === generationRef.current, []);

  return {
    request, saveConfirmOpen: request !== null, saving, labelRef, startSave, isCurrentAttempt,
    openClose, openQuitWalk, advanceQuitWalk, dismiss, select,
  };
}
