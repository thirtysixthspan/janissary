// Client logic for the in-editor persona-suggestion surface (see product/specs/editor-tab.md
// "In-editor persona suggestions"): fetching the persona list, firing a single-shot query on the
// current `>` request line, and resolving the reply's pending hunks one at a time. Kept out of
// EditorTab.tsx (Decision 12 of the plan) to stay under the 200-line file cap, mirroring the
// existing useEditor/useEditorMouse/useEditorSync/useSyntaxHighlight hooks.

import { useEffect, useRef, useState } from 'react';
import type { SuggestHunk } from '@shared/protocol';
import type { EditorState } from './model';
import { fromText, toText } from './model';
import type { JanusClient } from '../ws';
import { parseSuggestRequest } from './suggest-request';
import { spliceHunk } from './suggestDiff';

export type PendingSuggest = {
  hunks: SuggestHunk[];
  index: number;
  requestLineText: string;
  acceptedAny: boolean;
};

export type EditorSuggestApi = {
  personas: string[];
  pending: PendingSuggest | null;
  firingLine: string | null;
  noSuggestionLine: string | null;
  // The line index whose status pill currently holds keyboard focus (via Tab), or null when none
  // does. Enter fires the request on that line while it's set; any other key clears it.
  focusedPillLine: number | null;
  setFocusedPillLine: (line: number | null) => void;
  fireOnLine: (state: EditorState, lineIndex: number) => void;
  acceptFocused: (state: EditorState) => void;
  declineFocused: (state: EditorState) => void;
};

export function useEditorSuggest(client: JanusClient, url: string, setState: (s: EditorState) => void): EditorSuggestApi {
  const [personas, setPersonas] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingSuggest | null>(null);
  const [firingLine, setFiringLine] = useState<string | null>(null);
  const [noSuggestionLine, setNoSuggestionLine] = useState<string | null>(null);
  const [focusedPillLine, setFocusedPillLine] = useState<number | null>(null);
  const pendingRef = useRef<PendingSuggest | null>(null);
  const firingRef = useRef(false);

  useEffect(() => {
    void client.request<{ names: string[] }>({ method: 'editorPersonas', params: {} }).then((res) => {
      setPersonas(res?.names ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPendingBoth = (p: PendingSuggest | null) => { pendingRef.current = p; setPending(p); };

  // Fires the `editorSuggest` query when `lineIndex` is a valid request line, priming it with the
  // live buffer (Decision 5). A second request while one is already pending is ignored (Decision 8).
  const fireOnLine = (state: EditorState, lineIndex: number) => {
    if (pendingRef.current || firingRef.current) return;
    const lineText = state.lines[lineIndex] ?? '';
    const request = parseSuggestRequest(lineText, personas);
    if (!request) return;
    firingRef.current = true;
    setFiringLine(lineText);
    void client.request<{ hunks: SuggestHunk[] }>({
      method: 'editorSuggest',
      params: { url, persona: request.persona, content: toText(state), prompt: request.prompt },
    }).then((res) => {
      firingRef.current = false;
      setFiringLine(null);
      const hunks = res?.hunks ?? [];
      // Empty hunks/failure is already surfaced via a notification server-side (Decision 10); the
      // request line stays untouched and no pending panel opens.
      if (hunks.length > 0) setPendingBoth({ hunks, index: 0, requestLineText: lineText, acceptedAny: false });
      else setNoSuggestionLine(lineText);
    });
  };

  // Advances focus to the next pending hunk, or resolves the set once none remain — removing the
  // `>` request line only if at least one hunk was accepted (Decision 9).
  const resolveOne = (accepted: boolean, state: EditorState): EditorState => {
    const p = pendingRef.current;
    if (!p) return state;
    const acceptedAny = p.acceptedAny || accepted;
    const nextIndex = p.index + 1;
    if (nextIndex < p.hunks.length) { setPendingBoth({ ...p, index: nextIndex, acceptedAny }); return state; }
    setPendingBoth(null);
    if (!acceptedAny) return state;
    const idx = state.lines.indexOf(p.requestLineText);
    if (idx === -1) return state;
    const lines = [...state.lines];
    lines.splice(idx, 1);
    const line = Math.min(idx, Math.max(0, lines.length - 1));
    return { lines, cursor: { line, col: 0 }, anchor: null };
  };

  const acceptFocused = (state: EditorState) => {
    const p = pendingRef.current;
    if (!p) return;
    const hunk = p.hunks[p.index];
    const text = toText(state);
    const newText = spliceHunk(text, hunk);
    const applied = newText === null ? state : fromText(newText, state.cursor.line);
    setState(resolveOne(newText !== null, applied));
  };

  const declineFocused = (state: EditorState) => {
    setState(resolveOne(false, state));
  };

  return {
    personas, pending, firingLine, noSuggestionLine, focusedPillLine, setFocusedPillLine,
    fireOnLine, acceptFocused, declineFocused,
  };
}
