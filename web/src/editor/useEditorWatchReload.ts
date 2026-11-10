import { useEffect, useRef, type RefObject } from 'react';
import { useLatestRef } from '../shared/useLatestRef';
import type { JanusClient } from '../shared/ws/ws';
import type { DocumentReads } from './document-reads';
import type { EditorApi } from './useEditor';

export type EditorWatchReloadOptions = {
  mtimeMs: number | undefined;
  dirty: boolean;
  conflictPendingRef: RefObject<boolean>;
  api: EditorApi;
  setBaseline: (text: string) => void;
  client: JanusClient;
  url: string;
  initialLine: number | undefined;
  reads: DocumentReads;
};

// Live-reload from disk when another process changes the file, as long as the user hasn't
// touched the buffer yet; otherwise remember the conflict for the next save attempt. Split out of
// `EditorTab.tsx` to stay under the 200-line file cap, mirroring the file's other extracted hooks.
export function useEditorWatchReload(options: EditorWatchReloadOptions): void {
  const { mtimeMs, url, conflictPendingRef, setBaseline, reads } = options;
  const latest = useLatestRef(options);
  const seenMtimeRef = useRef<number | undefined>(mtimeMs);
  useEffect(() => {
    if (mtimeMs === seenMtimeRef.current) return;
    seenMtimeRef.current = mtimeMs;
    if (mtimeMs === undefined) return;
    if (latest.current.dirty) {
      reads.begin();
      conflictPendingRef.current = true;
      return;
    }
    const read = reads.begin();
    void (async () => {
      try {
        const text = await latest.current.client.readFile(url);
        if (!read.isCurrent()) return;
        const { dirty, api, initialLine } = latest.current;
        if (dirty) { conflictPendingRef.current = true; return; }
        const line = api.stateRef.current?.cursor.line ?? (initialLine === undefined ? undefined : initialLine - 1);
        api.load(text, line);
        setBaseline(text);
      } catch {
        // The reload is best-effort — the buffer just keeps showing the last content we had.
      }
    })();
    return read.cancel;
  }, [mtimeMs, url, latest, reads, conflictPendingRef, setBaseline]);
}
