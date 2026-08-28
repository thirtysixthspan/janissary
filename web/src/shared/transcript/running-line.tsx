import React from 'react';

// A still-running command's output line, with the escape hatch for a program that needs a terminal
// but never announced it — a password prompt, a bare REPL. Detection promotes the obvious cases on
// its own; this is how the user promotes the rest without waiting for a signal that isn't coming.
export function RunningLine({ children, hitProps, onPromote }: {
  children: React.ReactNode;
  hitProps: Record<string, unknown>;
  onPromote: () => void;
}) {
  return (
    <div className="line output running" {...hitProps}>
      {children}
      <button
        type="button"
        className="open-in-terminal"
        title="Open in terminal (Ctrl+O)"
        onClick={onPromote}
      >open in terminal</button>
    </div>
  );
}
