import { useEffect, useRef, type RefObject } from 'react';
import type { JanusClient } from '../shared/ws/ws';
import type { EditorApi } from './useEditor';

type DocumentRead = { current: { generation: number; url: string } };

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
  initialLine: number | undefined,
  documentRead: DocumentRead,
): void {
  const dirtyForWatchRef = useRef(dirty);
  dirtyForWatchRef.current = dirty;
  const seenMtimeRef = useRef<number | undefined>(mtimeMs);
  useEffect(() => {
    if (mtimeMs === seenMtimeRef.current) return;
    seenMtimeRef.current = mtimeMs;
    if (mtimeMs === undefined) return;
    const activeDocumentRead = documentRead.current;
    const generation = ++activeDocumentRead.generation;
    activeDocumentRead.url = url;
    if (dirtyForWatchRef.current) { conflictPendingRef.current = true; return; }
    void (async () => {
      try {
        const text = await client.readFile(url);
        if (generation !== activeDocumentRead.generation || activeDocumentRead.url !== url) return;
        if (dirtyForWatchRef.current) { conflictPendingRef.current = true; return; }
        const line = api.stateRef.current?.cursor.line ?? (initialLine === undefined ? undefined : initialLine - 1);
        api.load(text, line);
        setLastSaved(text);
      } catch {
        // The reload is best-effort — the buffer just keeps showing the last content we had.
      }
    })();
    return () => {
      if (activeDocumentRead.generation === generation) activeDocumentRead.generation += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs hold mutable editor state; mtimeMs is the external-change trigger
  }, [mtimeMs, url]);
}
