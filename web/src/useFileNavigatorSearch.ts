import { useEffect, useRef, useState } from 'react';
import type { FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';

// State and handlers for one file tree tab's Search-files pop-up. Split out of `FileNavigatorTab` to
// keep it under the file-size limit.
export function useFileNavigatorSearch(
  client: JanusClient, index: number, rows: FileTreeRow[], setSelected: (path: string | null) => void, focusTree: () => void,
) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPaths, setSearchPaths] = useState<string[]>([]);
  // The target of a pending reveal (Enter in the pop-up): consumed once its row exists in `rows`
  // — the server rebuild that adds the target's ancestor directories can arrive after this render.
  const pendingReveal = useRef<string | null>(null);
  // Bumped on every open; a fetch reply only applies if it's still the most recent request, so a
  // reply that arrives after the pop-up was closed and re-opened can't repopulate the old query.
  const requestRef = useRef(0);

  useEffect(() => {
    const target = pendingReveal.current;
    if (target && rows.some((r) => r.path === target)) {
      setSelected(target);
      pendingReveal.current = null;
    }
  }, [rows, setSelected]);

  const openSearch = () => {
    setSearchQuery('');
    setSearchOpen(true);
    setSearchLoading(true);
    const requestId = ++requestRef.current;
    void client.request<{ paths: string[] }>({ method: 'fileTreeSearch', params: { index } }).then((result) => {
      if (requestRef.current !== requestId) return;
      setSearchPaths(result.paths);
      setSearchLoading(false);
    });
  };

  // Closes the pop-up and returns focus to the tree (Decision 2) — used for both Escape and
  // clicking outside the pop-up (its input's own `onBlur`).
  const closeSearch = () => { setSearchOpen(false); focusTree(); };

  const revealFromSearch = (relPath: string) => {
    pendingReveal.current = relPath;
    client.send({ method: 'revealFileTreeItem', params: { index, relPath } });
    setSearchOpen(false);
  };

  return { searchOpen, searchQuery, setSearchQuery, searchLoading, searchPaths, openSearch, closeSearch, revealFromSearch };
}
