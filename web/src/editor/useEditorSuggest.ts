// Client logic for the in-editor persona-suggestion surface (see product/specs/editor-tab.md
// "In-editor persona suggestions"): fetching the persona list, owning the ephemeral agent query
// line, firing a single-shot query from it, and resolving the reply's pending hunks one at a time.
// Kept out of EditorTab.tsx (Decision 12 of the plan) to stay under the 200-line file cap,
// mirroring the existing useEditor/useEditorMouse/useEditorSync/useSyntaxHighlight hooks.

import { useEffect, useRef, useState } from 'react';
import type { SuggestHunk } from '@shared/protocol';
import type { EditorState } from './model';
import { fromText, toText } from './model';
import type { JanusClient } from '../ws';
import { parseSuggestRequest } from './suggest-request';
import { spliceHunk } from './suggestDiff';

export type PendingSuggest = {
  hunks: SuggestHunk[];
  // Parallel to `hunks`: true once that hunk has been accepted or declined. Every unresolved hunk
  // previews inline at once; the set finalizes once every slot is true.
  resolved: boolean[];
  acceptedAny: boolean;
};

// The ephemeral, non-buffer query line: its own single-line EditorState (reusing model.ts, not the
// buffer's), paired with the buffer line index it renders inline at (Decision 2).
export type QueryLine = { anchorLine: number; state: EditorState };

const emptyQueryState = (): EditorState => ({ lines: ['>'], cursor: { line: 0, col: 1 }, anchor: null });

export type EditorSuggestApi = {
  personas: string[];
  pending: PendingSuggest | null;
  firingLine: string | null;
  noSuggestionLine: string | null;
  queryLine: QueryLine | null;
  // Whether the query line's status pill holds keyboard focus (via Tab), so Enter fires the
  // request instead of moving within the query text.
  pillFocused: boolean;
  setPillFocused: (focused: boolean) => void;
  openQueryLine: (anchorLine: number) => void;
  closeQueryLine: () => void;
  setQueryLineState: (s: EditorState) => void;
  fireOnLine: (bufferState: EditorState) => void;
  acceptHunk: (state: EditorState, index: number) => void;
  declineHunk: (state: EditorState, index: number) => void;
};

export function useEditorSuggest(client: JanusClient, url: string, setState: (s: EditorState) => void): EditorSuggestApi {
  const [personas, setPersonas] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingSuggest | null>(null);
  const [firingLine, setFiringLine] = useState<string | null>(null);
  const [noSuggestionLine, setNoSuggestionLine] = useState<string | null>(null);
  const [queryLine, setQueryLine] = useState<QueryLine | null>(null);
  const [pillFocused, setPillFocused] = useState(false);
  const pendingRef = useRef<PendingSuggest | null>(null);
  const queryLineRef = useRef<QueryLine | null>(null);
  const firingRef = useRef(false);
  queryLineRef.current = queryLine;

  useEffect(() => {
    void client.request<{ names: string[] }>({ method: 'editorPersonas', params: {} }).then((res) => {
      setPersonas(res?.names ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPendingBoth = (p: PendingSuggest | null) => { pendingRef.current = p; setPending(p); };

  const openQueryLine = (anchorLine: number) => { setQueryLine({ anchorLine, state: emptyQueryState() }); setPillFocused(false); };
  const closeQueryLine = () => { setQueryLine(null); setPillFocused(false); };
  const setQueryLineState = (s: EditorState) => { setQueryLine((q) => (q ? { ...q, state: s } : q)); };

  // Fires the `editorSuggest` query from the ephemeral query text, priming it with the live buffer
  // (Decision 2: the buffer never contains the request). A second request while one is already
  // pending, or with no open query line, is ignored (Decision 8).
  const fireOnLine = (bufferState: EditorState) => {
    const q = queryLineRef.current;
    if (pendingRef.current || firingRef.current || !q) return;
    const lineText = q.state.lines[0];
    const request = parseSuggestRequest(lineText, personas);
    if (!request) return;
    firingRef.current = true;
    setFiringLine(lineText);
    void client.request<{ hunks: SuggestHunk[] }>({
      method: 'editorSuggest',
      params: { url, persona: request.persona, content: toText(bufferState), prompt: request.prompt },
    }).then((res) => {
      firingRef.current = false;
      setFiringLine(null);
      const hunks = res?.hunks ?? [];
      // Empty hunks/failure is already surfaced via a notification server-side (Decision 10); the
      // query line stays open with its text intact and no pending panel opens.
      if (hunks.length > 0) {
        setPendingBoth({ hunks, resolved: hunks.map(() => false), acceptedAny: false });
      } else setNoSuggestionLine(lineText);
    });
  };

  // Marks one hunk resolved, or finalizes the whole set once no unresolved hunk remains — closing
  // the query line only if at least one hunk was accepted (Decision 8); otherwise it stays open
  // with its text intact so it can be edited and retried. A call against an already-resolved index
  // is a no-op.
  const resolveHunk = (index: number, accepted: boolean, state: EditorState): EditorState => {
    const p = pendingRef.current;
    if (!p || p.resolved[index]) return state;
    const acceptedAny = p.acceptedAny || accepted;
    const resolved = p.resolved.map((r, i) => (i === index ? true : r));
    if (resolved.some((r) => !r)) { setPendingBoth({ ...p, resolved, acceptedAny }); return state; }
    setPendingBoth(null);
    if (acceptedAny) closeQueryLine();
    return state;
  };

  const acceptHunk = (state: EditorState, index: number) => {
    const p = pendingRef.current;
    if (!p || p.resolved[index]) return;
    const hunk = p.hunks[index];
    const text = toText(state);
    const newText = spliceHunk(text, hunk);
    const applied = newText === null ? state : fromText(newText, state.cursor.line);
    setState(resolveHunk(index, newText !== null, applied));
  };

  const declineHunk = (state: EditorState, index: number) => {
    setState(resolveHunk(index, false, state));
  };

  return {
    personas, pending, firingLine, noSuggestionLine, queryLine, pillFocused, setPillFocused,
    openQueryLine, closeQueryLine, setQueryLineState, fireOnLine, acceptHunk, declineHunk,
  };
}
