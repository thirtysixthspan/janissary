import React from 'react';
import { displayLine } from '../display-line';

// The Ctrl+R / `hist` overlay listing the tab's most frequent history entries. Up/Down move the
// selection, Return runs the selected command, Escape closes — handled by the app's key handler; a
// row can also be clicked to pick it.
type Properties = {
  items: string[];
  selected: number;
  onPick: (command: string) => void;
  className?: string;
  emptyMessage?: string;
};

export function HistoryPicker({
  items, selected, onPick, className, emptyMessage = '(no history)',
}: Properties) {
  return (
    <div className={`picker${className ? ` ${className}` : ''}`} data-doc-shot="history-overlay">
      <div className="picker-title">history</div>
      {items.length === 0 ? (
        <div className="picker-row picker-empty">{emptyMessage}</div>
      ) : (
        items.map((command, index) => {
          const { label, postfix } = displayLine(command);
          return (
            <div
              key={index}
              className={`picker-row history-row${index === selected ? ' selected' : ''}`}
              onClick={() => onPick(command)}
            >
              <span className="history-label">{label}</span>
              {postfix && <span className="history-lines">{postfix}</span>}
            </div>
          );
        })
      )}
    </div>
  );
}
