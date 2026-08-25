import { useRef } from 'react';

export type CommandHistoryRecall = {
  // `draft` is the text currently in the command line, kept aside on the first step back so
  // walking past the newest entry can restore it.
  recallOlder: (draft: string) => void;
  recallNewer: () => void;
  reset: () => void;
};

// The command line's walk through its history: ArrowUp steps back from the newest entry, ArrowDown
// returns toward it and then hands back the draft the walk started from. An index of -1 means "not
// walking" — the command line holds the user's own text rather than a recalled entry — which is
// also where a submit puts it. `apply` writes a recalled entry into the command line.
export function useCommandHistoryRecall(history: string[], apply: (text: string) => void): CommandHistoryRecall {
  const index = useRef(-1);
  const draftBeforeHistory = useRef('');

  const recallOlder = (draft: string) => {
    if (history.length === 0) return;
    if (index.current === -1) draftBeforeHistory.current = draft;
    index.current = index.current === -1 ? history.length - 1 : Math.max(0, index.current - 1);
    apply(history[index.current]);
  };

  const recallNewer = () => {
    if (index.current === -1) return;
    index.current += 1;
    if (index.current >= history.length) { index.current = -1; apply(draftBeforeHistory.current); }
    else apply(history[index.current]);
  };

  const reset = () => {
    index.current = -1;
    draftBeforeHistory.current = '';
  };

  return { recallOlder, recallNewer, reset };
}
