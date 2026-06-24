import React from 'react';

// The Ctrl+R / `hist` overlay listing the tab's most frequent history entries. Up/Down move the
// selection, Return runs the selected command, Escape closes — handled by App's key handler; a
// row can also be clicked to run it.
type Props = { items: string[]; selected: number; onPick: (cmd: string) => void };

export function HistoryPicker({ items, selected, onPick }: Props) {
  return (
    <div className="picker">
      <div className="picker-title">history</div>
      {items.length === 0 ? (
        <div className="picker-row picker-empty">(no history)</div>
      ) : (
        items.map((cmd, i) => (
          <div
            key={i}
            className={`picker-row${i === selected ? ' selected' : ''}`}
            onClick={() => onPick(cmd)}
          >
            {cmd}
          </div>
        ))
      )}
    </div>
  );
}
