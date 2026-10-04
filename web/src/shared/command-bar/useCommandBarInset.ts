import { useEffect, type RefObject } from 'react';

export const COMMAND_BAR_HEIGHT = '--command-bar-height';

// Publishes the command bar's rendered height on the tab frame around it, so a popup the host
// renders beside the tab's body can sit exactly on top of the bar however tall it has grown — a
// multi-line draft or a completion strip both make it taller. Nothing is published outside a frame.
export function useCommandBarInset(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = root.current;
    const frame = element?.parentElement?.closest<HTMLElement>('.tab-body, .sidebar-plugin');
    if (!element || !frame) return;
    const publish = () => { frame.style.setProperty(COMMAND_BAR_HEIGHT, `${element.offsetHeight}px`); };
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(publish);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      frame.style.removeProperty(COMMAND_BAR_HEIGHT);
    };
  }, [root]);
}
