import type { CommandInputDropHandle } from '../shared/drop-handles';
import { commandBarDropHandle } from '../shared/drop-registry';

// Which command bar a navigator drag is over, and the handle that bar receives a drop through: the
// bar's own registered handle when it published one, and the agent tab's `dropRef` handle otherwise.
// Moving from one bar to another moves the highlight with it.
export function createCommandBarDropTarget(fallback: () => CommandInputDropHandle | null | undefined) {
  let element: Element | null = null;
  let handle: CommandInputDropHandle | null = null;
  const hover = (next: Element | null) => {
    if (next === element) return;
    handle?.setDropHighlighted(false);
    element = next;
    handle = next ? commandBarDropHandle(next) ?? fallback() ?? null : null;
    handle?.setDropHighlighted(true);
  };
  return {
    hover,
    isOver: () => element !== null,
    insert: (text: string) => { handle?.insertAtCaret(text); },
    // Ends the gesture's highlight. With no bar hovered it still clears the fallback's, which is what
    // an unmount during a drag has always done.
    clear: () => {
      if (element) hover(null);
      else fallback()?.setDropHighlighted(false);
    },
  };
}
