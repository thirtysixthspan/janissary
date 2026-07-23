// Mouse selection for the editor: click to place the caret, drag to extend, double-click for
// word selection, gutter click/drag for whole-line selection. Window-level move/up listeners are
// attached only for the duration of a drag.

import { useRef } from 'react';
import type { EditorApi } from './useEditor';
import type { Pos, EditorState } from './model';
import { clampPos, setSelection, wordRangeAt } from './model';
import { hitFromEvent, hitFromPoint, type MouseHit } from './mouse';
import type { EditorSuggestApi } from './useEditorSuggest';

type QueryMouseTarget = Pick<EditorSuggestApi, 'queryLine' | 'setQueryLineState' | 'setFocusTarget'>;

type Drag = { anchor: Pos; lineMode: boolean; anchorLine: number };

// Line-wise selection from anchorLine to hitLine (the gutter "selection margin" convention):
// dragging down keeps the anchor at the top line's start; dragging up pins it past the anchor line.
function linesSelection(s: EditorState, anchorLine: number, hitLine: number): EditorState {
  const last = s.lines.length - 1;
  if (hitLine >= anchorLine) {
    const cursor = hitLine < last ? { line: hitLine + 1, col: 0 } : { line: last, col: s.lines[last].length };
    return setSelection(s, { line: anchorLine, col: 0 }, cursor);
  }
  const anchor = anchorLine < last ? { line: anchorLine + 1, col: 0 } : { line: last, col: s.lines[last].length };
  return setSelection(s, anchor, { line: hitLine, col: 0 });
}

export function useEditorMouse(api: EditorApi, bodyRef: React.RefObject<HTMLDivElement | null>, focus: () => void, suggest?: QueryMouseTarget) {
  const dragRef = useRef<Drag | null>(null);

  const extendTo = (hit: MouseHit) => {
    const s = api.stateRef.current;
    const drag = dragRef.current;
    if (!s || !drag) return;
    if (drag.lineMode) { api.setState(linesSelection(s, drag.anchorLine, hit.line)); return; }
    api.setState(setSelection(s, drag.anchor, clampPos(s.lines, hit)));
  };

  const onWindowMove = (e: MouseEvent) => {
    const body = bodyRef.current;
    if (!body || !dragRef.current) return;
    const hit = hitFromPoint(body, e.clientX, e.clientY);
    if (hit) extendTo(hit);
  };

  const endDrag = () => {
    dragRef.current = null;
    globalThis.removeEventListener('mousemove', onWindowMove);
    globalThis.removeEventListener('mouseup', endDrag);
  };

  const beginDrag = (drag: Drag) => {
    dragRef.current = drag;
    globalThis.addEventListener('mousemove', onWindowMove);
    globalThis.addEventListener('mouseup', endDrag);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    focus();
    const hit = hitFromEvent(e);
    if (!hit) { e.preventDefault(); return; }
    const queryLine = suggest?.queryLine;
    if (queryLine && !hit.inGutter && hit.line === queryLine.anchorLine) {
      e.preventDefault();
      suggest?.setFocusTarget('query');
      const qs = queryLine.state;
      const pos = clampPos(qs.lines, { line: 0, col: hit.col });
      suggest?.setQueryLineState(setSelection(qs, pos, pos));
      return;
    }
    suggest?.setFocusTarget('buffer');
    const s = api.stateRef.current;
    if (!s) { e.preventDefault(); return; }
    // Suppress native text selection when a text line was hit.
    e.preventDefault();
    api.sealUndo();
    if (hit.inGutter) {
      api.setState(linesSelection(s, hit.line, hit.line));
      beginDrag({ anchor: { line: hit.line, col: 0 }, lineMode: true, anchorLine: hit.line });
      return;
    }
    if (e.detail >= 2) {
      const range = wordRangeAt(s.lines, hit.line, hit.col);
      api.setState(setSelection(s, range.start, range.end));
      return;
    }
    const pos = clampPos(s.lines, hit);
    const anchor = e.shiftKey ? (s.anchor ?? s.cursor) : pos;
    api.setState(setSelection(s, anchor, pos));
    beginDrag({ anchor, lineMode: false, anchorLine: hit.line });
  };

  return { onMouseDown };
}
