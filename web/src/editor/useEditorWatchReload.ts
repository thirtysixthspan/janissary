import { useEffect, useRef, type RefObject } from 'react';
import type { JanusClient } from '../ws';
import type { EditorApi } from './useEditor';

// Live-reload from disk when another process changes the file, as long as the user hasn't
// touched the buffer yet; otherwise remember the conflict for the next save attempt. Split out of
// `EditorTab.tsx` to stay under the 200-line file cap, mirroring the file's other extracted hooks.
export function useEditorWatchReload(
  mtimeMs: number | undefined,
  dirty: boolean,
  conflictPendingRef: RefObject<boolean>,
  api: EditorApi,
  setLastSaved: (text: string) => void,
  client: JanusClient,
  url: string,
): void {
  const dirtyForWatchRef = useRef(dirty);
  dirtyForWatchRef.current = dirty;
  const seenMtimeRef = useRef<number | undefined>(mtimeMs);
  const reloadSequenceRef = useRef(0);
  useEffect(() => {
    if (mtimeMs === undefined || mtimeMs === seenMtimeRef.current) return;
    seenMtimeRef.current = mtimeMs;
    reloadSequenceRef.current += 1;
    if (dirtyForWatchRef.current) { conflictPendingRef.current = true; return; }
    const sequence = reloadSequenceRef.current;
    void (async () => {
      try {
        const text = await client.readFile(url);
        if (sequence !== reloadSequenceRef.current) return;
        if (dirtyForWatchRef.current) { conflictPendingRef.current = true; return; }
        const line = api.stateRef.current?.cursor.line;
        api.load(text, line);
        setLastSaved(text);
      } catch {
        // The reload is best-effort — the buffer just keeps showing the last content we had.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs hold mutable editor state; mtimeMs is the external-change trigger
  }, [mtimeMs]);
}
