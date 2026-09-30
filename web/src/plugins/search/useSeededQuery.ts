import { useCallback, useEffect, useRef, useState } from 'react';

export type SeededQuery = {
  query: string;
  // The bar's own edits. Clears a pending adoption, so a term the user types is never swallowed.
  setQuery(value: string): void;
  // Whether a settled term is the bar's echo of the query just adopted, consuming it when it is. The
  // command that seeded the query already started its search, and sending the echo would restart it.
  isAdoptedEcho(term: string): boolean;
};

// The search bar's query, which is the user's to edit, and which a `search <phrase>` command may
// still replace. The server echoes back every query the client sends, so `payload.query` alone
// cannot say whether the server means to change the bar; the `seed` counter moves only when a
// command seeded the query, and only then is it adopted.
export function useSeededQuery(
  payload: { query: string; seed: number },
  onAdopt: (term: string) => void,
): SeededQuery {
  const [query, setQueryState] = useState(payload.query);
  const seedRef = useRef(payload.seed);
  const adoptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (payload.seed === seedRef.current) return;
    seedRef.current = payload.seed;
    adoptedRef.current = payload.query;
    setQueryState(payload.query);
    onAdopt(payload.query);
  }, [payload.seed, payload.query, onAdopt]);

  const setQuery = useCallback((value: string) => {
    adoptedRef.current = null;
    setQueryState(value);
  }, []);

  const isAdoptedEcho = useCallback((term: string) => {
    if (adoptedRef.current !== term) return false;
    adoptedRef.current = null;
    return true;
  }, []);

  return { query, setQuery, isAdoptedEcho };
}
