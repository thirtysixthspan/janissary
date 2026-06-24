import React, { useRef, useState } from 'react';

type Props = {
  dotColor: string;
  history: string[];
  onSubmit: (text: string) => void;
  // Owned by App so other UI (e.g. clicking a tab) can focus the command line.
  inputRef: React.RefObject<HTMLInputElement | null>;
};

// The bottom command line. Up/Down walk this tab's history (server-provided); Enter dispatches.
// Shift+Arrow / Ctrl+T are left to the window handler (tab switch / collapse), matching the TUI.
export function CommandInput({ dotColor, history, onSubmit, inputRef }: Props) {
  const [value, setValue] = useState('');
  const histIdx = useRef(-1);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Defer tab chords (Shift+Arrow switch, Ctrl+Arrow reorder) to the window handler.
    if ((e.shiftKey || e.ctrlKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    if (e.key === 'Enter') {
      const text = value.trim();
      if (text) onSubmit(text);
      setValue('');
      histIdx.current = -1;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      histIdx.current = histIdx.current === -1 ? history.length - 1 : Math.max(0, histIdx.current - 1);
      setValue(history[histIdx.current]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx.current === -1) return;
      histIdx.current += 1;
      if (histIdx.current >= history.length) { histIdx.current = -1; setValue(''); }
      else setValue(history[histIdx.current]);
    }
  };

  return (
    <div className="command" onClick={() => inputRef.current?.focus()}>
      <span className="dot" style={{ color: dotColor }}>●</span>
      <span>❯</span>
      <input
        ref={inputRef}
        value={value}
        autoFocus
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
