import { useCallback } from 'react';
// The shared list selection comes through the client plugin API, not by reaching into the host —
// the boundary rule forbids the direct import, and the API is where it is published.
import {
  nextListSelection,
  useListSelection,
  type ListRowClick,
  type ListSelection,
} from '../api';

export type ResultSelection = {
  listRef: React.RefObject<HTMLDivElement | null>;
  selected: number | null;
  // Move the selection with the arrow, Home, and End keys, answering whether the key was taken.
  // Reports false for a key that is not one of those, so a caller with keys of its own can go on.
  navigate(key: string): boolean;
  // A click on a row, which both selects and opens in one step.
  rowClicked(index: number): boolean;
};

type Properties = {
  count: number;
};

// Every click opens. `useListSelection`'s own click rule opens only on a second click on an
// already-highlighted row, which is right for a list of records a user inspects and wrong for a list
// of places to jump to — so the decision is supplied here rather than taken from the shared default.
const clickOpens = (index: number): ListRowClick => ({ selected: index, opens: true });

// The selection state of the result table, on the host's shared list selection so this list moves its
// current row the same way every other plugin list does. Streaming rows never move it: the selection
// is by index into the rows received so far, and a selection the server has not yet reached stays
// where it is.
export function useResultSelection({ count }: Properties): ResultSelection {
  const selection: ListSelection = useListSelection(count);
  const { listRef, selected } = selection;

  const navigate = useCallback(
    (key: string) => selection.navigate(key, nextListSelection), [selection],
  );
  const rowClicked = useCallback(
    (index: number) => selection.rowClicked(index, clickOpens), [selection],
  );

  return { listRef, selected, navigate, rowClicked };
}
