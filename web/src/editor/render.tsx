import React from 'react';
import type { EditorState } from './model';
import { selectionRange } from './model';

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
};

// The caret is a zero-width inline span (its ::after paints the bar) inserted into the text flow
// at the cursor column, so it sits exactly at (line, col) with no measurement code.
function contentSegments({ text, selFrom, selTo, caretCol, caretRef }: LineProps): React.ReactNode[] {
  const bounds = [...new Set([0, selFrom, selTo, caretCol, text.length])]
    .filter((b) => b >= 0 && b <= text.length)
    .toSorted((a, b) => a - b);
  const nodes: React.ReactNode[] = [];
  for (let index = 0; index < bounds.length - 1; index++) {
    const [from, to] = [bounds[index], bounds[index + 1]];
    if (caretCol === from) nodes.push(<span key={`c${from}`} className="editor-caret" ref={caretRef} />);
    const selected = selFrom >= 0 && from >= selFrom && to <= selTo;
    nodes.push(<span key={from} className={selected ? 'editor-sel' : undefined}>{text.slice(from, to)}</span>);
  }
  if (caretCol === text.length && (text.length > 0 || bounds.length === 1)) {
    nodes.push(<span key="cend" className="editor-caret" ref={caretRef} />);
  }
  return nodes;
}

// One logical line: gutter cell + soft-wrapped content cell. Wrapped lines occupy several visual
// rows while the gutter number sits on the first — the flex row gives correct alignment for free.
export const EditorLine = React.memo(function EditorLine(props: LineProps) {
  const { line, gutterCh, isCurrent } = props;
  return (
    <div className={isCurrent ? 'editor-row editor-row-current' : 'editor-row'} data-editor-line={line}>
      <span className="editor-gutter" style={{ width: `${gutterCh}ch` }}>{line + 1}</span>
      <span className="editor-content">{contentSegments(props)}</span>
    </div>
  );
});
