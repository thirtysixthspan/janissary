import { useEffect, useRef, useState } from 'react';
import type { EditorState } from './model';
import { toText } from './model';
import { hljs } from './highlight/hljs';
import { languageForFile } from './highlight/registry';
import { tokenizeDocument, type TokenRange } from './highlight/tokenize';

// Pathological files skip highlighting entirely (plain text) so typing never gets sluggish.
const MAX_LINES = 10_000;
const MAX_CHARS = 1_000_000;
const DEBOUNCE_MS = 100;

// Owns the tokenize schedule for one editor tab: language resolution by file extension, a
// synchronous first pass on load, and a 100ms debounce after every edit. Returns per-line token
// ranges (empty for unsupported/oversized files, so the editor renders plain text).
export function useSyntaxHighlight(state: EditorState | null, fileName: string): TokenRange[][] {
  const [tokens, setTokens] = useState<TokenRange[][]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!state) { setTokens([]); return; }
    const language = languageForFile(fileName, hljs);
    if (!language) { setTokens([]); return; }
    const text = toText(state);
    if (state.lines.length > MAX_LINES || text.length > MAX_CHARS) { setTokens([]); return; }

    const recompute = () => setTokens(tokenizeDocument(text, language));

    if (!loadedRef.current) {
      loadedRef.current = true;
      recompute();
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(recompute, DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state, fileName]);

  return tokens;
}
