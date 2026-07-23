// Client logic for the in-editor persona-suggestion surface (see product/specs/editor-tab.md
// "In-editor persona suggestions"): fetching the persona list, owning the ephemeral agent query
// line, firing a single-shot query from it, and resolving the reply's pending hunks one at a time.
// Kept out of EditorTab.tsx (Decision 12 of the plan) to stay under the 200-line file cap,
// mirroring the existing useEditor/useEditorMouse/useEditorSync/useSyntaxHighlight hooks.

import { useEffect, useRef, useState } from 'react';
import type { SuggestHunk } from '@shared/protocol';
import type { EditorState } from './model';
import { fromText, toText, clampPos } from './model';
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
  // Which surface keyboard input (and its caret) currently targets — lets the query line stay
  // open while the buffer is edited, and vice versa, instead of one exclusively owning all input.
  focusTarget: 'buffer' | 'query';
  setFocusTarget: (target: 'buffer' | 'query') => void;
  openQueryLine: (anchorLine: number) => void;
  closeQueryLine: () => void;
  setQueryLineState: (s: EditorState) => void;
  // Moves focus (and the caret) from the query line into the buffer, landing on the buffer line
  // just past the query's anchor in the direction the cursor left the query (`dir`), at `col`.
  // A no-op when there is no buffer line in that direction (the anchor sits at the document edge).
  exitQueryToBuffer: (dir: -1 | 1, col: number, bufferState: EditorState) => void;
  // Moves focus (and the caret) from the buffer into the query line, landing on the query's first
  // line when entering from above (`dir` 1, moving down) or its last line when entering from below
  // (`dir` -1, moving up), at `col`.
  enterQueryFromBuffer: (dir: -1 | 1, col: number) => void;
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
  const [focusTarget, setFocusTarget] = useState<'buffer' | 'query'>('buffer');
  const pendingRef = useRef<PendingSuggest | null>(null);
  const queryLineRef = useRef<QueryLine | null>(null);
  const firingRef = useRef(false);
  const firingCancelledRef = useRef(false);
  queryLineRef.current = queryLine;

  useEffect(() => {
    void client.request<{ names: string[] }>({ method: 'editorPersonas', params: {} }).then((res) => {
      setPersonas(res?.names ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPendingBoth = (p: PendingSuggest | null) => { pendingRef.current = p; setPending(p); };

  const openQueryLine = (anchorLine: number) => {
    setQueryLine({ anchorLine, state: emptyQueryState() });
    setPillFocused(false);
    setFocusTarget('query');
  };
  const closeQueryLine = () => {
    if (firingRef.current) firingCancelledRef.current = true;
    setQueryLine(null);
    setPillFocused(false);
    setFocusTarget('buffer');
  };
  const setQueryLineState = (s: EditorState) => { setQueryLine((q) => (q ? { ...q, state: s } : q)); };

  const exitQueryToBuffer = (dir: -1 | 1, col: number, bufferState: EditorState) => {
    const q = queryLineRef.current;
    if (!q) return;
    const target = q.anchorLine + dir;
    if (target < 0 || target >= bufferState.lines.length) return;
    setFocusTarget('buffer');
    setState({ ...bufferState, cursor: clampPos(bufferState.lines, { line: target, col }), anchor: null, goalCol: undefined });
  };

  const enterQueryFromBuffer = (dir: -1 | 1, col: number) => {
    const q = queryLineRef.current;
    if (!q) return;
    const line = dir === 1 ? 0 : q.state.lines.length - 1;
    setFocusTarget('query');
    setQueryLineState({ ...q.state, cursor: clampPos(q.state.lines, { line, col }), anchor: null, goalCol: undefined });
  };

  // Fires the `editorSuggest` query from the ephemeral query text (now possibly several lines,
  // one per Shift+Enter), priming it with the live buffer (Decision 2: the buffer never contains
  // the request). A second request while one is already pending, or with no open query line, is
  // ignored (Decision 8).
  const fireOnLine = (bufferState: EditorState) => {
    const q = queryLineRef.current;
    if (pendingRef.current || firingRef.current || !q) return;
    const queryText = toText(q.state);
    const request = parseSuggestRequest(queryText, personas);
    if (!request) return;
    firingRef.current = true;
    setFiringLine(queryText);
    void client.request<{ hunks: SuggestHunk[] }>({
      method: 'editorSuggest',
      params: { url, persona: request.persona, content: toText(bufferState), prompt: request.prompt },
    }).then((res) => {
      firingRef.current = false;
      setFiringLine(null);
      if (firingCancelledRef.current) { firingCancelledRef.current = false; return; }
      const hunks = res?.hunks ?? [];
      // Empty hunks/failure is already surfaced via a notification server-side (Decision 10); the
      // query line stays open with its text intact and no pending panel opens.
      if (hunks.length > 0) {
        setPendingBoth({ hunks, resolved: hunks.map(() => false), acceptedAny: false });
      } else setNoSuggestionLine(queryText);
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
    focusTarget, setFocusTarget,
    openQueryLine, closeQueryLine, setQueryLineState, exitQueryToBuffer, enterQueryFromBuffer,
    fireOnLine, acceptHunk, declineHunk,
  };
}
