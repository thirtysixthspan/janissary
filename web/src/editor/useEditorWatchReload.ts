import { useEffect, useRef, type RefObject } from 'react';
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
  fetchContent: (token: string) => Promise<string>,
): void {
  const dirtyForWatchRef = useRef(dirty);
  dirtyForWatchRef.current = dirty;
  const seenMtimeRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (mtimeMs === undefined || mtimeMs === seenMtimeRef.current) return;
    const isFirstSighting = seenMtimeRef.current === undefined;
    seenMtimeRef.current = mtimeMs;
    if (isFirstSighting) return;
    if (dirtyForWatchRef.current) { conflictPendingRef.current = true; return; }
    const token = new URLSearchParams(location.search).get('token') ?? '';
    void (async () => {
      try {
        const text = await fetchContent(token);
        const line = api.stateRef.current?.cursor.line;
        api.load(text, line);
        setLastSaved(text);
      } catch {
        // The reload is best-effort — the buffer just keeps showing the last content we had.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mtimeMs]);
}
