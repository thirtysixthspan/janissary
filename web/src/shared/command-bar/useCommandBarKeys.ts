import type React from 'react';
import { findGhostSuggestion } from './ghost-suggestion';
import { isCaretOnFirstLine, isCaretOnLastLine } from './command-caret-lines';
import { spliceIntoTextarea } from './textarea-splice';
import { useCommandHistoryRecall } from './useCommandHistoryRecall';

export type CommandBarKeysParameters = {
  value: string;
  setValue: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  // Walked by ArrowUp/ArrowDown, oldest first.
  history: string[];
  // Searched for the inline ghost completion, oldest first. Defaults to `history` — the agent bar
  // is the one caller that separates them, recalling its own tab's commands while completing from
  // every tab's.
  ghostHistory?: string[];
  onSubmit: (text: string) => void;
  // Called whenever the bar clears itself, whether or not there was text to submit — the agent bar
  // drops its completion strip here.
  onClear?: () => void;
};

export type CommandBarKeys = {
  ghost: string | undefined;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  submit: () => void;
  insertNewline: () => void;
  recall: (text: string) => void;
  resetHistoryWalk: () => void;
};

// The command bar's baseline keymap, and the state transitions under it. An owner with keys of its
// own keeps its own handler and calls `onKeyDown` at the points where baseline handling should take
// over, rather than passing this hook a predicate about its own modality.
export function useCommandBarKeys({
  value, setValue, inputRef, history, ghostHistory, onSubmit, onClear,
}: CommandBarKeysParameters): CommandBarKeys {
  const ghost = findGhostSuggestion(ghostHistory ?? history, value);

  const recall = (text: string) => {
    setValue(text);
    requestAnimationFrame(() => { const element = inputRef.current; if (element) element.selectionStart = element.selectionEnd = text.length; });
  };

  const { recallOlder, recallNewer, reset: resetHistoryWalk } = useCommandHistoryRecall(history, recall);

  const submit = () => {
    const text = value.trim();
    // Clear before calling onSubmit: a client-intercepted command (e.g. `queue`) may
    // synchronously populate the command line again (selecting the front queued entry), and
    // that write must win over this clear rather than being stomped by it.
    setValue('');
    onClear?.();
    resetHistoryWalk();
    if (text) onSubmit(text);
  };

  const insertNewline = () => {
    const element = inputRef.current;
    if (!element) return;
    spliceIntoTextarea(element, value, '\n');
  };

  const acceptGhost = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const element = inputRef.current;
    if (!ghost || !element) return;
    if (element.selectionStart !== value.length || element.selectionEnd !== value.length) return;
    event.preventDefault();
    recall(ghost);
    onClear?.();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); insertNewline(); return; }
    // `stopPropagation` on both submitting chords: the window key handler must not also see this
    // Enter, since submitting `hist` opens the picker and React flushes that state before the event
    // bubbles to window — which would otherwise immediately run the selected entry.
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); submit(); return; }
    // Past the two Enter chords, a held modifier means the key is doing something else entirely —
    // extending a selection, moving by word, a window-level chord — and never recalling history or
    // accepting a suggestion.
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
    // Off the first/last line, native ArrowUp/ArrowDown moves the caret by a line instead.
    case 'ArrowUp': {
      if (!isCaretOnFirstLine(value, inputRef.current?.selectionStart)) return;
      event.preventDefault();
      recallOlder(value);
      return;
    }
    case 'ArrowDown': {
      if (!isCaretOnLastLine(value, inputRef.current?.selectionStart)) return;
      event.preventDefault();
      recallNewer();
      return;
    }
    case 'ArrowRight': case 'End': { acceptGhost(event); return; }
    // No default
    }
  };

  return { ghost, onKeyDown, submit, insertNewline, recall, resetHistoryWalk };
}
