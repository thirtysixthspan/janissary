import React, { useEffect, useState } from 'react';

// This tab's own history list, opened by the `Ctrl+R` its declaration claims.
//
// The application's own history picker is deliberately not reused: that one lists application
// commands from every tab, and this tab's history is something else — the lines this one shell was
// sent, which is the whole of its history because nothing can be typed into the terminal directly.
//
// It never takes focus, for the same reason the application's picker does not: the command bar keeps
// the keyboard and this list's window listener answers the four keys a list needs. Taking focus and
// then handing it back on close is what used to leave a recalled line with nowhere to be edited.
export function ShellHistoryPopup({ lines, onPick, onClose }: {
  lines: string[];
  onPick: (line: string) => void;
  onClose: () => void;
}) {
  // Newest first, so index 0 is the last thing sent — the row the application's picker opens on.
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const last = Math.max(0, lines.length - 1);
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((index) => Math.min(index + 1, last)); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((index) => Math.max(index - 1, 0)); return; }
      if (event.key === 'Enter') {
        event.preventDefault();
        const line = lines[selected];
        if (line !== undefined) onPick(line);
        return;
      }
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => { globalThis.removeEventListener('keydown', onKey); };
  }, [lines, selected, onPick, onClose]);

  return (
    <div className="shell-history" role="dialog" aria-label="Shell history">
      <div className="shell-history-title">history</div>
      {lines.length === 0 ? (
        <div className="shell-history-empty">No commands sent yet</div>
      ) : lines.map((line, index) => (
        // Newest first, so the index is the identity here: two identical lines are two entries.
        <button
          type="button"
          key={`${index}-${line}`}
          className={`shell-history-row${index === selected ? ' selected' : ''}`}
          onClick={() => { onPick(line); }}
        >
          {line}
        </button>
      ))}
    </div>
  );
}