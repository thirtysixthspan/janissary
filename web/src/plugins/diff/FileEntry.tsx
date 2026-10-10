import React, { useState } from 'react';
import type { DiffFile } from '@shared/plugins/diff/shared';
import { HunkLines } from './HunkLines';
import { SplitHunks } from './SplitHunks';
import { oversizedLines, CHANGE_LINE_CAP } from './size-cap';
import { fileStatus } from './status';
import { isWholeFileChange } from './whole-file';
import { LineCommentsProvider } from './LineCommentsProvider';
import { gutterWidth } from './gutter-width';
import { FileViewControl, isFullFileContext } from './FileViewControl';

// One changed file: its header — the path, the rename it came from, its status, its add and delete
// counts — and every hunk it holds. A deleted file's header is inert, because there is no file to
// open; a binary file's header opens the media tab its extension already opens instead.
//
// `offset` is how many hunks the files above this one contribute to the walk's flat list, and a hunk
// with no lines contributes none, which is what keeps a walked index pointing at a real hunk.
export function FileEntry({ file, split, offset, walked, onSelectHunk, onOpenFile, onOpenLine, onOpenMedia, onToggleFullFile }: {
  file: DiffFile;
  split: boolean;
  offset: number;
  walked: number | null;
  onSelectHunk(index: number): void;
  onOpenFile(): void;
  onOpenLine(line: { number: number; jump: number }): void;
  onOpenMedia(): void;
  onToggleFullFile?(fullFile: boolean): Promise<unknown>;
}) {
  let taken = 0;
  const spots = file.hunks.map((hunk) => (hunk.lines.length === 0 ? -1 : offset + taken++));
  // Three answers about one entry: the reason it collapsed of its own accord, the user's own flip of
  // it, and nothing yet. A user's flip stands because a whole-file change that grows a surviving line
  // is still an entry the user closed.
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const over = oversizedLines(file);
  const collapsed = flipped ?? (isWholeFileChange(file) || over > 0);
  const flip = () => setFlipped(!collapsed);
  const cycleView = async () => {
    if (collapsed) { setFlipped(false); return; }
    if (isFullFileContext(file.contextLines)) {
      setFlipped(true);
      await onToggleFullFile?.(false);
      return;
    }
    if (onToggleFullFile && !file.binary && !file.added && !file.deleted && file.hunks.length > 0) {
      await onToggleFullFile(true);
    } else setFlipped(true);
  };
  const status = fileStatus(file);
  const style: React.CSSProperties & { '--diff-gutter-width': string } = { '--diff-gutter-width': `${gutterWidth(file)}ch` };
  const openName = (event: React.MouseEvent) => {
    if (event.detail >= 2) return;
    if (file.binary) { onOpenMedia(); return; }
    onOpenFile();
  };
  return (
    <LineCommentsProvider>
      <div className="diff-file" style={style}>
        <div
          className="diff-file-header"
          onDoubleClick={flip}
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
          <FileViewControl collapsed={collapsed} expanded={isFullFileContext(file.contextLines)}
            pending={file.expandingContext === true} error={file.contextError} cycle={cycleView} />
          <span className="diff-counts">
            <span className={`diff-status diff-status-${status.kind}`}>{status.label}</span>
            {file.additions > 0 && <span className="diff-added-count">+{file.additions}</span>}
            {file.deletions > 0 && <span className="diff-removed-count">−{file.deletions}</span>}
            {over > 0 && <span className="diff-large-file">{`${file.additions + file.deletions} lines over the ${CHANGE_LINE_CAP}-line cap — double-click to expand`}</span>}
          </span>
        </div>
        {!collapsed && file.hunks.map((hunk, index) => {
          const spot = spots[index];
          const walkedHere = spot >= 0 && walked === spot;
          const shared = {
            fileName: file.path,
            oldFileName: file.oldPath ?? file.path,
            onSelect: () => { if (spot >= 0) onSelectHunk(spot); },
            // A deleted file's hunks are inert: there is no file to take the user to, and the line
            // numbers they carry are the old file's.
            onOpenLine: file.deleted ? () => {} : (line: { number: number; jump: number }) => { onOpenLine(line); },
          };
          return (
            <React.Fragment key={index}>
              {split
                ? <SplitHunks hunk={hunk} index={spot} walked={walkedHere} {...shared} />
                : <HunkLines hunk={hunk} index={spot} walked={walkedHere} {...shared} />}
            </React.Fragment>
          );
        })}
      </div>
    </LineCommentsProvider>
  );
}
