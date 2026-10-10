import { useCallback } from 'react';

// One DOM node, two owners. The tab keeps a ref so it can move focus to a list when the docked view
// receives it, and the shared selection hook keeps its own so it can scroll the highlighted row into
// view and focus the list after a click. Attaching only the tab's left the hook's dangling, so neither
// the scroll nor the post-click focus ever happened — and the highlight was the only half of the two
// that worked.
export function useComposedListRef(
  external: React.RefObject<HTMLDivElement | null>,
  own: React.RefObject<HTMLDivElement | null>,
): (node: HTMLDivElement | null) => void {
  return useCallback((node: HTMLDivElement | null) => {
    external.current = node;
    own.current = node;
  }, [external, own]);
}
