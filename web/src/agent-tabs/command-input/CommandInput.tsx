import React, { useRef, useState } from 'react';
import type { CompletionResult } from '@shared/protocol';
import { handleTabCompletion } from './command-completion';
import { spliceIntoTextarea } from '../../shared/command-bar/textarea-splice';
import { useCommandBarKeys } from '../../shared/command-bar/useCommandBarKeys';
import { CommandBarShell } from '../../shared/command-bar/CommandBarShell';
import type { CommandInputDropHandle } from '../../drop-handles';

export type CommandInputProperties = {
  dotColor: string;
  history: string[];
  ghostHistory: string[];
  onSubmit: (text: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  complete: (text: string, cursor: number) => Promise<CompletionResult>;
  pickerOpen: boolean;
  busy: boolean;
  autoFocus?: boolean;
  // The queue popup (Ctrl+E / `queue`) is modal for Enter/ArrowUp/ArrowDown (the window handler
  // owns those) but not for typing — the command line is the popup's sole edit surface.
  queueOpen?: boolean;
  // Assigned this component's `recall` so the queue popup can push a selected row's text into
  // the command line (the `guardRef` pattern — see `App.tsx`'s `guardRef`).
  recallRef?: React.RefObject<((text: string) => void) | null>;
  onEditQueued?: (text: string) => void;
  onDeleteQueued?: () => void;
  dropRef?: React.RefObject<CommandInputDropHandle | null>;
};

// The agent tab's command bar: the shared bar plus the modality only an agent tab has — a modal
// history picker, the queue popup, Tab completion against the server, and the file-navigator drop
// target. Every baseline key belongs to `useCommandBarKeys`, which this handler calls at the two
// points where it should take over.
export function CommandInput({
  dotColor, history, ghostHistory, onSubmit, inputRef, complete, pickerOpen, busy,
  autoFocus = true, queueOpen, recallRef, onEditQueued, onDeleteQueued, dropRef,
}: CommandInputProperties) {
  const [value, setValue] = useState('');
  const [completions, setCompletions] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const bar = useCommandBarKeys({
    value, setValue, inputRef, history, ghostHistory, onSubmit,
    onClear: () => { setCompletions([]); },
  });
  if (recallRef) recallRef.current = bar.recall;

  // Focuses the textarea before splicing: unlike a keyboard-driven insert, the caller is a
  // file-navigator drag release, so the textarea is never already the focused/selected element.
  const insertAtCaret = (text: string) => {
    const element = inputRef.current;
    if (!element) return;
    element.focus();
    spliceIntoTextarea(element, value, text);
  };

  if (dropRef) {
    dropRef.current = {
      insertAtCaret,
      setDropHighlighted: (active: boolean) => rootRef.current?.classList.toggle('drop-target', active),
    };
  }

  // While the queue popup is open: Enter/ArrowUp/ArrowDown are owned by the window handler
  // (no-op / move the selector); Backspace/Delete on an empty line deletes the selected row.
  // Returns true once handled, so the caller stops there. All other keys behave normally.
  const handleQueueOpenKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (['Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)) return true;
    if ((e.key === 'Backspace' || e.key === 'Delete') && value === '') {
      e.preventDefault();
      onDeleteQueued?.();
      return true;
    }
    return false;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (pickerOpen) return; // history picker is modal; the window handler owns the keys
    // Shift+Enter inserts a newline and Ctrl+Enter submits — both handled by the shared bar, and
    // taken ahead of the shift/ctrl guard below, which would otherwise swallow them.
    if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey)) { bar.onKeyDown(e); return; }
    // Defer tab chords (Shift+Arrow switch, Ctrl+Arrow reorder) and Shift+Up/Down (scroll) to the window handler.
    if (e.shiftKey || e.ctrlKey) return;
    if (queueOpen && handleQueueOpenKey(e)) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      handleTabCompletion(value, inputRef.current?.selectionStart ?? value.length, complete, setValue, setCompletions, inputRef);
      return;
    }
    bar.onKeyDown(e);
  };

  return (
    <CommandBarShell
      value={value}
      onChange={(next) => {
        setValue(next);
        setCompletions([]);
        if (queueOpen) onEditQueued?.(next);
      }}
      onKeyDown={onKeyDown}
      inputRef={inputRef}
      rootRef={rootRef}
      ghost={bar.ghost}
      above={completions.length > 0 ? <div className="completions">{completions.join('  ')}</div> : undefined}
      label={busy ? 'queue' : undefined}
      dotColor={dotColor}
      busy={busy}
      autoFocus={autoFocus}
    />
  );
}
