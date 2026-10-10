import React, { useMemo } from 'react';
import type { DiffHunk, DiffLine } from '@shared/plugins/diff/shared';
import { changedSpans } from './intraline';
import { hunkRange } from './hunk-range';
import { highlightHunk } from './highlight-hunk';
import { UnifiedLine } from './UnifiedLine';

// One hunk as GitHub's files-changed view shows it: a row per line, its file line number on its own
// side, green for an addition and red for a removal, and a double-click on any line opening the file
// at that line; removed lines are inert because their position no longer exists. `index` is the hunk's place in the walk's flat list, which is what the shared
// selection scrolls into view; `walked` marks the hunk the keyboard walk is on, and Return acts on.
//
// Character marks use the split layout's pairing, while rows follow git's order: every removed line
// in a replacement block precedes every added line.
export function HunkLines({ hunk, fileName, oldFileName, index, walked, onSelect, onOpenLine }: {
  hunk: DiffHunk;
  fileName: string;
  oldFileName: string;
  index: number;
  walked: boolean;
  onSelect(): void;
  onOpenLine(line: DiffLine): void;
}) {
  const spans = changedSpans(hunk);
  const tokens = useMemo(() => highlightHunk(hunk, fileName, oldFileName), [hunk, fileName, oldFileName]);
  const tokensFor = (line: DiffLine) => (line.kind === 'removed' ? tokens.old : tokens.next).get(line) ?? [];
  return (
    <div className={walked ? 'diff-hunk diff-walked' : 'diff-hunk'} data-index={index} onMouseDown={onSelect}>
      <div className="diff-hunk-header">{hunkRange(hunk)}</div>
      {hunk.lines.map((line) => (
        <UnifiedLine key={`${line.kind}:${line.number}`} line={line} tokens={tokensFor(line)} spans={spans.get(line)} onOpenLine={onOpenLine} />
      ))}
    </div>
  );
}
