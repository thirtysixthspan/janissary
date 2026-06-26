import React, { useRef, useState } from 'react';
import type { CompletionResult } from '@shared/protocol';

type Properties = {
  dotColor: string;
  history: string[];
  onSubmit: (text: string) => void;
  // Owned by App so other UI (e.g. clicking a tab) can focus the command line.
  inputRef: React.RefObject<HTMLInputElement | null>;
  // Server-side Tab completion (paths / agent names / connections / browser subcommands).
  complete: (text: string, cursor: number) => Promise<CompletionResult>;
  // While the history picker is open it is modal, so the command line ignores keys.
  pickerOpen: boolean;
};

// The bottom command line. Up/Down walk this tab's history (server-provided); Enter dispatches;
// Tab completes. Shift+Arrow / Ctrl+T are left to the window handler (tab switch / collapse).
export function CommandInput({ dotColor, history, onSubmit, inputRef, complete, pickerOpen }: Properties) {
  const [value, setValue] = useState('');
  const [completions, setCompletions] = useState<string[]>([]);
  const histIndex = useRef(-1);

  // Recall a history entry onto the input with the cursor at its end.
  const recall = (text: string) => {
    setValue(text);
    requestAnimationFrame(() => { const element = inputRef.current; if (element) element.selectionStart = element.selectionEnd = text.length; });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (pickerOpen) return; // history picker is modal; the window handler owns the keys
    // Defer tab chords (Shift+Arrow switch, Ctrl+Arrow reorder) and Shift+Up/Down (scroll) to the window handler.
    if (e.shiftKey || e.ctrlKey) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const cursor = inputRef.current?.selectionStart ?? value.length;
      // Only complete when at least one character of the current token is typed (don't list
      // everything on an empty input or right after a space). Mirrors completeCommandLine's token.
      const before = value.slice(0, cursor);
      const token = before.slice(Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t')) + 1);
      if (token.length === 0) { setCompletions([]); return; }
      void complete(value, cursor).then((res) => {
        setValue(res.newInput);
        // A single match fills in fully; multiple matches fill the common prefix and are listed.
        setCompletions(res.matches.length > 1 ? res.matches : []);
        requestAnimationFrame(() => {
          const element = inputRef.current;
          if (element) element.selectionStart = element.selectionEnd = res.newCursor;
        });
      });
      return;
    }
    switch (e.key) {
    case 'Enter': {
      // Don't let the window key handler also see this Enter: submitting `hist` opens the picker,
      // and React flushes that state before the event bubbles to window — which would otherwise
      // immediately run the selected (most recent) entry.
      e.stopPropagation();
      const text = value.trim();
      if (text) onSubmit(text);
      setValue('');
      setCompletions([]);
      histIndex.current = -1;
    
    break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      if (history.length === 0) return;
      histIndex.current = histIndex.current === -1 ? history.length - 1 : Math.max(0, histIndex.current - 1);
      recall(history[histIndex.current]);
    
    break;
    }
    case 'ArrowDown': {
      e.preventDefault();
      if (histIndex.current === -1) return;
      histIndex.current += 1;
      if (histIndex.current >= history.length) { histIndex.current = -1; setValue(''); }
      else recall(history[histIndex.current]);
    
    break;
    }
    // No default
    }
  };

  return (
    <div className="command-area">
      {completions.length > 0 && <div className="completions">{completions.join('  ')}</div>}
      <div className="command" onClick={() => inputRef.current?.focus()}>
        <span className="dot" style={{ color: dotColor }}>●</span>
        <span>❯</span>
        <input
          ref={inputRef}
          value={value}
          autoFocus
          spellCheck={false}
          onChange={(e) => { setValue(e.target.value); setCompletions([]); }}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
