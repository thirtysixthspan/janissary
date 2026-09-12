import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import type { JanusClient } from '../ws';
import { fuzzyMatch, type FuzzyMatchResult } from '../shared/fuzzy-match';

const RESULT_CAP = 10;

// State and handlers for the Cmd+P quick-open overlay: fetches the project's gitignore-aware file
// list once per open (Decision 8), then fuzzy-filters it client-side on every keystroke, capped
// and deferred so typing never lags behind the scan (Decision 11). Mirrors `useTabNav`'s shape.
export function useQuickOpen(client: JanusClient) {
  const [quickOpenOpen, setQuickOpenOpenState] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const [quickOpenLoading, setQuickOpenLoading] = useState(false);
  const [root, setRoot] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  // Bumped on every open; a fetch reply only applies if it's still the most recent request. Mirrored
  // into `openRef` (rather than reading the `quickOpenOpen` state directly) since the `.then()`
  // callback below is a stable closure that would otherwise only ever see the open flag as it was
  // the moment `openQuickOpen` was first created. Together these mean a reply that arrives after the
  // window was closed — by any path, including a plain close, not just a re-open — is dropped.
  const requestRef = useRef(0);
  const openRef = useRef(false);
  const setQuickOpenOpen = useCallback((open: boolean) => { openRef.current = open; setQuickOpenOpenState(open); }, []);

  const deferredQuery = useDeferredValue(quickOpenQuery);
  const quickOpenResults = useMemo<FuzzyMatchResult[]>(
    () => (quickOpenOpen ? fuzzyMatch(paths, deferredQuery, RESULT_CAP) : []),
    [quickOpenOpen, paths, deferredQuery],
  );

  const openQuickOpen = useCallback(() => {
    setQuickOpenQuery('');
    setQuickOpenIndex(0);
    setQuickOpenOpen(true);
    setQuickOpenLoading(true);
    const requestId = ++requestRef.current;
    void client.request<{ root: string; paths: string[] }>({ method: 'projectFiles', params: {} }).then((result) => {
      if (!openRef.current || requestRef.current !== requestId) return;
      // The loading flag clears whether or not an answer came, for the same reason the file-search
      // pop-up's does: a palette left spinning is stuck until it is reopened. With no paths there is
      // nothing to pick, so the empty root is never used to build a path.
      setRoot(result?.root ?? '');
      setPaths(result?.paths ?? []);
      setQuickOpenLoading(false);
    });
  }, [client, setQuickOpenOpen]);

  const closeQuickOpen = useCallback(() => setQuickOpenOpen(false), [setQuickOpenOpen]);

  // Enter opens the selected file via the `edit` command, using an absolute path — the returned
  // paths are relative to `root` (the launch dir), not necessarily the active tab's own cwd (Decision 5).
  const pickQuickOpenFile = useCallback((relPath: string) => {
    client.send({ method: 'command', params: { text: `edit ${root}/${relPath}` } });
    setQuickOpenOpen(false);
  }, [client, root, setQuickOpenOpen]);

  return {
    quickOpenOpen, quickOpenQuery, quickOpenIndex, quickOpenLoading, quickOpenResults,
    setQuickOpenQuery, setQuickOpenIndex, setQuickOpenOpen,
    openQuickOpen, closeQuickOpen, pickQuickOpenFile,
  };
}
