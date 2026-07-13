import React, { useEffect, useRef, useState } from 'react';
import type { CompletionResult } from '@shared/protocol';
import { handleTabCompletion } from './command-completion';
import { findGhostSuggestion } from './ghost-suggestion';

export type CommandInputProperties = {
  dotColor: string;
  history: string[];
  ghostHistory: string[];
  onSubmit: (text: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  complete: (text: string, cursor: number) => Promise<CompletionResult>;
  pickerOpen: boolean;
  busy: boolean;
  // The queue popup (Ctrl+E / `queue`) is modal for Enter/ArrowUp/ArrowDown (the window handler
  // owns those) but not for typing — the command line is the popup's sole edit surface.
  queueOpen?: boolean;
  // Assigned this component's `recall` so the queue popup can push a selected row's text into
  // the command line (the `guardRef` pattern — see `App.tsx`'s `guardRef`).
  recallRef?: React.RefObject<((text: string) => void) | null>;
  onEditQueued?: (text: string) => void;
  onDeleteQueued?: () => void;
};

export function CommandInput({
  dotColor, history, ghostHistory, onSubmit, inputRef, complete, pickerOpen, busy,
  queueOpen, recallRef, onEditQueued, onDeleteQueued,
}: CommandInputProperties) {
  const [value, setValue] = useState('');
  const [completions, setCompletions] = useState<string[]>([]);
  const histIndex = useRef(-1);
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

  const submit = () => {
    const text = value.trim();
    // Clear before calling onSubmit: a client-intercepted command (e.g. `queue`) may
    // synchronously populate the command line again (selecting the front queued entry), and
    // that write must win over this clear rather than being stomped by it.
    setValue('');
    setCompletions([]);
    histIndex.current = -1;
    if (text) onSubmit(text);
  };

  const recallOlder = () => {
    if (history.length === 0) return;
    histIndex.current = histIndex.current === -1 ? history.length - 1 : Math.max(0, histIndex.current - 1);
    recall(history[histIndex.current]);
  };

  const recallNewer = () => {
    if (histIndex.current === -1) return;
    histIndex.current += 1;
    if (histIndex.current >= history.length) { histIndex.current = -1; setValue(''); }
    else recall(history[histIndex.current]);
  };

  // Insert a newline at the caret. Prefers `execCommand` — it mutates the DOM directly, fires a
  // real `input` event, and keeps a normal undo entry — falling back to manually mutating the
  // element and dispatching `input` ourselves where it's unavailable (jsdom doesn't implement it
  // at all). Either way the caret lands right after the inserted newline, synchronously — no
  // `requestAnimationFrame` round-trip, so a fast typist's next keystroke lands in the right spot.
  const insertNewline = () => {
    if (typeof document.execCommand === 'function') { document.execCommand('insertText', false, '\n'); return; }
    const element = inputRef.current;
    if (!element) return;
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? value.length;
    element.value = `${value.slice(0, start)}\n${value.slice(end)}`;
    element.selectionStart = element.selectionEnd = start + 1;
    element.dispatchEvent(new Event('input', { bubbles: true }));
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
      const element = inputRef.current;
      const onFirstLine = !value.includes('\n') || element?.selectionStart == null
        || value.lastIndexOf('\n', element.selectionStart - 1) === -1;
      if (onFirstLine) { e.preventDefault(); recallOlder(); }
      // else: native ArrowUp moves the caret up one line.

    break;
    }
    case 'ArrowDown': {
      const element = inputRef.current;
      const onLastLine = !value.includes('\n') || element?.selectionStart == null
        || !value.includes('\n', element.selectionStart);
      if (onLastLine) { e.preventDefault(); recallNewer(); }
      // else: native ArrowDown moves the caret down one line.

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
    <div className="command-area" data-doc-shot="command-bar">
      {completions.length > 0 && <div className="completions">{completions.join('  ')}</div>}
      <div className="command" onClick={() => inputRef.current?.focus()}>
        <span className={`dot${busy ? ' busy' : ''}`} style={{ color: dotColor }}>●</span>
        <span>{busy ? 'queue ❯' : '❯'}</span>
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
            autoFocus
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
