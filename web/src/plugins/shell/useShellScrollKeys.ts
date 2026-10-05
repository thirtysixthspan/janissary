import { useEffect } from 'react';
import { createShellScrollKeyHandlers } from './shell-scroll-keys';

type Options = {
  active: boolean;
  blocked: boolean;
  rows: () => number;
  scrollLines: (amount: number) => void;
  scrollToBottom: () => void;
};

export function useShellScrollKeys({ active, blocked, rows, scrollLines, scrollToBottom }: Options) {
  useEffect(() => {
    if (!active) return;
    const scrolling = createShellScrollKeyHandlers({ get rows() { return rows(); }, scrollLines, scrollToBottom });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || blocked) return;
      scrolling.keydown(event);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', scrolling.keyup);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', scrolling.keyup);
    };
  }, [active, blocked, rows, scrollLines, scrollToBottom]);
}
