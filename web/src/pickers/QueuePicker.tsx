import React from 'react';

// The Ctrl+E / `queue` overlay listing the active tab's queued commands, front (next to run) at
// top. Up/Down move the selector and copy the selected row into the command line; the command
// line is the sole edit surface (see `handleQueueKey` / `CommandInput`'s queueOpen behavior).
// Escape closes — handled by App's key handler; a row can also be clicked to select it.
type Properties = { items: string[]; selected: number; onSelect: (index: number) => void };

export function QueuePicker({ items, selected, onSelect }: Properties) {
  return (
    <div className="picker" data-doc-shot="queue-overlay">
      <div className="picker-title">queue</div>
      {items.length === 0 ? (
        <div className="picker-row picker-empty">(no commands queued)</div>
      ) : (
        items.map((command, index) => (
          <div
            key={index}
            className={`picker-row${index === selected ? ' selected' : ''}`}
            onClick={() => onSelect(index)}
          >
            {command}
          </div>
        ))
      )}
    </div>
  );
}
