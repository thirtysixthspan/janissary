import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { toText } from './model';
import type { EditorApi } from './useEditor';
import { useEditorWatchReload } from './useEditorWatchReload';

export type EditorFileApi = {
  dirty: boolean;
  loadError: string | null;
  saveError: string | null;
  savedFlash: boolean;
  conflictOpen: boolean;
  save: () => Promise<void>;
  overwrite: () => void;
  dismissConflict: () => void;
};

// The editor tab's file lifecycle: the initial load, save with overwrite-conflict detection, dirty
// tracking against the last-saved text, and the watched external-change reload. Split out of
// `EditorTab.tsx` so the component is left with rendering and input handling, mirroring the other
// hooks in this directory.
export function useEditorFile(client: JanusClient, editor: EditorView, api: EditorApi): EditorFileApi {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  // Set once a watched external change lands while the buffer is dirty; cleared on a successful
  // save. Drives the overwrite-conflict prompt instead of a normal save.
  const conflictPendingRef = useRef(false);

  const writeToDisk = async (text: string) => {
    setSaveError(null);
    const error = await client.saveFile(editor.url, text);
    if (error) { setSaveError(error); return; }
    setLastSaved(text);
    conflictPendingRef.current = false;
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const save = async () => {
    const s = api.stateRef.current;
    if (!s) return;
    if (conflictPendingRef.current) { setConflictOpen(true); return; }
    await writeToDisk(toText(s));
  };

  useEffect(() => {
    // A synced tab opens immediately, before its shared workspace clone exists; loading here would
    // fetch a not-yet-real file and get stuck. Wait for `sync` to leave 'provisioning' — the same
    // signal `finishOpenSynced` already flips once the workspace is ready — before fetching.
    if (editor.sync === 'provisioning') return;
    if (api.stateRef.current !== null) return;
    // A new file has nothing to read: its path is deliberately one that isn't taken yet, and stays
    // off disk until the first save, so its registered reference answers 404 by design (see
    // `open-route.ts`). Fetching it would report a real resource failure for a file the user has
    // not created yet. Start on the empty buffer that first save will write instead.
    if (editor.newFile) {
      api.load('', editor.line === undefined ? undefined : editor.line - 1);
      setLastSaved('');
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const text = await client.readFile(editor.url);
        if (!cancelled) { api.load(text, editor.line === undefined ? undefined : editor.line - 1); setLastSaved(text); }
      } catch {
        if (!cancelled) setLoadError(`Failed to load ${editor.name}`);
      }
    };
    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor identity triggers loading; refs and setters remain stable for the mounted file
  }, [editor.url, editor.name, editor.sync]);

  const dirty = useMemo(
    () => api.state !== null && lastSaved !== null && toText(api.state) !== lastSaved,
    [api.state, lastSaved],
  );

  useEditorWatchReload(editor.mtimeMs, dirty, conflictPendingRef, api, setLastSaved, client, editor.url);

  return {
    dirty,
    loadError,
    saveError,
    savedFlash,
    conflictOpen,
    save,
    overwrite: () => {
      setConflictOpen(false);
      const s = api.stateRef.current;
      if (s) void writeToDisk(toText(s));
    },
    dismissConflict: () => { setConflictOpen(false); },
  };
}
