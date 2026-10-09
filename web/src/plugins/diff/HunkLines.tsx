import React from 'react';
import type { DiffHunk, DiffLine } from '@shared/plugins/diff/shared';
import { ChangedText } from './ChangedText';
import { changedSpans } from './intraline';
import { hunkRange } from './hunk-range';
import { splitRows } from './split-rows';

// The line's sign: + on an addition, − on a removal, nothing on a context line, which is what leaves
// a surviving line's row unmarked.
export function markerOf(kind: DiffLine['kind']): string {
  if (kind === 'added') return '+';
  if (kind === 'removed') return '−';
  return '';
}

// One hunk as GitHub's files-changed view shows it: a row per line, its file line number on its own
// side, green for an addition and red for a removal, and a double-click on any line opening the file
// at that line; removed lines are inert because their position no longer exists. `index` is the hunk's place in the walk's flat list, which is what the shared
// selection scrolls into view; `walked` marks the hunk the keyboard walk is on, and Return acts on.
//
// The rows come from the pairing the split layout uses as well: a run of removed lines beside the run
// of added lines that replaced them, which is what gives the character alignment inside a replaced
// line its two sides. The old side is drawn above the new one, the order git printed them in.
export function HunkLines({ hunk, index, walked, onSelect, onOpenLine }: {
  hunk: DiffHunk;
  index: number;
  walked: boolean;
  onSelect(): void;
  onOpenLine(line: DiffLine): void;
}) {
  const rows = splitRows(hunk);
  const spans = changedSpans(hunk);
  return (
    <div className={walked ? 'diff-hunk diff-walked' : 'diff-hunk'} data-index={index} onMouseDown={onSelect}>
      <div className="diff-hunk-header">{hunkRange(hunk)}</div>
      {rows.map((row, at) => (
        <React.Fragment key={at}>
          {row.old !== undefined && <Line line={row.old} spans={spans.get(row.old)} onOpenLine={onOpenLine} />}
          {row.next !== undefined && row.next !== row.old && <Line line={row.next} spans={spans.get(row.next)} onOpenLine={onOpenLine} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function Line({ line, spans, onOpenLine }: {
  line: DiffLine;
  spans: { from: number; to: number }[] | undefined;
  onOpenLine(line: DiffLine): void;
}) {
  return (
    <div
      className={`diff-line diff-${line.kind}`}
      onDoubleClick={line.kind === 'removed' ? undefined : () => onOpenLine(line)}
    >
      <span className="diff-number">{line.oldNumber ?? ''}</span>
      <span className="diff-number">{line.kind === 'removed' ? '' : line.number}</span>
      <span className="diff-marker">{markerOf(line.kind)}</span>
      <ChangedText line={line} spans={spans ?? []} />
    </div>
  );
}
