import { useEffect, useRef, useState } from 'react';

// The keyboard selection rule every plugin record list shares: ArrowDown and ArrowUp step by one and
// stop at the ends rather than wrapping, so holding a key settles on the last or first row instead of
// cycling past it; Home and End jump to the ends. An empty list has no selection, and any other key
// leaves the selection where it was. A list with no selection yet steps from the first row.
export function nextListSelection(length: number, selected: number | null, key: string): number | null {
  if (length === 0) return null;
  const index = selected ?? 0;
  if (key === 'ArrowDown') return Math.min(index + 1, length - 1);
  if (key === 'ArrowUp') return Math.max(index - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return selected;
}

// How a click on a row is answered: the row to move the selection to, and whether this click was the
// second one on an already-highlighted row and so opens it.
export type ListRowClick = { selected: number; opens: boolean };

export type ListSelection = {
  listRef: React.RefObject<HTMLDivElement | null>;
  selected: number | null;
  rowClicked(index: number, decide: (index: number, confirmed: number | null) => ListRowClick): boolean;
  navigate(key: string, step: (length: number, selected: number | null, key: string) => number | null): boolean;
};

const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

// The selection state of a plugin record list: which row is highlighted, which row the user has also
// confirmed, and keeping both honest against a list the server rebuilds from every broadcast.
//
// A plugin list is a singleton tab whose rows arrive whole, so a stored index can outlive the list it
// was chosen from. Three rules contain that, and each answers a different question. The selection is
// clamped into whatever list arrived, so the highlight is never off the end. A confirmation is
// dropped when the list changes under it, because it says "this row is the one you acted on" and the
// row it named may be gone. And the highlighted row is scrolled into view, so a selection moved by
// keyboard is visible without the caller chasing the DOM.
export function useListSelection(length: number): ListSelection {
  const listRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(length === 0 ? null : 0);
  const [confirmed, setConfirmed] = useState<number | null>(null);

  useEffect(() => {
    if (selected === null) return;
    listRef.current?.querySelector(`[data-index="${CSS.escape(String(selected))}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => { setConfirmed(null); }, [length]);

  useEffect(() => {
    if (length === 0) setSelected(null);
    else if (selected === null) setSelected(0);
    else if (selected >= length) setSelected(length - 1);
  }, [length, selected]);

  // A click highlights and confirms in one step, because confirming is what tells a first click from
  // a second one: the caller opens the row only when this returns true.
  const rowClicked = (
    index: number, decide: (at: number, was: number | null) => ListRowClick,
  ): boolean => {
    const click = decide(index, confirmed);
    setSelected(click.selected);
    setConfirmed(click.selected);
    listRef.current?.focus();
    return click.opens;
  };

  // The arrow/Home/End keys, answered the same way for every plugin list: move the selection by the
  // caller's rule and drop the confirmation, because the row the user confirmed is not the row they
  // have just moved to. Reports whether it took the key, so a caller with bindings of its own can go
  // on to them.
  const navigate = (
    key: string, step: (length: number, from: number | null, pressed: string) => number | null,
  ): boolean => {
    if (!NAVIGATION_KEYS.has(key)) return false;
    setSelected(step(length, selected, key));
    setConfirmed(null);
    return true;
  };

  return { listRef, selected, rowClicked, navigate };
}
