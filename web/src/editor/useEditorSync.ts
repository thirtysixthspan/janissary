import { useEffect, useRef, useState } from 'react';
import type { EditorState } from './model';
import { toText } from './model';
import type { JanusClient } from '../ws';
import { DraftSync } from './draft-sync';

// Longer than syntax highlighting's local recompute (100ms): a monitor observing the draft doesn't
// need sub-second freshness, and this spares the server needless round trips during fast typing.
const DEBOUNCE_MS = 500;

// Debounced, acknowledged sync of one editor tab's buffer to the server as transient draft
// state. Keyed on `state`, so every buffer-mutation route is covered without enumeration — typing,
// paste, undo/redo, kill/yank, and the external-change reload. Cursor-only moves produce a new
// `state` too, but are filtered out by comparing against the latest desired text.
export function useEditorSync(state: EditorState | null, url: string, client: JanusClient): void {
  const [sync] = useState(() => new DraftSync(DEBOUNCE_MS));
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (stateRef.current) sync.update(toText(stateRef.current));
    sync.attach(async (text) => {
      const result = await client.editorSync(url, text);
      return result.ok;
    }, client.connectionStatus === 'connected');
    const unsubscribe = client.onConnectionStatus((phase) => sync.setConnected(phase === 'connected'));
    return () => { unsubscribe(); sync.detach(); };
  }, [sync, client, url]);

  useEffect(() => {
    if (state) sync.update(toText(state));
  }, [state, sync]);
}
