import { useEffect, useRef } from 'react';
import type { EditorState } from './model';
import { toText } from './model';
import type { JanusClient } from '../ws';

// Longer than syntax highlighting's local recompute (100ms): a monitor observing the draft doesn't
// need sub-second freshness, and this spares the server needless round trips during fast typing.
const DEBOUNCE_MS = 500;

// Debounced, fire-and-forget sync of one editor tab's buffer to the server as transient draft
// state. Keyed on `state`, so every buffer-mutation route is covered without enumeration — typing,
// paste, undo/redo, kill/yank, and the external-change reload. Cursor-only moves produce a new
// `state` too, but are filtered out by comparing against the last-synced text.
export function useEditorSync(state: EditorState | null, url: string, client: JanusClient): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const text = toText(state);
    // Seed from the first non-null state without sending: the initial load matches what's on disk.
    if (lastSyncedRef.current === null) { lastSyncedRef.current = text; return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (text === lastSyncedRef.current) return;
      lastSyncedRef.current = text;
      client.editorSync(url, text);
    }, DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state, url, client]);
}
