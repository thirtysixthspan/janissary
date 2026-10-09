import React from 'react';
import type { DiffHunk, DiffLine } from '@shared/plugins/diff/shared';
import { ChangedText } from './ChangedText';
import { changedSpans } from './intraline';
import { hunkRange } from './hunk-range';
import { markerOf } from './HunkLines';
import { splitRows } from './split-rows';

// The same hunk in the split layout: the old side's removed and context lines beside the new side's
// added and context lines, each column carrying its own side's line numbers. A double-click on an
// added or context line opens the file there; removed lines are inert. The pairing is the row walk's, and the character alignment
// of a replaced line marks each side's own changed characters in its own column.
export function SplitHunks({ hunk, index, walked, onSelect, onOpenLine }: {
  hunk: DiffHunk;
  index: number;
  walked: boolean;
  onSelect(): void;
  onOpenLine(line: DiffLine): void;
}) {
  const rows = splitRows(hunk);
  const spans = changedSpans(hunk);
  return (
    <div className={walked ? 'diff-hunk diff-split diff-walked' : 'diff-hunk diff-split'} data-index={index} onMouseDown={onSelect}>
      <div className="diff-hunk-header">{hunkRange(hunk)}</div>
      {rows.map((row, index) => (
        <div className="diff-split-row" key={index}>
          <SplitSide line={row.old} side="old" spans={row.old === undefined ? undefined : spans.get(row.old)} onOpenLine={onOpenLine} />
          <SplitSide line={row.next} side="new" spans={row.next === undefined ? undefined : spans.get(row.next)} onOpenLine={onOpenLine} />
        </div>
      ))}
    </div>
  );
}

function SplitSide({ line, side, spans, onOpenLine }: {
  line: DiffLine | undefined;
  side: 'old' | 'new';
  spans: { from: number; to: number }[] | undefined;
  onOpenLine(line: DiffLine): void;
}) {
  if (line === undefined) return <div className={`diff-cell diff-${side} diff-empty`}><span className="diff-number" /><span className="diff-marker" /><span className="diff-text"> </span></div>;
  return (
    <div
      className={`diff-cell diff-${side} diff-${line.kind}`}
      onDoubleClick={line.kind === 'removed' ? undefined : () => onOpenLine(line)}
    >
      <span className="diff-number">{side === 'old' ? line.oldNumber ?? line.number : line.number}</span>
      <span className="diff-marker">{markerOf(line.kind)}</span>
      <ChangedText line={line} spans={spans ?? []} />
    </div>
  );
}
