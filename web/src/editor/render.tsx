import React from 'react';
import type { EditorState } from './model';
import { selectionRange } from './model';
import type { TokenRange } from './highlight/tokenize';
import type { SuggestPill } from './suggest-request';

// Selection column bounds for one line as primitives ([-1, -1] when the line is outside the
// selection) so EditorLine's React.memo can compare props cheaply on large files.
export function lineSelection(state: EditorState, line: number): [number, number] {
  const r = selectionRange(state);
  if (!r || line < r.start.line || line > r.end.line) return [-1, -1];
  const from = line === r.start.line ? r.start.col : 0;
  const to = line === r.end.line ? r.end.col : state.lines[line].length;
  return [from, to];
}

type LineProps = {
  text: string;
  line: number;
  gutterCh: number;
  isCurrent: boolean;
  // Selection bounds within this line; -1/-1 when unselected.
  selFrom: number;
  selTo: number;
  // Caret column, or -1 when the caret is not on this line.
  caretCol: number;
  caretRef: React.Ref<HTMLSpanElement> | null;
  // Syntax-highlighting token ranges for this line; empty when highlighting is off.
  tokens: TokenRange[];
  // The in-editor persona-suggestion status pill for this line, when it is a `>`-led request line.
  pill?: SuggestPill;
};

// The caret is a zero-width inline span (its ::after paints the bar) inserted into the text flow
// at the cursor column, so it sits exactly at (line, col) with no measurement code. Token
// boundaries fold into the same bounds set as selection/caret, so a token span never needs to
// nest around a selection — everything flattens to one list of column-bounded segments.
function contentSegments({ text, selFrom, selTo, caretCol, caretRef, tokens }: LineProps): React.ReactNode[] {
  const tokenBounds = tokens.flatMap((t) => [t.from, t.to]);
  const bounds = [...new Set([0, selFrom, selTo, caretCol, text.length, ...tokenBounds])]
    .filter((b) => b >= 0 && b <= text.length)
    .toSorted((a, b) => a - b);
  const nodes: React.ReactNode[] = [];
  for (let index = 0; index < bounds.length - 1; index++) {
    const [from, to] = [bounds[index], bounds[index + 1]];
    if (caretCol === from) nodes.push(<span key={`c${from}`} className="editor-caret" ref={caretRef} />);
    const selected = selFrom >= 0 && from >= selFrom && to <= selTo;
    const token = tokens.find((t) => from >= t.from && to <= t.to);
    const className = [token?.scope, selected ? 'editor-sel' : undefined].filter(Boolean).join(' ');
    nodes.push(<span key={from} className={className || undefined}>{text.slice(from, to)}</span>);
  }
  if (caretCol === text.length && (text.length > 0 || bounds.length === 1)) {
    // Zero-width space gives the inline span text content so the browser establishes a line box
    // height even on empty lines; without it, height:100% on ::after computes to zero.
    nodes.push(<span key="cend" className="editor-caret" ref={caretRef}>{'\u{200B}'}</span>);
  }
  return nodes;
}

// One logical line: gutter cell + soft-wrapped content cell. Wrapped lines occupy several visual
// rows while the gutter number sits on the first — the flex row gives correct alignment for free.
export const EditorLine = React.memo(function EditorLine(props: LineProps) {
  const { line, gutterCh, isCurrent, pill } = props;
  return (
    <div className={isCurrent ? 'editor-row editor-row-current' : 'editor-row'} data-editor-line={line}>
      <span className="editor-gutter" style={{ width: `${gutterCh}ch` }}>{line + 1}</span>
      <span className="editor-content">{contentSegments(props)}</span>
      {pill && (
        <span className={pill.runnable ? 'editor-suggest-pill editor-suggest-pill-run' : 'editor-suggest-pill'}>
          {pill.text}
        </span>
      )}
    </div>
  );
});
