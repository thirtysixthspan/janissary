import { useCallback } from 'react';
// The shared list selection comes through the client plugin API, not by reaching into the host —
// the boundary rule forbids the direct import, and the API is where it is published.
import { useListSelection, type ListRowClick, type ListSelection } from '../api';
import { nextResultSelection } from './result-keys';

export type ResultSelection = {
  listRef: React.RefObject<HTMLDivElement | null>;
  selected: number | null;
  // Move the selection with the arrow, Home, and End keys, answering whether the key was taken.
  // Reports false for a key that is not one of those, so a caller with keys of its own can go on.
  navigate(key: string): boolean;
  // A click selects the row and focuses the results for keyboard navigation.
  rowClicked(index: number): void;
};

type Properties = {
  count: number;
};

// Only the browser's double-click event opens a result; separate clicks keep selecting it.
const selectRow = (index: number): ListRowClick => ({ selected: index, opens: false });

// The selection state of the result table, on the host's shared list selection so this list moves its
// current row the same way every other plugin list does. Streaming rows never move it: the selection
// is by index into the rows received so far, and a selection the server has not yet reached stays
// where it is.
export function useResultSelection({ count }: Properties): ResultSelection {
  const selection: ListSelection = useListSelection(count);
  const { listRef, selected } = selection;

  // The window stacks upward, so the arrows step by the screen rather than by the shared top-down
  // rule: up the page is a later match.
  const navigate = useCallback(
    (key: string) => selection.navigate(key, nextResultSelection), [selection],
  );
  const rowClicked = useCallback(
    (index: number) => { selection.rowClicked(index, selectRow); }, [selection],
  );

  return { listRef, selected, navigate, rowClicked };
}
