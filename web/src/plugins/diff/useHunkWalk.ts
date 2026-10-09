import { useCallback } from 'react';
import { nextListSelection, useListSelection, type ListRowClick, type ListSelection } from '../api';
import type { DiffFile } from '@shared/plugins/diff/shared';
import { fileStop, fileStarts } from './file-starts';
import { hunkSpots, type HunkSpot } from './hunk-index';

export type HunkWalk = {
  listRef: React.RefObject<HTMLDivElement | null>;
  selected: number | null;
  navigate(key: string): boolean;
  rowClicked(index: number): void;
  spot: HunkSpot | null;
  // The j and k keys: the next or previous file's first hunk, one file at a time, stopping at the
  // ends. Reports whether the key moved, so the tab can answer it.
  moveFile(forward: boolean): boolean;
};

// The walk over the change set's hunks, composed on the host's shared list selection: the arrows,
// the stopping at the first and last change, the clamping into a list the server just rebuilt, and
// the scroll-into-view are that hook's rules rather than a second copy of them. What belongs here is
// the mapping from a walked index back to the file, the hunk, and the line it opens at.
export function useHunkWalk(files: DiffFile[]): HunkWalk {
  const spots = hunkSpots(files);
  const selection: ListSelection = useListSelection(spots.length);
  const selected = selection.selected;

  const navigate = useCallback(
    (key: string) => selection.navigate(key, nextListSelection), [selection],
  );
  const rowClicked = useCallback(
    (index: number) => { selection.rowClicked(index, (at: number): ListRowClick => ({ selected: at, opens: false })); },
    [selection],
  );
  const moveFile = useCallback(
    (forward: boolean) => {
      const stop = fileStop(fileStarts(files), selected, forward);
      return stop === null ? false : selection.select(stop);
    },
    [selection, files, selected],
  );

  return {
    listRef: selection.listRef,
    selected,
    navigate,
    rowClicked,
    moveFile,
    spot: selected === null ? null : spots[selected] ?? null,
  };
}
