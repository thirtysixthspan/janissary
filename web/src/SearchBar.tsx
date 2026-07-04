import React from 'react';
import type { SearchStatus } from './useTranscriptSearch';

type Position = { current: number; total: number };

type Properties = {
  pattern: string;
  status: SearchStatus;
  position: Position | null;
  currentText: string | null;
  onChange: (pattern: string) => void;
  onStepOlder: () => void;
  onStepNewer: () => void;
  onClose: () => void;
  commandInputRef: React.RefObject<HTMLInputElement | null>;
};

function resultText(status: SearchStatus, position: Position | null, currentText: string | null): string | null {
  if (status === 'empty') return null;
  if (status === 'invalid') return 'Invalid pattern';
  if (status === 'no-match') return 'No matches';
  return `${position ? `${position.current}/${position.total}  ` : ''}${currentText ?? ''}`;
}

// The command bar's search-mode replacement: a pattern input plus a result line showing the
// current match (or a "No matches"/"Invalid pattern" state). Its own arrow/Escape/Enter handling
// stops propagation so the window key handler and transcript scroll never see these keystrokes.
export function SearchBar({ pattern, status, position, currentText, onChange, onStepOlder, onStepNewer, onClose, commandInputRef }: Properties) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'ArrowUp') { e.preventDefault(); onStepOlder(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); onStepNewer(); return; }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); commandInputRef.current?.focus(); return; }
    if (e.key === 'Enter') e.preventDefault();
  };

  const result = resultText(status, position, currentText);

  return (
    <div className="command-area search-bar">
      {result !== null && <div className="search-result">{result}</div>}
      <div className="command">
        <span>/</span>
        <div className="input-wrap">
          <input
            value={pattern}
            autoFocus
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  );
}
