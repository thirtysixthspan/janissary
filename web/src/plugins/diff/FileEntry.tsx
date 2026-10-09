import React, { useState } from 'react';
import type { DiffFile } from '@shared/plugins/diff/shared';
import { HunkLines } from './HunkLines';
import { SplitHunks } from './SplitHunks';
import { isWholeFileChange } from './whole-file';

// One changed file: its header — the path, the rename it came from, its add and delete counts — and
// every hunk it holds. A deleted file's header is inert, because there is no file to open; a binary
// file's header opens the media tab its extension already opens instead.
//
// `offset` is how many hunks the files above this one contribute to the walk's flat list, and a hunk
// with no lines contributes none, which is what keeps a walked index pointing at a real hunk.
export function FileEntry({ file, split, offset, walked, onSelectHunk, onOpenFile, onOpenLine, onOpenMedia }: {
  file: DiffFile;
  split: boolean;
  offset: number;
  walked: number | null;
  onSelectHunk(index: number): void;
  onOpenFile(): void;
  onOpenLine(line: { number: number; jump: number }): void;
  onOpenMedia(): void;
}) {
  let taken = 0;
  const spots = file.hunks.map((hunk) => (hunk.lines.length === 0 ? -1 : offset + taken++));
  const [expanded, setExpanded] = useState(false);
  const collapsed = isWholeFileChange(file) && !expanded;
  const openName = (event: React.MouseEvent) => {
    if (event.detail >= 2) return;
    if (file.binary) { onOpenMedia(); return; }
    onOpenFile();
  };
  return (
    <div className="diff-file">
      <div
        className="diff-file-header"
        onDoubleClick={() => setExpanded((was) => !was)}
      >
        <button
          type="button"
          className="diff-file-name"
          disabled={file.deleted}
          title={file.path}
          onClick={file.binary ? onOpenMedia : openName}
        >
          {file.oldPath === undefined ? file.path : `${file.oldPath} → ${file.path}`}
        </button>
        <span className="diff-counts">
          {file.additions > 0 && <span className="diff-added-count">+{file.additions}</span>}
          {file.deletions > 0 && <span className="diff-removed-count">−{file.deletions}</span>}
          {collapsed && <span className="diff-whole-file">whole file — double-click to expand</span>}
        </span>
      </div>
      {!collapsed && file.hunks.map((hunk, index) => {
        const spot = spots[index];
        const walkedHere = spot >= 0 && walked === spot;
        const shared = {
          onSelect: () => { if (spot >= 0) onSelectHunk(spot); },
          // A deleted file's hunks are inert: there is no file to take the user to, and the line
          // numbers they carry are the old file's.
          onOpenLine: file.deleted ? () => {} : (line: { number: number; jump: number }) => { onOpenLine(line); },
        };
        return split
          ? <SplitHunks key={index} hunk={hunk} index={spot} walked={walkedHere} {...shared} />
          : <HunkLines key={index} hunk={hunk} index={spot} walked={walkedHere} {...shared} />;
      })}
    </div>
  );
}
