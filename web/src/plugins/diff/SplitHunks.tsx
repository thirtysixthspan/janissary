import React from 'react';
import type { DiffHunk, DiffLine } from '@shared/plugins/diff/shared';
import { splitRows } from './split-rows';

// The same hunk in the split layout: the old side's removed and context lines beside the new side's
// added and context lines, each column carrying its own side's line numbers. A double-click on
// either side opens the file at that line.
export function SplitHunks({ hunk, index, walked, onSelect, onOpenLine }: {
  hunk: DiffHunk;
  index: number;
  walked: boolean;
  onSelect(): void;
  onOpenLine(line: DiffLine): void;
}) {
  return (
    <div className={walked ? 'diff-hunk diff-split diff-walked' : 'diff-hunk diff-split'} data-index={index} onMouseDown={onSelect}>
      {splitRows(hunk).map((row, index) => (
        <div className="diff-split-row" key={index}>
          <SplitSide line={row.old} side="old" onOpenLine={onOpenLine} />
          <SplitSide line={row.next} side="new" onOpenLine={onOpenLine} />
        </div>
      ))}
    </div>
  );
}

function SplitSide({ line, side, onOpenLine }: {
  line: DiffLine | undefined;
  side: 'old' | 'new';
  onOpenLine(line: DiffLine): void;
}) {
  if (line === undefined) return <div className={`diff-cell diff-${side} diff-empty`}><span className="diff-number" /><span className="diff-text"> </span></div>;
  return (
    <div className={`diff-cell diff-${side} diff-${line.kind}`} onDoubleClick={() => onOpenLine(line)}>
      <span className="diff-number">{line.number}</span>
      <span className="diff-text">{line.text === '' ? ' ' : line.text}</span>
    </div>
  );
}
