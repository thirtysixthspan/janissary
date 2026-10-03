import React, { useEffect, useRef } from 'react';

// This tab's own history list, opened by the `Ctrl+R` its declaration claims.
//
// The application's own history picker is deliberately not reused: that one lists application
// commands from every tab, and this tab's history is something else — the lines this one shell was
// sent, which is the whole of its history because nothing can be typed into the terminal directly.
export function ShellHistoryPopup({ lines, onPick, onClose }: {
  lines: string[];
  onPick: (line: string) => void;
  onClose: () => void;
}) {
  const rootReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootReference.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => { globalThis.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div className="shell-history" role="dialog" aria-label="Shell history" ref={rootReference} tabIndex={-1}>
      <div className="shell-history-title">history</div>
      {lines.length === 0 ? (
        <div className="shell-history-empty">No commands sent yet</div>
      ) : lines.map((line, index) => (
        // Newest first, so the index is the identity here: two identical lines are two entries.
        <button
          type="button"
          key={`${index}-${line}`}
          className="shell-history-row"
          onClick={() => { onPick(line); }}
        >
          {line}
        </button>
      ))}
    </div>
  );
}