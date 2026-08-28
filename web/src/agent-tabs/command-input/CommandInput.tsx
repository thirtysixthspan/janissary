import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { CompletionResult } from '@shared/protocol';
import { statusDotIcon, promptIcon } from '../../icons';
import { handleTabCompletion } from './command-completion';
import { findGhostSuggestion } from './ghost-suggestion';
import { isCaretOnFirstLine, isCaretOnLastLine } from './command-caret-lines';
import { spliceIntoTextarea } from './textarea-splice';
import { useCommandHistoryRecall } from './useCommandHistoryRecall';
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

export function CommandInput({
  dotColor, history, ghostHistory, onSubmit, inputRef, complete, pickerOpen, busy,
  autoFocus = true, queueOpen, recallRef, onEditQueued, onDeleteQueued, dropRef,
}: CommandInputProperties) {
  const [value, setValue] = useState('');
  const [completions, setCompletions] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const ghost = findGhostSuggestion(ghostHistory, value);

  // Auto-resize: shrink to one row first so `scrollHeight` reflects the actual content, then
  // grow to fit. Runs after every value change (typing, paste, history recall, ghost accept,
  // Shift+Enter newline, submit-clear).
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = '0';
    element.style.height = `${element.scrollHeight}px`;
  }, [value, inputRef]);

  const recall = (text: string) => {
    setValue(text);
    requestAnimationFrame(() => { const element = inputRef.current; if (element) element.selectionStart = element.selectionEnd = text.length; });
  };
  if (recallRef) recallRef.current = recall;

  const { recallOlder, recallNewer, reset: resetHistoryWalk } = useCommandHistoryRecall(history, recall);

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

  const submit = () => {
    const text = value.trim();
    // Clear before calling onSubmit: a client-intercepted command (e.g. `queue`) may
    // synchronously populate the command line again (selecting the front queued entry), and
    // that write must win over this clear rather than being stomped by it.
    setValue('');
    setCompletions([]);
    resetHistoryWalk();
    if (text) onSubmit(text);
  };

  const insertNewline = () => {
    const element = inputRef.current;
    if (!element) return;
    spliceIntoTextarea(element, value, '\n');
  };

  const handleArrowUpKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Off the first line, native ArrowUp moves the caret up one line instead.
    if (!isCaretOnFirstLine(value, inputRef.current?.selectionStart)) return;
    e.preventDefault();
    recallOlder(value);
  };

  const handleArrowDownKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Off the last line, native ArrowDown moves the caret down one line instead.
    if (!isCaretOnLastLine(value, inputRef.current?.selectionStart)) return;
    e.preventDefault();
    recallNewer();
  };

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
    // Shift+Enter inserts a newline and Ctrl+Enter submits — both ahead of the shift/ctrl guard
    // below, which would otherwise swallow them.
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); insertNewline(); return; }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); e.stopPropagation(); submit(); return; }
    // Defer tab chords (Shift+Arrow switch, Ctrl+Arrow reorder) and Shift+Up/Down (scroll) to the window handler.
    if (e.shiftKey || e.ctrlKey) return;
    if (queueOpen && handleQueueOpenKey(e)) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      handleTabCompletion(value, inputRef.current?.selectionStart ?? value.length, complete, setValue, setCompletions, inputRef);
      return;
    }
    switch (e.key) {
    case 'Enter': {
      // Don't let the window key handler also see this Enter: submitting `hist` opens the picker,
      // and React flushes that state before the event bubbles to window — which would otherwise
      // immediately run the selected (most recent) entry.
      e.preventDefault();
      e.stopPropagation();
      submit();

    break;
    }
    case 'ArrowUp': {
      handleArrowUpKey(e);

    break;
    }
    case 'ArrowDown': {
      handleArrowDownKey(e);

    break;
    }
    case 'ArrowRight': case 'End': {
      const element = inputRef.current;
      if (ghost && element && element.selectionStart === value.length && element.selectionEnd === value.length) {
        e.preventDefault();
        recall(ghost);
        setCompletions([]);
      }

    break;
    }
    // No default
    }
  };

  return (
    <div className="command-area" data-doc-shot="command-bar" data-command-bar ref={rootRef}>
      {completions.length > 0 && <div className="completions">{completions.join('  ')}</div>}
      <div className="command" onClick={() => inputRef.current?.focus()}>
        <span className={`dot${busy ? ' busy' : ''}`} style={{ color: dotColor }}><FontAwesomeIcon icon={statusDotIcon} /></span>
        <span>{busy ? <>queue <FontAwesomeIcon icon={promptIcon} /></> : <FontAwesomeIcon icon={promptIcon} />}</span>
        <div className="input-wrap">
          {ghost && (
            <span className="ghost" aria-hidden="true">
              <span className="ghost-typed">{value}</span>{ghost.slice(value.length)}
            </span>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            autoFocus={autoFocus}
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setCompletions([]);
              if (queueOpen) onEditQueued?.(e.target.value);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  );
}
