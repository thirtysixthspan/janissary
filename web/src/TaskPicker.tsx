import React from 'react';

// The Ctrl+A / `tasks` overlay listing the executable `ai/*.md` task files. Up/Down move the
// selection, Return copies `execute ./ai/<filename>` into the command line without submitting,
// Escape closes — handled by App's key handler; a row can also be clicked to populate it.
type Properties = { items: string[]; selected: number; onPick: (task: string) => void };

export function TaskPicker({ items, selected, onPick }: Properties) {
  return (
    <div className="picker" data-doc-shot="task-overlay">
      <div className="picker-title">tasks</div>
      {items.length === 0 ? (
        <div className="picker-row picker-empty">(no tasks)</div>
      ) : (
        items.map((name, index) => (
          <div
            key={index}
            className={`picker-row${index === selected ? ' selected' : ''}`}
            onClick={() => onPick(name)}
          >
            {name.replace(/\.md$/, '')}
          </div>
        ))
      )}
    </div>
  );
}
