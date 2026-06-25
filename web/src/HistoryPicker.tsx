import React from 'react';

// The Ctrl+R / `hist` overlay listing the tab's most frequent history entries. Up/Down move the
// selection, Return runs the selected command, Escape closes — handled by App's key handler; a
// row can also be clicked to run it.
type Properties = { items: string[]; selected: number; onPick: (command: string) => void };

export function HistoryPicker({ items, selected, onPick }: Properties) {
  return (
    <div className="picker">
      <div className="picker-title">history</div>
      {items.length === 0 ? (
        <div className="picker-row picker-empty">(no history)</div>
      ) : (
        items.map((command, index) => (
          <div
            key={index}
            className={`picker-row${index === selected ? ' selected' : ''}`}
            onClick={() => onPick(command)}
          >
            {command}
          </div>
        ))
      )}
    </div>
  );
}
