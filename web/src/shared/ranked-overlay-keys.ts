import type React from 'react';

// The key handling an overlay that holds its own text input over a ranked list needs: the find
// overlay and the quick-open overlay, which are the same widget pointed at different things.
//
// Every key is swallowed and the keystroke never reaches the layer behind — the buffer for the find
// overlay, the window handler for quick-open — because the overlay is a question the user is in the
// middle of answering, not a keystroke the thing underneath should also act on.
//
// Up and Down step one row and stop at the ends rather than wrapping, so holding a key settles on
// the last or first row instead of cycling past it. What Enter commits and what Escape does
// afterwards are the caller's, because they are the only two that differ.
export function useRankedOverlayKeys(
  selected: number,
  count: number,
  onChangeSelected: (index: number) => void,
  onEnter: () => void,
  onEscape: () => void,
): React.KeyboardEventHandler<HTMLInputElement> {
  return (event) => {
    event.stopPropagation();
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onChangeSelected(Math.max(0, selected - 1));
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onChangeSelected(Math.min(count - 1, selected + 1));
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); onEnter(); return; }
    if (event.key === 'Escape') { event.preventDefault(); onEscape(); }
  };
}
