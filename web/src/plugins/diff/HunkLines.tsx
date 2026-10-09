import React from 'react';
import type { DiffHunk, DiffLine } from '@shared/plugins/diff/shared';

// The line's sign: + on an addition, − on a removal, nothing on a context line, which is what leaves
// a surviving line's row unmarked.
function markerOf(kind: DiffLine['kind']): string {
  if (kind === 'added') return '+';
  if (kind === 'removed') return '−';
  return '';
}

// One hunk as GitHub's files-changed view shows it: a row per line, its file line number on its own
// side, green for an addition and red for a removal, and a double-click on any line opening the file
// at that line. `index` is the hunk's place in the walk's flat list, which is what the shared
// selection scrolls into view; `walked` marks the hunk the keyboard walk is on, and Return acts on.
export function HunkLines({ hunk, index, walked, onSelect, onOpenLine }: {
  hunk: DiffHunk;
  index: number;
  walked: boolean;
  onSelect(): void;
  onOpenLine(line: DiffLine): void;
}) {
  return (
    <div className={walked ? 'diff-hunk diff-walked' : 'diff-hunk'} data-index={index} onMouseDown={onSelect}>
      {hunk.lines.map((line, index) => (
        <div
          key={index}
          className={`diff-line diff-${line.kind}`}
          onDoubleClick={() => onOpenLine(line)}
        >
          <span className="diff-number">{line.number}</span>
          <span className="diff-marker">{markerOf(line.kind)}</span>
          <span className="diff-text">{line.text === '' ? ' ' : line.text}</span>
        </div>
      ))}
    </div>
  );
}
